import type { Automacao, ScheduleTipo, TipoEntrega } from '../lib/types';
import { DIAS_SEMANA } from '../lib/utils';

/** Draft editável de uma automação (strings para inputs controlados). */
export interface AutomacaoDraft {
  nome: string;
  descricao: string;
  tipo_entrega: TipoEntrega;
  preco_mensal: string;
  schedule_tipo: ScheduleTipo;
  hora_esperada: string; // "HH:MM"
  dia_semana: number;
  tolerancia_min: string;
}

export function emptyDraft(): AutomacaoDraft {
  return {
    nome: '',
    descricao: '',
    tipo_entrega: 'cowork',
    preco_mensal: '',
    schedule_tipo: 'diaria',
    hora_esperada: '09:00',
    dia_semana: 1,
    tolerancia_min: '60',
  };
}

export function draftFromAutomacao(a: Automacao): AutomacaoDraft {
  return {
    nome: a.nome,
    descricao: a.descricao ?? '',
    tipo_entrega: a.tipo_entrega,
    preco_mensal: String(a.preco_mensal),
    schedule_tipo: a.schedule_tipo,
    hora_esperada: a.hora_esperada ? a.hora_esperada.slice(0, 5) : '09:00',
    dia_semana: a.dia_semana ?? 1,
    tolerancia_min: String(a.tolerancia_min),
  };
}

/** Campos da automação para insert/update (sem token_hash/cliente_id). */
export function draftToRow(d: AutomacaoDraft) {
  const semSchedule = d.schedule_tipo === 'custom';
  return {
    nome: d.nome.trim(),
    descricao: d.descricao.trim() || null,
    tipo_entrega: d.tipo_entrega,
    preco_mensal: parseFloat(d.preco_mensal) || 0,
    schedule_tipo: d.schedule_tipo,
    hora_esperada: semSchedule ? null : d.hora_esperada || null,
    dia_semana: d.schedule_tipo === 'semanal' ? d.dia_semana : null,
    tolerancia_min: parseInt(d.tolerancia_min, 10) || 60,
  };
}

export function draftValido(d: AutomacaoDraft): boolean {
  return d.nome.trim().length > 0 && parseFloat(d.preco_mensal) >= 0 && d.preco_mensal !== '';
}

export default function AutomacaoFields({
  draft,
  onChange,
}: {
  draft: AutomacaoDraft;
  onChange: (d: AutomacaoDraft) => void;
}) {
  const set = (patch: Partial<AutomacaoDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Nome *</label>
          <input value={draft.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="ex: Relatório diário de stock" />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={draft.tipo_entrega} onChange={(e) => set({ tipo_entrega: e.target.value as TipoEntrega })}>
            <option value="cowork">Cowork</option>
            <option value="routine">Routine</option>
            <option value="vm">VM</option>
          </select>
        </div>
        <div className="field">
          <label>Preço mensal (€) *</label>
          <input
            type="number" min="0" step="0.01"
            value={draft.preco_mensal}
            onChange={(e) => set({ preco_mensal: e.target.value })}
            placeholder="150"
          />
        </div>
      </div>
      <div className="field">
        <label>Descrição</label>
        <input value={draft.descricao} onChange={(e) => set({ descricao: e.target.value })} />
      </div>
      <div className="row">
        <div className="field">
          <label>Schedule</label>
          <select value={draft.schedule_tipo} onChange={(e) => set({ schedule_tipo: e.target.value as ScheduleTipo })}>
            <option value="diaria">Diária</option>
            <option value="dias_uteis">Dias úteis</option>
            <option value="semanal">Semanal</option>
            <option value="custom">Custom (sem verificação de missed)</option>
          </select>
        </div>
        {draft.schedule_tipo === 'semanal' && (
          <div className="field">
            <label>Dia da semana</label>
            <select value={draft.dia_semana} onChange={(e) => set({ dia_semana: parseInt(e.target.value, 10) })}>
              {DIAS_SEMANA.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}
        {draft.schedule_tipo !== 'custom' && (
          <>
            <div className="field">
              <label>Hora esperada</label>
              <input type="time" value={draft.hora_esperada} onChange={(e) => set({ hora_esperada: e.target.value })} />
            </div>
            <div className="field">
              <label>Tolerância (min)</label>
              <input
                type="number" min="5" step="5"
                value={draft.tolerancia_min}
                onChange={(e) => set({ tolerancia_min: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
