import type { Automacao, ScheduleTipo, TipoEntrega } from '../lib/types';
import { DIAS_SEMANA, fmtIntervalo } from '../lib/utils';

/** Draft editável de uma automação (strings para inputs controlados). */
export interface AutomacaoDraft {
  nome: string;
  descricao: string;
  tipo_entrega: TipoEntrega;
  preco_mensal: string;
  schedule_tipo: ScheduleTipo;
  hora_esperada: string; // "HH:MM"
  dia_semana: number;
  intervalo_min: string;
  janela_inicio: string; // "HH:MM" ou '' (sem janela)
  janela_fim: string;
  so_dias_uteis: boolean;
  tolerancia_min: string;
}

export const INTERVALOS_COMUNS = [5, 10, 15, 30, 60, 120];

export function emptyDraft(): AutomacaoDraft {
  return {
    nome: '',
    descricao: '',
    tipo_entrega: 'cowork',
    preco_mensal: '',
    schedule_tipo: 'diaria',
    hora_esperada: '09:00',
    dia_semana: 1,
    intervalo_min: '15',
    janela_inicio: '',
    janela_fim: '',
    so_dias_uteis: false,
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
    intervalo_min: String(a.intervalo_min ?? 15),
    janela_inicio: a.janela_inicio ? a.janela_inicio.slice(0, 5) : '',
    janela_fim: a.janela_fim ? a.janela_fim.slice(0, 5) : '',
    so_dias_uteis: a.so_dias_uteis ?? false,
    tolerancia_min: String(a.tolerancia_min),
  };
}

/** Campos da automação para insert/update (sem token_hash/cliente_id). */
export function draftToRow(d: AutomacaoDraft) {
  const semSchedule = d.schedule_tipo === 'custom';
  const periodica = d.schedule_tipo === 'periodica';
  return {
    nome: d.nome.trim(),
    descricao: d.descricao.trim() || null,
    tipo_entrega: d.tipo_entrega,
    preco_mensal: parseFloat(d.preco_mensal) || 0,
    schedule_tipo: d.schedule_tipo,
    hora_esperada: semSchedule || periodica ? null : d.hora_esperada || null,
    dia_semana: d.schedule_tipo === 'semanal' ? d.dia_semana : null,
    intervalo_min: periodica ? parseInt(d.intervalo_min, 10) : null,
    janela_inicio: periodica ? d.janela_inicio || null : null,
    janela_fim: periodica ? d.janela_fim || null : null,
    so_dias_uteis: periodica && d.so_dias_uteis,
    tolerancia_min: parseInt(d.tolerancia_min, 10) || 60,
  };
}

/** Mensagem de erro do schedule periódico, ou null se estiver válido. */
export function erroPeriodica(d: AutomacaoDraft): string | null {
  if (d.schedule_tipo !== 'periodica') return null;
  const n = parseInt(d.intervalo_min, 10);
  if (!(n >= 5 && n <= 720)) return 'O intervalo tem de estar entre 5 e 720 minutos.';
  if (d.janela_inicio && d.janela_fim && d.janela_inicio >= d.janela_fim) return 'A janela tem de acabar depois de começar.';
  return null;
}

export const TOLERANCIA_MAX = 720;

/** Mensagem de erro da tolerância, ou null se estiver válida (custom não tem tolerância). */
export function erroTolerancia(d: AutomacaoDraft): string | null {
  if (d.schedule_tipo === 'custom') return null;
  const n = Number(d.tolerancia_min);
  if (!Number.isInteger(n) || n < 1 || n > TOLERANCIA_MAX) return `A tolerância tem de estar entre 1 e ${TOLERANCIA_MAX} minutos.`;
  return null;
}

/** Hora (HH:MM) do prazo do dia seguinte, se hora esperada + tolerância passar da meia-noite. */
function prazoDiaSeguinte(d: AutomacaoDraft): string | null {
  if (d.schedule_tipo === 'custom' || d.schedule_tipo === 'periodica' || !d.hora_esperada || erroTolerancia(d)) return null;
  const [h, m] = d.hora_esperada.split(':').map((n) => parseInt(n, 10));
  const fim = h * 60 + m + Number(d.tolerancia_min);
  if (fim < 24 * 60) return null;
  const r = fim - 24 * 60;
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}

export function draftValido(d: AutomacaoDraft): boolean {
  return d.nome.trim().length > 0 && parseFloat(d.preco_mensal) >= 0 && d.preco_mensal !== '' && !erroPeriodica(d) && !erroTolerancia(d);
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
            <option value="periodica">Periódica</option>
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
        {draft.schedule_tipo === 'periodica' && (
          <div className="field">
            <label>A cada (min)</label>
            <input
              type="number" min="5" max="720" step="5" list="intervalos-comuns"
              value={draft.intervalo_min}
              onChange={(e) => set({ intervalo_min: e.target.value })}
            />
            <datalist id="intervalos-comuns">
              {INTERVALOS_COMUNS.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
        )}
        {draft.schedule_tipo !== 'custom' && (
          <>
            {draft.schedule_tipo !== 'periodica' && (
              <div className="field">
                <label>Hora esperada</label>
                <input type="time" value={draft.hora_esperada} onChange={(e) => set({ hora_esperada: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label>Tolerância (min)</label>
              <input
                type="number" min="1" max={TOLERANCIA_MAX} step="5"
                value={draft.tolerancia_min}
                onChange={(e) => set({ tolerancia_min: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
      {erroTolerancia(draft) && <p className="error-msg" style={{ margin: '-4px 0 10px' }}>{erroTolerancia(draft)}</p>}
      {prazoDiaSeguinte(draft) && (
        <p className="small muted" style={{ margin: '-4px 0 10px' }}>
          O prazo passa da meia-noite: se não houver ping, o alerta chega no dia seguinte às {prazoDiaSeguinte(draft)} (+ até 15 min do ciclo de verificação).
        </p>
      )}
      {draft.schedule_tipo === 'periodica' && <JanelaPeriodica draft={draft} set={set} />}
    </>
  );
}

function JanelaPeriodica({ draft, set }: { draft: AutomacaoDraft; set: (p: Partial<AutomacaoDraft>) => void }) {
  const comJanela = draft.janela_inicio !== '' || draft.janela_fim !== '';
  const erro = erroPeriodica(draft);
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={comJanela}
              onChange={(e) => set(e.target.checked ? { janela_inicio: '09:00', janela_fim: '18:00' } : { janela_inicio: '', janela_fim: '' })}
            />
            Só entre certas horas
          </label>
        </div>
        {comJanela && (
          <>
            <div className="field">
              <label>Das</label>
              <input type="time" value={draft.janela_inicio} onChange={(e) => set({ janela_inicio: e.target.value })} />
            </div>
            <div className="field">
              <label>Até às</label>
              <input type="time" value={draft.janela_fim} onChange={(e) => set({ janela_fim: e.target.value })} />
            </div>
          </>
        )}
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={draft.so_dias_uteis} onChange={(e) => set({ so_dias_uteis: e.target.checked })} />
            Só dias úteis
          </label>
        </div>
      </div>
      <p className={erro ? 'error-msg' : 'small muted'} style={{ margin: '-4px 0 10px' }}>
        {erro ?? `Esperamos um ping ${resumoPeriodica(draft)}. Alerta se passar o intervalo + tolerância sem nenhum.`}
      </p>
    </>
  );
}

function resumoPeriodica(d: AutomacaoDraft): string {
  const passo = parseInt(d.intervalo_min, 10) || 0;
  const janela = d.janela_inicio || d.janela_fim ? `, das ${d.janela_inicio || '00:00'} às ${d.janela_fim || '24:00'}${ultimoSlot(d, passo)}` : ', 24 h por dia';
  return `a cada ${fmtIntervalo(passo)}${janela}${d.so_dias_uteis ? ', só em dias úteis' : ''}`;
}

/** A hora de fim é exclusiva: 09:00–18:00 de 15 em 15 → último ping esperado às 17:45. */
function ultimoSlot(d: AutomacaoDraft, passo: number): string {
  if (passo <= 0) return '';
  const toMin = (h: string) => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
  const ini = d.janela_inicio ? toMin(d.janela_inicio) : 0;
  const fim = d.janela_fim ? toMin(d.janela_fim) : 24 * 60;
  if (fim <= ini) return '';
  const ultimo = ini + Math.floor((fim - 1 - ini) / passo) * passo;
  return ` (último às ${String(Math.floor(ultimo / 60)).padStart(2, '0')}:${String(ultimo % 60).padStart(2, '0')})`;
}
