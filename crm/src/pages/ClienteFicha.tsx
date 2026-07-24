import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { notifyIncidentesChanged } from '../components/Layout';
import { fmtEUR, generatePingToken, scheduleLabel, sha256Hex, todayISO } from '../lib/utils';
import type { Automacao, Cliente } from '../lib/types';
import Modal from '../components/Modal';
import AutomacaoFields, {
  draftFromAutomacao,
  draftToRow,
  draftValido,
  emptyDraft,
  type AutomacaoDraft,
} from '../components/AutomacaoForm';
import TokenModal, { type NovoToken } from '../components/TokenModal';

interface ContagemApagar {
  automacoes: number;
  runs: number;
  incidentes: number;
  pagamentos: number;
}

export default function ClienteFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [saved, setSaved] = useState(false);
  // modais
  const [novaDraft, setNovaDraft] = useState<AutomacaoDraft | null>(null);
  const [editando, setEditando] = useState<{ id: string; draft: AutomacaoDraft } | null>(null);
  const [tokens, setTokens] = useState<NovoToken[] | null>(null);
  const [apagar, setApagar] = useState<ContagemApagar | null>(null);
  const [busyApagar, setBusyApagar] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: c }, { data: autos }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('automacoes').select('*').eq('cliente_id', id).order('created_at'),
    ]);
    setCliente(c as Cliente);
    setAutomacoes((autos as Automacao[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!cliente) return <p className="muted">A carregar…</p>;

  const mensalidade = automacoes
    .filter((a) => a.ativa)
    .reduce((s, a) => s + Number(a.preco_mensal), 0);

  async function guardarCliente() {
    if (!cliente) return;
    await supabase
      .from('clientes')
      .update({
        nome: cliente.nome,
        empresa: cliente.empresa,
        email: cliente.email,
        telefone: cliente.telefone,
        notas: cliente.notas,
        estado: cliente.estado,
      })
      .eq('id', cliente.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function criarAutomacao() {
    if (!novaDraft || !draftValido(novaDraft) || !cliente) return;
    const token = generatePingToken();
    const { error } = await supabase.from('automacoes').insert({
      ...draftToRow(novaDraft),
      cliente_id: cliente.id,
      token_hash: await sha256Hex(token),
    });
    if (!error) {
      setTokens([{ automacao: novaDraft.nome, token }]);
      setNovaDraft(null);
      load();
    }
  }

  async function guardarEdicao() {
    if (!editando || !draftValido(editando.draft)) return;
    await supabase.from('automacoes').update(draftToRow(editando.draft)).eq('id', editando.id);
    setEditando(null);
    load();
  }

  // Remover = desativar (preserva histórico de runs e faturação)
  async function toggleAtiva(a: Automacao) {
    await supabase
      .from('automacoes')
      .update(a.ativa ? { ativa: false, data_fim: todayISO() } : { ativa: true, data_fim: null })
      .eq('id', a.id);
    load();
  }

  async function novoToken(a: Automacao) {
    if (!confirm(`Gerar novo token para "${a.nome}"? O token antigo deixa de funcionar.`)) return;
    const token = generatePingToken();
    const { error } = await supabase
      .from('automacoes')
      .update({ token_hash: await sha256Hex(token) })
      .eq('id', a.id);
    if (!error) setTokens([{ automacao: a.nome, token }]);
  }

  // Desativar cliente: só muda o estado — automações e histórico ficam intactos
  async function toggleEstadoCliente() {
    if (!cliente) return;
    const estado = cliente.estado === 'ativo' ? 'inativo' : 'ativo';
    await supabase.from('clientes').update({ estado }).eq('id', cliente.id);
    setCliente({ ...cliente, estado });
  }

  async function prepararApagar() {
    if (!cliente) return;
    const autoIds = automacoes.map((a) => a.id);
    const [runs, incidentes, pagamentos] = await Promise.all([
      autoIds.length
        ? supabase.from('runs').select('id', { count: 'exact', head: true }).in('automacao_id', autoIds)
        : Promise.resolve({ count: 0 }),
      supabase.from('incidentes').select('id', { count: 'exact', head: true }).eq('cliente_id', cliente.id),
      supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('cliente_id', cliente.id),
    ]);
    setApagar({
      automacoes: automacoes.length,
      runs: runs.count ?? 0,
      incidentes: incidentes.count ?? 0,
      pagamentos: pagamentos.count ?? 0,
    });
  }

  // Apagar cliente: remove tudo o que depende dele, por ordem das foreign keys.
  // As tarefas do kanban sobrevivem — só perdem a associação ao cliente.
  async function apagarCliente() {
    if (!cliente || busyApagar) return;
    setBusyApagar(true);
    try {
      const autoIds = automacoes.map((a) => a.id);
      let r = await supabase.from('incidentes').delete().eq('cliente_id', cliente.id);
      if (r.error) throw r.error;
      if (autoIds.length) {
        r = await supabase.from('runs').delete().in('automacao_id', autoIds);
        if (r.error) throw r.error;
        r = await supabase.from('automacoes').delete().eq('cliente_id', cliente.id);
        if (r.error) throw r.error;
      }
      r = await supabase.from('pagamentos').delete().eq('cliente_id', cliente.id);
      if (r.error) throw r.error;
      r = await supabase.from('tarefas').update({ cliente_id: null }).eq('cliente_id', cliente.id);
      if (r.error) throw r.error;
      r = await supabase.from('clientes').delete().eq('id', cliente.id);
      if (r.error) throw r.error;
      notifyIncidentesChanged();
      navigate('/clientes', { replace: true });
    } catch (e) {
      console.error('apagar cliente falhou:', e);
      setBusyApagar(false);
      setApagar(null);
      alert('Não foi possível apagar o cliente. Vê a consola e tenta outra vez.');
    }
  }

  const set = (patch: Partial<Cliente>) => setCliente((c) => (c ? { ...c, ...patch } : c));

  return (
    <>
      <h1>
        {cliente.nome} <span className={`tag ${cliente.estado}`}>{cliente.estado}</span>
      </h1>

      <div className="grid cols-2">
        <div className="panel">
          <div className="row">
            <div className="field">
              <label>Nome</label>
              <input value={cliente.nome} onChange={(e) => set({ nome: e.target.value })} />
            </div>
            <div className="field">
              <label>Empresa</label>
              <input value={cliente.empresa ?? ''} onChange={(e) => set({ empresa: e.target.value || null })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Email</label>
              <input value={cliente.email ?? ''} onChange={(e) => set({ email: e.target.value || null })} />
            </div>
            <div className="field">
              <label>Telefone</label>
              <input value={cliente.telefone ?? ''} onChange={(e) => set({ telefone: e.target.value || null })} />
            </div>
            <div className="field">
              <label>Estado</label>
              <select value={cliente.estado} onChange={(e) => set({ estado: e.target.value as Cliente['estado'] })}>
                <option value="ativo">ativo</option>
                <option value="inativo">inativo</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notas</label>
            <textarea rows={3} value={cliente.notas ?? ''} onChange={(e) => set({ notas: e.target.value || null })} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="primary" onClick={guardarCliente}>Guardar</button>
            {saved && <span className="success-msg">Guardado ✓</span>}
            <div style={{ flex: 1 }} />
            <button onClick={toggleEstadoCliente}>
              {cliente.estado === 'ativo' ? 'Desativar cliente' : 'Reativar cliente'}
            </button>
            <button className="danger" onClick={prepararApagar}>Apagar…</button>
          </div>
        </div>

        <div className="panel stat">
          <div className="num">{fmtEUR(mensalidade)}</div>
          <div className="lbl">Mensalidade (soma das automações ativas)</div>
        </div>
      </div>

      <h2>Automações</h2>
      <div className="toolbar">
        <div className="spacer" />
        <button className="primary" onClick={() => setNovaDraft(emptyDraft())}>+ automação</button>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Nome</th><th>Tipo</th><th>Schedule</th><th>Preço/mês</th><th>Estado</th><th style={{ width: 260 }}></th></tr>
          </thead>
          <tbody>
            {automacoes.map((a) => (
              <tr key={a.id} style={a.ativa ? undefined : { opacity: 0.55 }}>
                <td>{a.nome}</td>
                <td>{a.tipo_entrega}</td>
                <td className="small muted">{scheduleLabel(a)}</td>
                <td>{fmtEUR(Number(a.preco_mensal))}</td>
                <td>
                  <span className={`tag ${a.ativa ? 'ativo' : 'inativo'}`}>
                    {a.ativa ? 'ativa' : `desativada${a.data_fim ? ` (${a.data_fim})` : ''}`}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="small" onClick={() => setEditando({ id: a.id, draft: draftFromAutomacao(a) })}>
                    editar
                  </button>{' '}
                  <button className="small" onClick={() => novoToken(a)}>novo token</button>{' '}
                  <button className={`small ${a.ativa ? 'danger' : ''}`} onClick={() => toggleAtiva(a)}>
                    {a.ativa ? 'desativar' : 'reativar'}
                  </button>
                </td>
              </tr>
            ))}
            {automacoes.length === 0 && (
              <tr><td colSpan={6} className="muted">Sem automações.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {novaDraft && (
        <Modal title="Nova automação" onClose={() => setNovaDraft(null)}>
          <AutomacaoFields draft={novaDraft} onChange={setNovaDraft} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setNovaDraft(null)}>Cancelar</button>
            <button className="primary" disabled={!draftValido(novaDraft)} onClick={criarAutomacao}>
              Criar
            </button>
          </div>
        </Modal>
      )}

      {editando && (
        <Modal title="Editar automação" onClose={() => setEditando(null)}>
          <AutomacaoFields
            draft={editando.draft}
            onChange={(d) => setEditando({ ...editando, draft: d })}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditando(null)}>Cancelar</button>
            <button className="primary" disabled={!draftValido(editando.draft)} onClick={guardarEdicao}>
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {tokens && <TokenModal tokens={tokens} onClose={() => setTokens(null)} />}

      {apagar && (
        <Modal title="Apagar cliente" onClose={() => !busyApagar && setApagar(null)}>
          <p>
            Isto apaga definitivamente <b>{cliente.nome}</b> e tudo o que lhe pertence:
          </p>
          <ul className="small" style={{ margin: '8px 0 12px', paddingLeft: 20, lineHeight: 1.9 }}>
            <li>{apagar.automacoes} automações (e os tokens de ping deixam de funcionar)</li>
            <li>{apagar.runs} runs de histórico</li>
            <li>{apagar.incidentes} incidentes</li>
            <li>{apagar.pagamentos} pagamentos registados</li>
          </ul>
          <p className="small muted">
            As tarefas do kanban ficam, mas perdem a associação ao cliente. Esta ação não tem desfazer —
            se só quiseres pausar a relação, usa antes "Desativar cliente".
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setApagar(null)} disabled={busyApagar}>Cancelar</button>
            <button className="destructive" onClick={apagarCliente} disabled={busyApagar}>
              {busyApagar ? 'A apagar…' : 'Apagar definitivamente'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
