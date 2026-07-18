// LOGICALE CRM — Edge Function `ping`
// POST público com auth própria (deploy com "Verify JWT" DESLIGADO).
//   Authorization: Bearer <token-da-automacao>
//   Body: { estado: "ok"|"erro", duracao_seg?, custo?, mensagem? }
// Valida o token contra automacoes.token_hash (SHA-256), insere a run;
// se erro → cria incidente + email de alerta (Resend, se RESEND_API_KEY existir).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RATE_LIMIT_PER_MIN = 10;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "missing token" });

  const tokenHash = await sha256Hex(token);
  const { data: auto, error: autoErr } = await supabase
    .from("automacoes")
    .select("id, nome, ativa, cliente_id, clientes(nome, empresa)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (autoErr) {
    console.error("lookup falhou:", autoErr);
    return json(500, { error: "internal" });
  }
  if (!auto || !auto.ativa) return json(401, { error: "invalid token" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const estado = body.estado;
  if (estado !== "ok" && estado !== "erro") {
    return json(400, { error: 'estado must be "ok" or "erro"' });
  }
  const duracaoSeg = typeof body.duracao_seg === "number" ? body.duracao_seg : null;
  const custo = typeof body.custo === "number" ? body.custo : null;
  const mensagem = typeof body.mensagem === "string" ? body.mensagem.slice(0, 2000) : null;

  // Rate-limit básico: máx N runs/minuto por automação
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("automacao_id", auto.id)
    .gte("created_at", oneMinAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_MIN) return json(429, { error: "rate limit exceeded" });

  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({
      automacao_id: auto.id,
      estado,
      started_at: new Date().toISOString(),
      duracao_seg: duracaoSeg,
      custo,
      mensagem,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    console.error("insert run falhou:", runErr);
    return json(500, { error: "internal" });
  }

  if (estado === "erro") {
    const { error: incErr } = await supabase.from("incidentes").insert({
      run_id: run.id,
      cliente_id: auto.cliente_id,
      estado: "novo",
    });
    if (incErr) console.error("insert incidente falhou:", incErr);

    const cliente = (auto as unknown as { clientes: { nome: string; empresa: string | null } }).clientes;
    const clienteLabel = cliente ? `${cliente.nome}${cliente.empresa ? ` (${cliente.empresa})` : ""}` : "?";
    await sendAlertEmail(
      `🔴 ERRO: ${auto.nome} — ${clienteLabel}`,
      `<h2>Automação falhou</h2>
       <p><b>Cliente:</b> ${clienteLabel}</p>
       <p><b>Automação:</b> ${auto.nome}</p>
       <p><b>Mensagem:</b> ${mensagem ?? "(sem mensagem)"}</p>
       <p>Incidente criado — assumir no backoffice: https://www.logicale.pt/backoffice/</p>`,
    );
  }

  return json(200, { ok: true, run_id: run.id });
});
