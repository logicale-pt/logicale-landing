// LOGICALE CRM — Edge Function `check-missed` (dead man's switch)
// Chamada pelo pg_cron a cada 15 min via pg_net (deploy com "Verify JWT" DESLIGADO;
// auth própria: header x-cron-secret tem de bater certo com o secret CRON_SECRET).
//
// Diária / dias úteis / semanal: cada ocorrência (dia D às hora_esperada, Lisboa) tem um
// prazo = hora esperada + tolerância, que pode cair já no dia seguinte (ex: 23:30 ± 60 →
// 00:30). Passado o prazo sem run desde o fim do prazo anterior → run `missed` + incidente
// + email (exceto se a automação foi criada depois da hora esperada, ou se data_inicio
// ainda é futura). Idempotente: a run `missed` fica com started_at = hora esperada e
// conta como run dessa ocorrência, não duplica.
// Periódica (a cada N min, opcionalmente só numa janela horária / dias úteis):
// passou a próxima execução esperada + tolerância sem run → `missed`. Um só alerta
// por falha: enquanto a última run for `missed` (hoje) não volta a alertar; a
// primeira run nova (ok/erro) rearma a verificação.
// Heartbeat: no fim de cada execução bem-sucedida grava heartbeats('check-missed') — o
// backoffice mostra um aviso se ficar parado — e, se HEARTBEAT_URL existir, pinga-o
// (ex: healthchecks.io), que avisa por email se deixar de receber pings.
// Timezone: Europe/Lisbon (comparações feitas em hora local de Lisboa).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TZ = "Europe/Lisbon";
const MIN = 60_000;
const DIA_MIN = 24 * 60;

interface Automacao {
  id: string;
  nome: string;
  cliente_id: string;
  schedule_tipo: "diaria" | "dias_uteis" | "semanal" | "periodica" | "custom";
  hora_esperada: string | null; // "HH:MM:SS"
  dia_semana: number | null;    // 0=domingo … 6=sábado
  intervalo_min: number | null; // periodica
  janela_inicio: string | null; // periodica, "HH:MM:SS" (null = 00:00)
  janela_fim: string | null;    // periodica, "HH:MM:SS", exclusivo (null = 24:00)
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

/** Instante UTC de "dia + minutos do dia" em hora de Lisboa (respeita a mudança de hora). */
function lisbonToUtc(dateStr: string, minutes: number): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const relogio = Date.UTC(y, m - 1, d, 0, minutes); // o relógio de Lisboa lido como se fosse UTC
  const offset = (t: number) => {
    const l = lisbonNow(new Date(t));
    const [ly, lm, ld] = l.dateStr.split("-").map((n) => parseInt(n, 10));
    return Date.UTC(ly, lm - 1, ld, 0, l.minutesOfDay) - Math.floor(t / MIN) * MIN;
  };
  let t = relogio - offset(relogio);
  t = relogio - offset(t); // 2.ª passagem: acerta quando o offset muda entre as duas leituras
  return new Date(t);
}

/** "YYYY-MM-DD" do dia anterior. */
function diaAnterior(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dowDe(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

function toMin(h: string): number {
  const [hh, mm] = h.split(":").map((n) => parseInt(n, 10));
  return hh * 60 + mm;
}

function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Escapa texto para HTML (nomes e mensagens vêm de fora: pings, nomes de clientes). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Comparação em tempo constante (compara os SHA-256, que têm sempre o mesmo tamanho). */
async function iguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let dif = 0;
  for (let i = 0; i < u.length; i++) dif |= u[i] ^ v[i];
  return dif === 0;
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
  const fim = a.janela_fim ? toMin(a.janela_fim) : 24 * 60; // exclusivo: 09:00–18:00 → último às 17:45
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
  if (expected >= fim) return null; // não há mais execuções esperadas hoje
  return nowMin > expected + a.tolerancia_min ? expected : null;
}

function dueOn(a: Automacao, dow: number): boolean {
  switch (a.schedule_tipo) {
    case "diaria": return true;
    case "dias_uteis": return dow >= 1 && dow <= 5;
    case "semanal": return a.dia_semana === dow;
    default: return false; // periodica/custom: tratadas à parte / sem verificação
  }
}

/**
 * Diária / dias úteis / semanal: ocorrência (dia + hora esperada) cujo prazo já passou sem run,
 * ou null. Vê a ocorrência de hoje e a de ontem — a de ontem só interessa se o prazo dela
 * passou a meia-noite (ex: 23:30 ± 60 → prazo 00:30 de hoje).
 */
async function diariaMissed(a: Automacao, hoje: string, agora: Date): Promise<{ dia: string; esperado: Date } | null> {
  if (!a.hora_esperada) return null;
  const ontem = diaAnterior(hoje);
  for (const dia of [ontem, hoje]) {
    if (dia < a.data_inicio || !dueOn(a, dowDe(dia))) continue;
    const esperado = lisbonToUtc(dia, toMin(a.hora_esperada));
    const prazo = new Date(esperado.getTime() + a.tolerancia_min * MIN);
    if (agora <= prazo) continue; // ainda dentro da tolerância
    if (dia === ontem && lisbonNow(prazo).dateStr !== hoje) continue; // prazo foi ontem → já tratada ontem
    if (new Date(a.created_at) > esperado) continue; // criada depois da hora → 1.ª execução é a próxima

    // Runs desta ocorrência = desde o fim do prazo anterior (prazo − 24 h, nunca antes da meia-noite
    // do dia D) até agora. Inclui runs atrasadas e a própria run `missed` (started_at = esperado).
    const desde = new Date(Math.max(lisbonToUtc(dia, 0).getTime(), prazo.getTime() - DIA_MIN * MIN));
    const { count, error } = await supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("automacao_id", a.id)
      .gte("started_at", desde.toISOString());
    if (error) {
      console.error(`query runs falhou (${a.id}):`, error);
      continue;
    }
    if ((count ?? 0) === 0) return { dia, esperado };
  }
  return null;
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

/** Cria run `missed` (started_at = hora esperada) + incidente + email. */
async function registarMissed(a: Automacao, startedAt: Date, mensagem: string, esperada: string): Promise<boolean> {
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({ automacao_id: a.id, estado: "missed", started_at: startedAt.toISOString(), mensagem })
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
    `⚠️ MISSED: ${a.nome} — ${clienteLabel}`.replace(/[\r\n]+/g, " "),
    `<h2>Automação não correu</h2>
     <p><b>Cliente:</b> ${escapeHtml(clienteLabel)}</p>
     <p><b>Automação:</b> ${escapeHtml(a.nome)}</p>
     <p><b>Esperada:</b> ${escapeHtml(esperada)}</p>
     <p>Incidente criado — assumir no backoffice: https://www.logicale.pt/backoffice/</p>`,
  );
  return true;
}

/** Heartbeat: grava na BD (aviso no backoffice) e pinga HEARTBEAT_URL (/fail em caso de erro). */
async function heartbeat(ok: boolean, detalhe: Record<string, unknown>): Promise<void> {
  if (ok) {
    const { error } = await supabase
      .from("heartbeats")
      .upsert({ nome: "check-missed", ultimo_ok: new Date().toISOString(), detalhe });
    if (error) console.error("heartbeat (BD) falhou:", error);
  }
  const url = Deno.env.get("HEARTBEAT_URL");
  if (!url) return;
  try {
    await fetch(ok ? url : `${url.replace(/\/+$/, "")}/fail`, { method: "POST", body: JSON.stringify(detalhe) });
  } catch (e) {
    console.error("heartbeat (HEARTBEAT_URL) falhou:", e);
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || !(await iguais(req.headers.get("x-cron-secret") ?? "", secret))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const agora = new Date();
  const { dateStr: today, minutesOfDay: nowMin, dow } = lisbonNow(agora);

  const { data: automacoes, error: autoErr } = await supabase
    .from("automacoes")
    .select("id, nome, cliente_id, schedule_tipo, hora_esperada, dia_semana, intervalo_min, janela_inicio, janela_fim, so_dias_uteis, tolerancia_min, created_at, data_inicio, clientes(nome, empresa)")
    .eq("ativa", true)
    .neq("schedule_tipo", "custom");
  if (autoErr) {
    console.error("query automacoes falhou:", autoErr);
    await heartbeat(false, { erro: autoErr.message });
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }

  const missed: string[] = [];

  for (const a of (automacoes ?? []) as unknown as Automacao[]) {
    if (a.schedule_tipo === "periodica") {
      if (a.data_inicio > today) continue; // ainda não começou
      const expectedMin = await periodicMissedAt(a, today, nowMin, dow);
      if (expectedMin === null) continue;
      if (await registarMissed(a, lisbonToUtc(today, expectedMin),
        `Sem ping desde as ${fmtMin(expectedMin)} (a cada ${a.intervalo_min} min + ${a.tolerancia_min} min de tolerância, ${today})`,
        `hoje às ${fmtMin(expectedMin)} — periódica a cada ${a.intervalo_min} min (tolerância ${a.tolerancia_min} min, ${TZ})`,
      )) missed.push(a.id);
      continue;
    }

    const falha = await diariaMissed(a, today, agora);
    if (!falha) continue;
    const hora = a.hora_esperada!.slice(0, 5);
    const quando = falha.dia === today ? "hoje" : `ontem (${falha.dia})`;
    if (await registarMissed(a, falha.esperado,
      `Sem ping até ${hora} + ${a.tolerancia_min} min (${falha.dia})`,
      `${quando} às ${hora} (tolerância ${a.tolerancia_min} min, ${TZ})`,
    )) missed.push(a.id);
  }

  await heartbeat(true, { checked: automacoes?.length ?? 0, missed: missed.length });

  return new Response(JSON.stringify({ ok: true, checked: automacoes?.length ?? 0, missed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
