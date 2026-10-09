import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtDate, fmtEUR, monthISO, todayISO } from '../../lib/utils';
import { CATEGORIA_LABEL, PERIODICIDADE_LABEL, custoNoMes, custoRecorrenteMensal } from '../../lib/custos';
import type { Custo, CustoCategoria, CustoPeriodicidade } from '../../lib/types';
import Modal from '../Modal';

const FERRAMENTAS_COMUNS = [
  'Claude', 'OpenAI', 'Supabase', 'n8n', 'Make', 'Zapier', 'Google Workspace', 'Microsoft 365',
  'GitHub', 'Vercel', 'Resend', 'Hetzner', 'Domínio', 'Notion', 'Slack',
];

interface Draft {
  descricao: string;
  ferramenta: string;
  categoria: CustoCategoria;
  valor: string;
  periodicidade: CustoPeriodicidade;
  data_inicio: string;
  data_fim: string;
  notas: string;
}

function vazio(): Draft {
  return { descricao: '', ferramenta: '', categoria: 'ferramenta', valor: '', periodicidade: 'mensal', data_inicio: todayISO(), data_fim: '', notas: '' };
}

function deCusto(c: Custo): Draft {
  return {
    descricao: c.descricao, ferramenta: c.ferramenta ?? '', categoria: c.categoria, valor: String(c.valor),
    periodicidade: c.periodicidade, data_inicio: c.data_inicio, data_fim: c.data_fim ?? '', notas: c.notas ?? '',
  };
}

function paraLinha(d: Draft) {
  return {
    descricao: d.descricao.trim(),
    ferramenta: d.ferramenta.trim() || null,
    categoria: d.categoria,
    valor: parseFloat(d.valor) || 0,
    periodicidade: d.periodicidade,
    data_inicio: d.data_inicio || todayISO(),
    data_fim: d.data_fim || null,
    notas: d.notas.trim() || null,
  };
}

export default function CustosPanel({ clienteId, onTotal }: { clienteId: string | null; onTotal?: (mensal: number) => void }) {
  const [custos, setCustos] = useState<Custo[]>([]);
  const [ferramentas, setFerramentas] = useState<string[]>(FERRAMENTAS_COMUNS);
  const [form, setForm] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [verTerminados, setVerTerminados] = useState(false);
  const mes = monthISO();
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const load = useCallback(async () => {
    const q = supabase.from('custos').select('*');
    const [{ data }, { data: todas }] = await Promise.all([
      (clienteId ? q.eq('cliente_id', clienteId) : q.is('cliente_id', null)).order('data_inicio', { ascending: false }),
      supabase.from('custos').select('ferramenta'),
    ]);
    const cs = (data as Custo[]) ?? [];
    setCustos(cs);
    onTotalRef.current?.(cs.reduce((s, c) => s + custoRecorrenteMensal(c, mes), 0));
    const usadas = ((todas as { ferramenta: string | null }[]) ?? []).map((r) => r.ferramenta).filter((f): f is string => !!f);
    setFerramentas(Array.from(new Set([...usadas, ...FERRAMENTAS_COMUNS])).sort((a, b) => a.localeCompare(b, 'pt')));
  }, [clienteId, mes]);

  useEffect(() => {
    load();
  }, [load]);

  const terminado = (c: Custo) => (c.periodicidade === 'unico' ? c.data_inicio.slice(0, 7) < mes.slice(0, 7) : !!c.data_fim && c.data_fim.slice(0, 7) < mes.slice(0, 7));
  const ativos = custos.filter((c) => !terminado(c));
  const terminados = custos.filter(terminado);
  const recorrente = custos.reduce((s, c) => s + custoRecorrenteMensal(c, mes), 0);
  const pontuaisMes = custos.filter((c) => c.periodicidade === 'unico').reduce((s, c) => s + custoNoMes(c, mes), 0);

  async function guardar() {
    if (!form) return;
    const linha = paraLinha(form.draft);
    if (!linha.descricao || !(linha.valor >= 0)) return;
    const { error } = form.id
      ? await supabase.from('custos').update(linha).eq('id', form.id)
      : await supabase.from('custos').insert({ ...linha, cliente_id: clienteId });
    if (!error) {
      setForm(null);
      load();
    }
  }

  async function terminar(id: string) {
    await supabase.from('custos').update({ data_fim: todayISO() }).eq('id', id);
    setForm(null);
    load();
  }

  async function apagar(id: string, descricao: string) {
    if (!confirm(`Apagar o custo "${descricao}"? Se só deixou de ser pago, usa antes "Terminar hoje" para manter o histórico.`)) return;
    await supabase.from('custos').delete().eq('id', id);
    setForm(null);
    load();
  }

  const d = form?.draft;
  const setD = (patch: Partial<Draft>) => setForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));
  const valido = !!d && d.descricao.trim() !== '' && d.valor !== '' && parseFloat(d.valor) >= 0;

  function linhaCusto(c: Custo) {
    const porMes = custoNoMes(c, mes);
    return (
      <tr key={c.id} className="clickable" style={terminado(c) ? { opacity: 0.55 } : undefined} onClick={() => setForm({ id: c.id, draft: deCusto(c) })}>
        <td style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{c.descricao}</div>
          <div className="muted small">
            {CATEGORIA_LABEL[c.categoria]}
            {c.notas ? ` · ${c.notas}` : ''}
          </div>
        </td>
        <td>{c.ferramenta ? <span className="pill">{c.ferramenta}</span> : <span className="muted">—</span>}</td>
        <td className="num" style={{ whiteSpace: 'nowrap' }}>
          {fmtEUR(Number(c.valor))}
          <div className="muted small">{PERIODICIDADE_LABEL[c.periodicidade]}</div>
        </td>
        <td className="num">{c.periodicidade === 'unico' ? <span className="muted">pontual</span> : fmtEUR(porMes)}</td>
        <td className="muted small" style={{ whiteSpace: 'nowrap' }}>
          {fmtDate(c.data_inicio)}
          {c.data_fim ? ` → ${fmtDate(c.data_fim)}` : ''}
        </td>
      </tr>
    );
  }

  return (
    <>
      <div className="grid cols-3">
        <div className="panel stat">
          <div className="lbl">Recorrente / mês</div>
          <div className="num">{fmtEUR(recorrente)}</div>
        </div>
        <div className="panel stat">
          <div className="lbl">Equivalente anual</div>
          <div className="num">{fmtEUR(recorrente * 12)}</div>
        </div>
        <div className="panel stat">
          <div className="lbl">Pontuais este mês</div>
          <div className="num">{fmtEUR(pontuaisMes)}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <span className="muted small">{ativos.length} {ativos.length === 1 ? 'custo ativo' : 'custos ativos'}</span>
        <div className="spacer" />
        <button className="primary" onClick={() => setForm({ id: null, draft: vazio() })}>+ Custo</button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Descrição</th><th>Ferramenta</th><th className="num">Valor</th><th className="num">Por mês</th><th>Período</th></tr>
          </thead>
          <tbody>
            {ativos.map(linhaCusto)}
            {ativos.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <p>Sem custos registados{clienteId ? ' para este cliente' : ''}.</p>
                    <button className="primary" onClick={() => setForm({ id: null, draft: vazio() })}>Registar o primeiro custo</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {terminados.length > 0 && (
        <>
          <p className="small" style={{ marginTop: 10 }}>
            <button className="small ghost" onClick={() => setVerTerminados((v) => !v)}>
              {verTerminados ? 'esconder terminados' : `ver terminados (${terminados.length})`}
            </button>
          </p>
          {verTerminados && (
            <div className="panel" style={{ padding: 0 }}>
              <table><tbody>{terminados.map(linhaCusto)}</tbody></table>
            </div>
          )}
        </>
      )}

      {form && d && (
        <Modal title={form.id ? 'Editar custo' : 'Novo custo'} onClose={() => setForm(null)}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Descrição *</label>
              <input value={d.descricao} onChange={(e) => setD({ descricao: e.target.value })} placeholder="ex: Plano Claude Team" autoFocus />
            </div>
            <div className="field">
              <label>Ferramenta</label>
              <input list="ferramentas" value={d.ferramenta} onChange={(e) => setD({ ferramenta: e.target.value })} placeholder="ex: Claude" />
              <datalist id="ferramentas">
                {ferramentas.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Valor (€) *</label>
              <input type="number" min="0" step="0.01" value={d.valor} onChange={(e) => setD({ valor: e.target.value })} placeholder="25" />
            </div>
            <div className="field">
              <label>Periodicidade</label>
              <select value={d.periodicidade} onChange={(e) => setD({ periodicidade: e.target.value as CustoPeriodicidade })}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual (conta 1/12 por mês)</option>
                <option value="unico">Único (pontual)</option>
              </select>
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={d.categoria} onChange={(e) => setD({ categoria: e.target.value as CustoCategoria })}>
                {(Object.keys(CATEGORIA_LABEL) as CustoCategoria[]).map((k) => (
                  <option key={k} value={k}>{CATEGORIA_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>{d.periodicidade === 'unico' ? 'Data' : 'Início'}</label>
              <input type="date" value={d.data_inicio} onChange={(e) => setD({ data_inicio: e.target.value })} />
            </div>
            {d.periodicidade !== 'unico' && (
              <div className="field">
                <label>Fim (opcional)</label>
                <input type="date" value={d.data_fim} onChange={(e) => setD({ data_fim: e.target.value })} />
              </div>
            )}
          </div>
          <div className="field">
            <label>Notas</label>
            <textarea rows={2} value={d.notas} onChange={(e) => setD({ notas: e.target.value })} placeholder="ex: faturado no cartão da empresa, renova a 3 de cada mês" />
          </div>
          <div className="modal-actions">
            {form.id && (
              <>
                <button className="ghost danger" onClick={() => apagar(form.id!, d.descricao)}>Apagar</button>
                {d.periodicidade !== 'unico' && !d.data_fim && (
                  <button className="ghost" onClick={() => terminar(form.id!)} title="Deixou de ser pago hoje">Terminar hoje</button>
                )}
              </>
            )}
            <div className="spacer" />
            <button onClick={() => setForm(null)}>Cancelar</button>
            <button className="primary" disabled={!valido} onClick={guardar}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
