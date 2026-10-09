// LOGICALE CRM — Edge Function `check-missed` (dead man's switch)
// Chamada pelo pg_cron a cada 15 min via pg_net (deploy com "Verify JWT" DESLIGADO;
// auth própria: header x-cron-secret tem de bater certo com o secret CRON_SECRET).
//
// Diária / dias úteis / semanal: horário + tolerância já passou SEM run registada
// hoje → cria run `missed` + incidente + email (exceto se foi criada hoje depois
// da hora esperada, ou se data_inicio ainda é futura). Idempotente: a própria run `missed`
// conta como "run de hoje", não duplica.
// Periódica (a cada N min, opcionalmente só numa janela horária / dias úteis):
// passou a próxima execução esperada + tolerância sem run → `missed`. Um só alerta
// por falha: enquanto a última run for `missed` (hoje) não volta a alertar; a
// primeira run nova (ok/erro) rearma a verificação.
// Timezone: Europe/Lisbon (comparações feitas em hora local de Lisboa).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TZ = "Europe/Lisbon";

interface Automacao {
  id: string;
  nome: string;
  cliente_id: string;
  schedule_tipo: "diaria" | "dias_uteis" | "semanal" | "periodica" | "custom";
  hora_esperada: string | null; // "HH:MM:SS"
  dia_semana: number | null;    // 0=domingo … 6=sábado
  intervalo_min: number | null; // periodica
  janela_inicio: string | null; // periodica, "HH:MM:SS" (null = 00:00)
  janela_fim: string | null;    // periodica, "HH:MM:SS" (null = 23:59)
  so_dias_uteis: boolean;       // periodica
  tolerancia_min: number;
  created_at: string;
  data_inicio: string;          // "YYYY-MM-DD"
  clientes: { nome: string; empresa: string | null } | null;
}

/** Partes da data/hora de um instante (default: agora) em Lisboa. */
function lisbonNow(now = new Date()): { dateStr: string; minutesOfDay: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutesOfDay: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

function toMin(h: string): number {
  const [hh, mm] = h.split(":").map((n) => parseInt(n, 10));
  return hh * 60 + mm;
}

function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Periódica: minuto do dia (Lisboa) em que a próxima run era esperada e já passou
 * da tolerância sem chegar — ou null se está tudo em dia / fora da janela.
 */
async function periodicMissedAt(a: Automacao, today: string, nowMin: number, dow: number): Promise<number | null> {
  const passo = a.intervalo_min ?? 0;
  if (passo <= 0) return null;
  if (a.so_dias_uteis && (dow === 0 || dow === 6)) return null;
  const ini = a.janela_inicio ? toMin(a.janela_inicio) : 0;
  const fim = a.janela_fim ? toMin(a.janela_fim) : 24 * 60 - 1;
  if (nowMin < ini) return null;

  const { data: last, error } = await supabase
    .from("runs")
    .select("estado, started_at")
    .eq("automacao_id", a.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`query última run falhou (${a.id}):`, error);
    return null;
  }

  let expected = ini; // sem run hoje dentro da janela → a 1.ª era esperada no início
  const criada = lisbonNow(new Date(a.created_at));
  if (criada.dateStr === today) expected = Math.max(expected, criada.minutesOfDay + passo); // criada hoje: dá-lhe um ciclo
  if (last) {
    const l = lisbonNow(new Date(last.started_at));
    if (l.dateStr === today) {
      if (last.estado === "missed") return null; // já alertado; espera por uma run nova
      if (l.minutesOfDay >= ini - a.tolerancia_min) expected = Math.max(l.minutesOfDay + passo, ini);
    }
  }
  if (expected > fim) return null; // não há mais execuções esperadas hoje
  return nowMin > expected + a.tolerancia_min ? expected : null;
}

/** Data (YYYY-MM-DD) de um instante UTC, vista de Lisboa. */
function lisbonDateOf(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(isoUtc));
}

function dueToday(a: Automacao, dow: number): boolean {
  switch (a.schedule_tipo) {
    case "diaria": return true;
    case "dias_uteis": return dow >= 1 && dow <= 5;
    case "semanal": return a.dia_semana === dow;
    default: return false; // custom: sem schedule fixo, não é auto-verificada
  }
}

async function sendAlertEmail(subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log("RESEND_API_KEY não configurada — email de alerta não enviado:", subject);
    return;
  }
  const to = (Deno.env.get("ALERT_EMAILS") ?? "lourencomestre3@gmail.com,anthonioef@gmail.com")
    .split(",").map((e) => e.trim()).filter(Boolean);
  const from = Deno.env.get("ALERT_FROM") ?? "LogiCale CRM <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error("Resend falhou:", res.status, await res.text());
}

/** Cria run `missed` (started_at = hora esperada de hoje, Lisboa) + incidente + email. */
async function registarMissed(
  a: Automacao, expectedMin: number, nowMin: number, mensagem: string, esperadaHtml: string,
): Promise<boolean> {
  const startedAt = new Date(Date.now() - (nowMin - expectedMin) * 60_000).toISOString();
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({ automacao_id: a.id, estado: "missed", started_at: startedAt, mensagem })
    .select("id")
    .single();
  if (runErr || !run) {
    console.error(`insert run missed falhou (${a.id}):`, runErr);
    return false;
  }

  const { error: incErr } = await supabase.from("incidentes").insert({
    run_id: run.id,
    cliente_id: a.cliente_id,
    estado: "novo",
  });
  if (incErr) console.error(`insert incidente falhou (${a.id}):`, incErr);

  const clienteLabel = a.clientes
    ? `${a.clientes.nome}${a.clientes.empresa ? ` (${a.clientes.empresa})` : ""}`
    : "?";
  await sendAlertEmail(
    `⚠️ MISSED: ${a.nome} — ${clienteLabel}`,
    `<h2>Automação não correu</h2>
     <p><b>Cliente:</b> ${clienteLabel}</p>
     <p><b>Automação:</b> ${a.nome}</p>
     <p><b>Esperada:</b> ${esperadaHtml}</p>
     <p>Incidente criado — assumir no backoffice: https://www.logicale.pt/backoffice/</p>`,
  );
  return true;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { dateStr: today, minutesOfDay: nowMin, dow } = lisbonNow();

  const { data: automacoes, error: autoErr } = await supabase
    .from("automacoes")
    .select("id, nome, cliente_id, schedule_tipo, hora_esperada, dia_semana, intervalo_min, janela_inicio, janela_fim, so_dias_uteis, tolerancia_min, created_at, data_inicio, clientes(nome, empresa)")
    .eq("ativa", true)
    .neq("schedule_tipo", "custom");
  if (autoErr) {
    console.error("query automacoes falhou:", autoErr);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }

  const missed: string[] = [];

  for (const a of (automacoes ?? []) as unknown as Automacao[]) {
    if (a.data_inicio > today) continue; // ainda não começou

    if (a.schedule_tipo === "periodica") {
      const expectedMin = await periodicMissedAt(a, today, nowMin, dow);
      if (expectedMin === null) continue;
      if (await registarMissed(a, expectedMin, nowMin,
        `Sem ping desde as ${fmtMin(expectedMin)} (a cada ${a.intervalo_min} min + ${a.tolerancia_min} min de tolerância, ${today})`,
        `hoje às ${fmtMin(expectedMin)} — periódica a cada ${a.intervalo_min} min (tolerância ${a.tolerancia_min} min, ${TZ})`,
      )) missed.push(a.id);
      continue;
    }

    if (!dueToday(a, dow) || !a.hora_esperada) continue;

    const expectedMin = toMin(a.hora_esperada);
    // Nota: se hora_esperada + tolerância passar da meia-noite, o miss só seria
    // detetável no dia seguinte — evita-se tolerâncias tão largas.
    const deadlineMin = expectedMin + a.tolerancia_min;
    if (nowMin <= deadlineMin) continue; // ainda dentro da janela

    // Criada hoje depois da hora esperada → a 1.ª execução é só na próxima ocorrência
    const criada = lisbonNow(new Date(a.created_at));
    if (criada.dateStr === today && criada.minutesOfDay > expectedMin) continue;

    // Já houve run hoje (Lisboa)? Inclui runs `missed` → idempotência.
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data: recentRuns, error: runsErr } = await supabase
      .from("runs")
      .select("id, started_at")
      .eq("automacao_id", a.id)
      .gte("started_at", since);
    if (runsErr) {
      console.error(`query runs falhou (${a.id}):`, runsErr);
      continue;
    }
    const hasRunToday = (recentRuns ?? []).some((r) => lisbonDateOf(r.started_at) === today);
    if (hasRunToday) continue;

    if (await registarMissed(a, expectedMin, nowMin,
      `Sem ping até ${a.hora_esperada.slice(0, 5)} + ${a.tolerancia_min} min (${today})`,
      `hoje às ${a.hora_esperada.slice(0, 5)} (tolerância ${a.tolerancia_min} min, ${TZ})`,
    )) missed.push(a.id);
  }

  return new Response(JSON.stringify({ ok: true, checked: automacoes?.length ?? 0, missed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
