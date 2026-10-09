import { useState } from 'react';
import { fmtEUR } from '../lib/utils';

export interface Fatia {
  key: string;
  label: string;
  value: number;
  /** slot categórico 1–6 (cor fixa por entidade) ou 'outros' (cinzento) */
  slot: number | 'outros';
}

const R = 80; // raio exterior
const r = 54; // raio interior
const C = 90; // centro (viewBox 180×180)

function ponto(raio: number, ang: number): [number, number] {
  return [C + raio * Math.sin(ang), C - raio * Math.cos(ang)];
}

function arco(a0: number, a1: number): string {
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = ponto(R, a0);
  const [x1, y1] = ponto(R, a1);
  const [x2, y2] = ponto(r, a1);
  const [x3, y3] = ponto(r, a0);
  return `M${x0} ${y0} A${R} ${R} 0 ${grande} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${grande} 0 ${x3} ${y3} Z`;
}

const cor = (s: Fatia['slot']) => (s === 'outros' ? 'var(--series-other)' : `var(--series-${s})`);

/** Donut parte-do-todo (≤ 6 fatias) com legenda-tabela e tooltip por fatia. */
export default function Donut({ fatias, centroLabel }: { fatias: Fatia[]; centroLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = fatias.reduce((s, f) => s + f.value, 0);
  if (total <= 0) return null;

  let acc = 0;
  const segs = fatias.map((f) => {
    const a0 = (acc / total) * Math.PI * 2;
    acc += f.value;
    const a1 = (acc / total) * Math.PI * 2;
    return { ...f, a0, a1 };
  });
  const ativo = segs.find((s) => s.key === hover) ?? null;
  const pct = (v: number) => `${((v / total) * 100).toFixed(v / total < 0.1 ? 1 : 0)}%`;

  return (
    <div className="donut">
      <div className="donut-plot">
        <svg viewBox="0 0 180 180" role="img" aria-label={`${centroLabel}: ${fmtEUR(total)}`}>
          {segs.length === 1 ? (
            <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={cor(segs[0].slot)} strokeWidth={R - r}
              onMouseEnter={() => setHover(segs[0].key)} onMouseLeave={() => setHover(null)} />
          ) : (
            segs.map((s) => (
              <path
                key={s.key}
                d={arco(s.a0, s.a1)}
                fill={cor(s.slot)}
                stroke="var(--surface)"
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={hover && hover !== s.key ? 0.35 : 1}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
              />
            ))
          )}
        </svg>
        <div className="donut-centro" aria-hidden="true">
          <span className="donut-valor">{fmtEUR(ativo ? ativo.value : total)}</span>
          <span className="donut-lbl">{ativo ? `${ativo.label} · ${pct(ativo.value)}` : centroLabel}</span>
        </div>
      </div>
      <table className="donut-legenda">
        <tbody>
          {segs.map((s) => (
            <tr
              key={s.key}
              className={hover === s.key ? 'hl' : ''}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <td><span className="swatch" style={{ background: cor(s.slot) }} /></td>
              <td className="donut-nome">{s.label}</td>
              <td className="num">{fmtEUR(s.value)}</td>
              <td className="num muted">{pct(s.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dobra uma lista de entidades em ≤ 6 fatias: até 6 entidades mostram-se todas; acima disso, as 5 maiores + "Outros".
 * A cor e a posição seguem a ordem estável recebida (nunca o ranking), e "Outros" fica sempre no fim.
 */
export function dobrarFatias(entidades: { key: string; label: string; value: number }[]): Fatia[] {
  const comValor = entidades.filter((e) => e.value > 0);
  const n = comValor.length > 6 ? 5 : 6;
  const keysTop = new Set([...comValor].sort((a, b) => b.value - a.value).slice(0, n).map((t) => t.key));
  const fatias: Fatia[] = comValor.filter((e) => keysTop.has(e.key)).map((e, i) => ({ ...e, slot: i + 1 }));
  const resto = comValor.filter((e) => !keysTop.has(e.key));
  if (resto.length) {
    fatias.push({ key: '__outros', label: `Outros (${resto.length})`, value: resto.reduce((s, e) => s + e.value, 0), slot: 'outros' });
  }
  return fatias;
}
