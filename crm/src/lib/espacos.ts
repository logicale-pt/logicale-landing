/** Id do espaço interno na URL (/espacos/logicale) — na BD corresponde a cliente_id = null. */
export const ESPACO_INTERNO = 'logicale';

export function clienteIdDoEspaco(espaco: string): string | null {
  return espaco === ESPACO_INTERNO ? null : espaco;
}
