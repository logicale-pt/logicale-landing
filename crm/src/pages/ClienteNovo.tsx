import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtEUR, generatePingToken, sha256Hex } from '../lib/utils';
import type { Lead } from '../lib/types';
import AutomacaoFields, {
  draftToRow,
  draftValido,
  emptyDraft,
  type AutomacaoDraft,
} from '../components/AutomacaoForm';
import TokenModal, { type NovoToken } from '../components/TokenModal';

export default function ClienteNovo() {
  const location = useLocation();
  const navigate = useNavigate();
  const lead = (location.state as { lead?: Lead } | null)?.lead;

  const [nome, setNome] = useState(lead?.nome ?? '');
  const [empresa, setEmpresa] = useState(lead?.empresa ?? '');
  const [email, setEmail] = useState(lead?.email ?? '');
  const [telefone, setTelefone] = useState('');
  const [notas, setNotas] = useState(lead ? `Convertido de lead (${lead.setor ?? 's/ setor'})` : '');
  // A criação de cliente inclui logo as automações (mínimo 1)
  const [drafts, setDrafts] = useState<AutomacaoDraft[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<NovoToken[] | null>(null);
  const [novoClienteId, setNovoClienteId] = useState<string | null>(null);

  const mensalidade = drafts.reduce((s, d) => s + (parseFloat(d.preco_mensal) || 0), 0);
  const valido = nome.trim() && drafts.length >= 1 && drafts.every(draftValido);

  async function criar() {
    if (!valido || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data: cliente, error: cErr } = await supabase
        .from('clientes')
        .insert({
          nome: nome.trim(),
          empresa: empresa.trim() || null,
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          notas: notas.trim() || null,
        })
        .select('id')
        .single();
      if (cErr || !cliente) throw cErr ?? new Error('insert cliente falhou');

      const novos: NovoToken[] = [];
      for (const d of drafts) {
        const token = generatePingToken();
        const { error: aErr } = await supabase.from('automacoes').insert({
          ...draftToRow(d),
          cliente_id: cliente.id,
          token_hash: await sha256Hex(token),
        });
        if (aErr) throw aErr;
        novos.push({ automacao: d.nome, token });
      }

      if (lead) await supabase.from('leads').update({ estado: 'convertido' }).eq('id', lead.id);

      setNovoClienteId(cliente.id);
      setTokens(novos); // mostrados uma única vez; fechar → ficha do cliente
    } catch (e) {
      console.error(e);
      setError('Falhou a criação — verifica os dados e tenta outra vez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Novo cliente {lead && <span className="muted small">(a partir de lead)</span>}</h1>

      <div className="panel" style={{ maxWidth: 760 }}>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Nome *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Empresa</label>
            <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Telefone</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <h2>Automações (mínimo 1)</h2>
        {drafts.map((d, i) => (
          <div key={i} className="panel" style={{ background: 'var(--panel-2)', marginBottom: 10 }}>
            <AutomacaoFields
              draft={d}
              onChange={(nd) => setDrafts((ds) => ds.map((x, j) => (j === i ? nd : x)))}
            />
            {drafts.length > 1 && (
              <button className="small danger" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                Remover
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setDrafts((ds) => [...ds, emptyDraft()])}>+ automação</button>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="stat">
            <div className="num">{fmtEUR(mensalidade)}</div>
            <div className="lbl">Mensalidade (derivada)</div>
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <button onClick={() => navigate(-1)}>Cancelar</button>
          <button className="primary" disabled={!valido || busy} onClick={criar}>
            {busy ? 'A criar…' : 'Criar cliente'}
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
      </div>

      {tokens && (
        <TokenModal tokens={tokens} onClose={() => navigate(`/clientes/${novoClienteId}`, { replace: true })} />
      )}
    </>
  );
}
