// LOGICALE CRM — Edge Function `check-missed` (dead man's switch)
// Chamada pelo pg_cron a cada 15 min via pg_net (deploy com "Verify JWT" DESLIGADO;
// auth própria: header x-cron-secret tem de bater certo com o secret CRON_SECRET).
//
// Para cada automação ativa com schedule esperado hoje cujo horário + tolerância
// já passou SEM run registada hoje → cria run `missed` + incidente + email.
// Idempotente: a própria run `missed` conta como "run de hoje", não duplica.
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
  schedule_tipo: "diaria" | "dias_uteis" | "semanal" | "custom";
  hora_esperada: string | null; // "HH:MM:SS"
  dia_semana: number | null;    // 0=domingo … 6=sábado
  tolerancia_min: number;
  clientes: { nome: string; empresa: string | null } | null;
}

/** Partes da data/hora atual em Lisboa. */
function lisbonNow(): { dateStr: string; minutesOfDay: number; dow: number } {
  const now = new Date();
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

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { dateStr: today, minutesOfDay: nowMin, dow } = lisbonNow();

  const { data: automacoes, error: autoErr } = await supabase
    .from("automacoes")
    .select("id, nome, cliente_id, schedule_tipo, hora_esperada, dia_semana, tolerancia_min, clientes(nome, empresa)")
    .eq("ativa", true)
    .neq("schedule_tipo", "custom")
    .not("hora_esperada", "is", null);
  if (autoErr) {
    console.error("query automacoes falhou:", autoErr);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }

  const missed: string[] = [];

  for (const a of (automacoes ?? []) as unknown as Automacao[]) {
    if (!dueToday(a, dow) || !a.hora_esperada) continue;

    const [h, m] = a.hora_esperada.split(":").map((n) => parseInt(n, 10));
    const expectedMin = h * 60 + m;
    // Nota: se hora_esperada + tolerância passar da meia-noite, o miss só seria
    // detetável no dia seguinte — evita-se tolerâncias tão largas.
    const deadlineMin = expectedMin + a.tolerancia_min;
    if (nowMin <= deadlineMin) continue; // ainda dentro da janela

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

    // Regista a run MISSED com started_at = hora esperada de hoje (Lisboa)
    const startedAt = new Date(Date.now() - (nowMin - expectedMin) * 60_000).toISOString();
    const { data: run, error: runErr } = await supabase
      .from("runs")
      .insert({
        automacao_id: a.id,
        estado: "missed",
        started_at: startedAt,
        mensagem: `Sem ping até ${a.hora_esperada.slice(0, 5)} + ${a.tolerancia_min} min (${today})`,
      })
      .select("id")
      .single();
    if (runErr || !run) {
      console.error(`insert run missed falhou (${a.id}):`, runErr);
      continue;
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
       <p><b>Esperada:</b> hoje às ${a.hora_esperada.slice(0, 5)} (tolerância ${a.tolerancia_min} min, ${TZ})</p>
       <p>Incidente criado — assumir no backoffice: https://www.logicale.pt/backoffice/</p>`,
    );

    missed.push(a.id);
  }

  return new Response(JSON.stringify({ ok: true, checked: automacoes?.length ?? 0, missed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
