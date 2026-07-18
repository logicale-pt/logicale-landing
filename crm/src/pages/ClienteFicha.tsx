import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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

export default function ClienteFicha() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [saved, setSaved] = useState(false);
  // modais
  const [novaDraft, setNovaDraft] = useState<AutomacaoDraft | null>(null);
  const [editando, setEditando] = useState<{ id: string; draft: AutomacaoDraft } | null>(null);
  const [tokens, setTokens] = useState<NovoToken[] | null>(null);

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
          <button className="primary" onClick={guardarCliente}>Guardar</button>
          {saved && <span className="success-msg" style={{ marginLeft: 10 }}>Guardado ✓</span>}
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
    </>
  );
}
