import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import {
  bloquear,
  cifrarSegredo,
  criarCofre,
  decifrarSegredo,
  desbloqueado,
  desbloquear,
  onCofreChange,
  type Segredo,
} from '../../lib/cofre';
import type { Cofre, Credencial } from '../../lib/types';
import Modal from '../Modal';

function gerarPassword(n = 20): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_';
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, (x) => abc[x % abc.length]).join('');
}

function useCofreDesbloqueado(): boolean {
  const [v, setV] = useState(desbloqueado());
  useEffect(() => onCofreChange(() => setV(desbloqueado())), []);
  return v;
}

/* ---------- configurar / desbloquear ---------- */

function CofreGate({ cofre, onCriado }: { cofre: Cofre | null; onCriado: () => void }) {
  const [frase, setFrase] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    try {
      if (cofre) {
        if (!(await desbloquear(frase, cofre))) setErro('Frase-passe errada.');
      } else {
        if (frase.length < 12) return setErro('Usa pelo menos 12 caracteres (uma frase curta é ótimo).');
        if (frase !== confirmar) return setErro('As frases-passe não coincidem.');
        const params = await criarCofre(frase);
        const { error } = await supabase.from('cofre').insert({ id: 1, ...params });
        if (error) {
          bloquear();
          return setErro('O outro sócio já criou o cofre entretanto — recarrega e usa a frase-passe dele.');
        }
        onCriado();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel cofre-gate" onSubmit={submeter}>
      <div className="cofre-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
      </div>
      <h3>{cofre ? 'Cofre bloqueado' : 'Criar o cofre de credenciais'}</h3>
      <p className="muted small">
        {cofre
          ? 'As passwords estão cifradas. Escreve a frase-passe do cofre para as ver — fica desbloqueado neste separador até 10 min sem uso.'
          : 'As passwords são cifradas no teu browser antes de irem para a base de dados. Escolham uma frase-passe partilhada entre os dois — nunca sai do browser e não fica guardada em lado nenhum.'}
      </p>
      <div className="field">
        <label>Frase-passe</label>
        <input type="password" value={frase} onChange={(e) => setFrase(e.target.value)} autoComplete={cofre ? 'current-password' : 'new-password'} autoFocus />
      </div>
      {!cofre && (
        <>
          <div className="field">
            <label>Confirmar frase-passe</label>
            <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />
          </div>
          <label className="check">
            <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
            Percebo que, se esquecermos a frase-passe, as passwords guardadas ficam irrecuperáveis.
          </label>
        </>
      )}
      <button className="primary" style={{ width: '100%', marginTop: 6 }} disabled={busy || !frase || (!cofre && !aceito)}>
        {busy ? 'A derivar a chave…' : cofre ? 'Desbloquear' : 'Criar cofre'}
      </button>
      {erro && <p className="error-msg">{erro}</p>}
    </form>
  );
}

/* ---------- linha com revelar / copiar ---------- */

function LinhaCredencial({ c, onEditar, onApagar }: { c: Credencial; onEditar: () => void; onApagar: () => void }) {
  const [segredo, setSegredo] = useState<Segredo | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function obter(): Promise<Segredo | null> {
    if (segredo) return segredo;
    if (!c.segredo) return null;
    try {
      const s = await decifrarSegredo(c.segredo);
      return s;
    } catch {
      return null;
    }
  }

  async function revelar() {
    if (segredo) return setSegredo(null);
    setSegredo(await obter());
  }

  async function copiar(texto: string | undefined | null, o: string) {
    if (!texto) return;
    await navigator.clipboard.writeText(texto);
    setCopiado(o);
    setTimeout(() => setCopiado(null), 1400);
  }

  return (
    <div className="cred">
      <div className="cred-head">
        <div className="cred-avatar" aria-hidden="true">{c.servico.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="cred-servico">{c.servico}</div>
          {c.url && (
            <a className="small" href={/^https?:\/\//.test(c.url) ? c.url : `https://${c.url}`} target="_blank" rel="noopener noreferrer">
              {c.url.replace(/^https?:\/\//, '')} ↗
            </a>
          )}
        </div>
        <div className="spacer" />
        <button className="small ghost" onClick={onEditar}>editar</button>
        <button className="small ghost danger" onClick={onApagar}>apagar</button>
      </div>
      <dl className="cred-campos">
        <div>
          <dt>Utilizador</dt>
          <dd>
            <span className="mono">{c.utilizador || '—'}</span>
            {c.utilizador && (
              <button className="small ghost" onClick={() => copiar(c.utilizador, 'u')}>{copiado === 'u' ? 'copiado ✓' : 'copiar'}</button>
            )}
          </dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>
            <span className="mono">{segredo ? segredo.password || '—' : c.segredo ? '••••••••••••' : '—'}</span>
            {c.segredo && (
              <>
                <button className="small ghost" onClick={revelar}>{segredo ? 'esconder' : 'mostrar'}</button>
                <button className="small ghost" onClick={async () => copiar((await obter())?.password, 'p')}>
                  {copiado === 'p' ? 'copiado ✓' : 'copiar'}
                </button>
              </>
            )}
          </dd>
        </div>
        {segredo?.notas && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Notas (cifradas)</dt>
            <dd className="cred-notas">{segredo.notas}</dd>
          </div>
        )}
      </dl>
      <div className="cred-meta">Atualizada {timeAgo(c.updated_at)}{c.updated_by ? ` por ${c.updated_by}` : ''}</div>
    </div>
  );
}

/* ---------- painel ---------- */

interface Draft {
  servico: string;
  url: string;
  utilizador: string;
  password: string;
  notas: string;
}

export default function CredenciaisPanel({ clienteId, eu, onCount }: { clienteId: string | null; eu: string; onCount?: (n: number) => void }) {
  const [cofre, setCofre] = useState<Cofre | null | undefined>(undefined);
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [form, setForm] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [verPass, setVerPass] = useState(false);
  const aberto = useCofreDesbloqueado();
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const load = useCallback(async () => {
    const q = supabase.from('credenciais').select('*');
    const [{ data: cf }, { data }] = await Promise.all([
      supabase.from('cofre').select('*').eq('id', 1).maybeSingle(),
      (clienteId ? q.eq('cliente_id', clienteId) : q.is('cliente_id', null)).order('servico'),
    ]);
    setCofre((cf as Cofre | null) ?? null);
    const cs = (data as Credencial[]) ?? [];
    setCreds(cs);
    onCountRef.current?.(cs.length);
  }, [clienteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function abrirEdicao(c: Credencial) {
    let s: Segredo = { password: '', notas: '' };
    if (c.segredo) {
      try {
        s = await decifrarSegredo(c.segredo);
      } catch {
        /* segredo ilegível: deixa vazio para regravar */
      }
    }
    setVerPass(false);
    setForm({ id: c.id, draft: { servico: c.servico, url: c.url ?? '', utilizador: c.utilizador ?? '', password: s.password, notas: s.notas } });
  }

  async function guardar() {
    if (!form || !form.draft.servico.trim()) return;
    const d = form.draft;
    const segredo = d.password || d.notas ? await cifrarSegredo({ password: d.password, notas: d.notas }) : null;
    const linha = {
      servico: d.servico.trim(),
      url: d.url.trim() || null,
      utilizador: d.utilizador.trim() || null,
      segredo,
      updated_by: eu,
      updated_at: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from('credenciais').update(linha).eq('id', form.id)
      : await supabase.from('credenciais').insert({ ...linha, cliente_id: clienteId });
    if (!error) {
      setForm(null);
      load();
    }
  }

  async function apagar(c: Credencial) {
    if (!confirm(`Apagar a credencial "${c.servico}"?`)) return;
    await supabase.from('credenciais').delete().eq('id', c.id);
    load();
  }

  if (cofre === undefined) return <p className="muted">A carregar…</p>;
  if (!cofre || !aberto) return <CofreGate cofre={cofre} onCriado={load} />;

  const d = form?.draft;
  const setD = (patch: Partial<Draft>) => setForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));

  return (
    <>
      <div className="toolbar">
        <span className="cofre-aberto"><span className="dot ok" /> Cofre desbloqueado</span>
        <span className="muted small">{creds.length} {creds.length === 1 ? 'credencial' : 'credenciais'}</span>
        <div className="spacer" />
        <button className="small" onClick={bloquear}>Bloquear</button>
        <button className="primary" onClick={() => { setVerPass(true); setForm({ id: null, draft: { servico: '', url: '', utilizador: '', password: gerarPassword(), notas: '' } }); }}>
          + Credencial
        </button>
      </div>

      {creds.length === 0 ? (
        <div className="panel empty">
          <p>Sem credenciais {clienteId ? 'deste cliente' : 'internas'}.</p>
          <span className="muted small">Acessos a contas, painéis, APIs… tudo cifrado com a frase-passe do cofre.</span>
        </div>
      ) : (
        <div className="cred-grid">
          {creds.map((c) => (
            <LinhaCredencial key={c.id + c.updated_at} c={c} onEditar={() => abrirEdicao(c)} onApagar={() => apagar(c)} />
          ))}
        </div>
      )}

      {form && d && (
        <Modal title={form.id ? 'Editar credencial' : 'Nova credencial'} onClose={() => setForm(null)}>
          <div className="row">
            <div className="field">
              <label>Serviço *</label>
              <input value={d.servico} onChange={(e) => setD({ servico: e.target.value })} placeholder="ex: Google Workspace (admin)" autoFocus />
            </div>
            <div className="field">
              <label>URL</label>
              <input value={d.url} onChange={(e) => setD({ url: e.target.value })} placeholder="admin.google.com" />
            </div>
          </div>
          <div className="field">
            <label>Utilizador / email</label>
            <input value={d.utilizador} onChange={(e) => setD({ utilizador: e.target.value })} autoComplete="off" />
          </div>
          <div className="field">
            <label>Password / token</label>
            <div className="input-group">
              <input
                type={verPass ? 'text' : 'password'}
                className="mono"
                value={d.password}
                onChange={(e) => setD({ password: e.target.value })}
                autoComplete="new-password"
              />
              <button type="button" className="small" onClick={() => setVerPass((v) => !v)}>{verPass ? 'esconder' : 'mostrar'}</button>
              <button type="button" className="small" onClick={() => { setVerPass(true); setD({ password: gerarPassword() }); }}>gerar</button>
            </div>
          </div>
          <div className="field">
            <label>Notas secretas (cifradas) — códigos de recuperação, 2FA, PIN…</label>
            <textarea rows={3} value={d.notas} onChange={(e) => setD({ notas: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button onClick={() => setForm(null)}>Cancelar</button>
            <button className="primary" disabled={!d.servico.trim()} onClick={guardar}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
