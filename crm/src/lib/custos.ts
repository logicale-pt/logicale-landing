import type { Custo } from './types';

export const CATEGORIA_LABEL: Record<Custo['categoria'], string> = {
  ferramenta: 'Ferramenta / SaaS',
  ia: 'IA / APIs',
  infraestrutura: 'Infraestrutura',
  servico: 'Serviço',
  outro: 'Outro',
};

export const PERIODICIDADE_LABEL: Record<Custo['periodicidade'], string> = {
  mensal: 'mensal',
  anual: 'anual',
  unico: 'único',
};

/** O custo está ativo no mês "YYYY-MM-01"? (início ≤ fim do mês e sem fim antes do mês) */
function ativoNoMes(c: Custo, mesISO: string): boolean {
  const mes = mesISO.slice(0, 7);
  if (c.data_inicio.slice(0, 7) > mes) return false;
  if (c.data_fim && c.data_fim.slice(0, 7) < mes) return false;
  return true;
}

/** Quanto este custo pesa no mês indicado: mensal → valor, anual → valor/12, único → valor só no mês de início. */
export function custoNoMes(c: Custo, mesISO: string): number {
  const v = Number(c.valor);
  if (c.periodicidade === 'unico') return c.data_inicio.slice(0, 7) === mesISO.slice(0, 7) ? v : 0;
  if (!ativoNoMes(c, mesISO)) return 0;
  return c.periodicidade === 'anual' ? v / 12 : v;
}

/** Custo recorrente mensal (exclui pontuais) — o número comparável ao MRR. */
export function custoRecorrenteMensal(c: Custo, mesISO: string): number {
  return c.periodicidade === 'unico' ? 0 : custoNoMes(c, mesISO);
}

export function somaMes(custos: Custo[], mesISO: string, recorrenteApenas = false): number {
  const f = recorrenteApenas ? custoRecorrenteMensal : custoNoMes;
  return custos.reduce((s, c) => s + f(c, mesISO), 0);
}
