import { PING_URL } from './supabase';
import type { Automacao, ScheduleTipo } from './types';

export const ASSIGNEES = ['Lourenço', 'António'] as const;

const EMAIL_TO_NAME: Record<string, string> = {
  'lourencomestre3@gmail.com': 'Lourenço',
  'anthonioef@gmail.com': 'António',
};

export function nameFromEmail(email: string | undefined | null): string {
  if (!email) return '?';
  return EMAIL_TO_NAME[email.toLowerCase()] ?? email.split('@')[0];
}

// ---------- tokens de ping ----------

export function generatePingToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function curlSnippet(token: string): string {
  return [
    `curl -X POST ${PING_URL} \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"estado":"ok","duracao_seg":12,"custo":0.05,"mensagem":"resumo curto"}'`,
  ].join('\n');
}

// ---------- formatação ----------

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export function fmtEUR(n: number | null | undefined): string {
  return eur.format(n ?? 0);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Tempo relativo curto: "agora", "há 5 min", "há 2 h", "ontem", ou data. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dias`;
  return fmtDate(iso);
}

export function hora(h: string | null): string {
  return h ? h.slice(0, 5) : '—';
}

export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const SCHEDULE_LABEL: Record<ScheduleTipo, string> = {
  diaria: 'diária',
  dias_uteis: 'dias úteis',
  semanal: 'semanal',
  custom: 'custom',
};

export function scheduleLabel(a: Pick<Automacao, 'schedule_tipo' | 'hora_esperada' | 'dia_semana' | 'tolerancia_min'>): string {
  const base = SCHEDULE_LABEL[a.schedule_tipo];
  if (a.schedule_tipo === 'custom') return base;
  const dia = a.schedule_tipo === 'semanal' && a.dia_semana != null ? ` (${DIAS_SEMANA[a.dia_semana]})` : '';
  return `${base}${dia} às ${hora(a.hora_esperada)} ±${a.tolerancia_min}min`;
}

/** Próxima execução esperada (hora local — Portugal ⇒ Europe/Lisbon). */
export function proximoEsperado(a: Pick<Automacao, 'schedule_tipo' | 'hora_esperada' | 'dia_semana' | 'ativa'>): Date | null {
  if (!a.ativa || a.schedule_tipo === 'custom' || !a.hora_esperada) return null;
  const [h, m] = a.hora_esperada.split(':').map((n) => parseInt(n, 10));
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m, 0, 0);
    if (d <= now) continue;
    const dow = d.getDay();
    if (a.schedule_tipo === 'diaria') return d;
    if (a.schedule_tipo === 'dias_uteis' && dow >= 1 && dow <= 5) return d;
    if (a.schedule_tipo === 'semanal' && a.dia_semana === dow) return d;
  }
  return null;
}

// ---------- meses (financeiro) ----------

/** "YYYY-MM-01" do mês corrente com offset. */
export function monthISO(offset = 0): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthLabel(mesISO: string): string {
  const [y, m] = mesISO.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
