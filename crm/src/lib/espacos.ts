import type { PostgrestError } from '@supabase/supabase-js';

/** Id do espaço interno na URL (/espacos/logicale) — na BD corresponde a cliente_id = null. */
export const ESPACO_INTERNO = 'logicale';

export function clienteIdDoEspaco(espaco: string): string | null {
  return espaco === ESPACO_INTERNO ? null : espaco;
}

/** A migração 20261009000000_espacos.sql ainda não foi aplicada? */
export function tabelaEmFalta(error: PostgrestError | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message);
}
