import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import {
  aplicarMudanca,
  bloquear,
  cifrarSegredo,
  criarCofre,
  decifrarSegredo,
  desbloqueado,
  desbloquear,
  ErroMudanca,
  onCofreChange,
  prepararMudanca,
  versaoCofre,
  type Segredo,
} from '../../lib/cofre';
import type { Cofre, Credencial } from '../../lib/types';
import Modal from '../Modal';

function gerarPassword(n = 20): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_';
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, (x) => abc[x % abc.length]).join('');
}

// Passwords copiadas saem do clipboard ao fim de 45 s (como num gestor de passwords).
// Só limpa se a última cópia feita aqui ainda for a mais recente — não apaga o que se copiou depois nesta página.
const LIMPAR_CLIPBOARD_MS = 45_000;
let ultimaCopia = 0;
function copiarSegredo(texto: string): Promise<void> {
  const minha = ++ultimaCopia;
  setTimeout(() => {
    if (minha === ultimaCopia) navigator.clipboard.writeText('').catch(() => {});
  }, LIMPAR_CLIPBOARD_MS);
  return navigator.clipboard.writeText(texto);
}

function useCofreDesbloqueado(): boolean {
  const [v, setV] = useState(desbloqueado());
  useEffect(() => onCofreChange(() => setV(desbloqueado())), []);
  return v;
}

/* ---------- configurar / desbloquear ---------- */

function CofreGate({ cofre, onCriado, aviso }: { cofre: Cofre | null; onCriado: () => void; aviso?: string | null }) {
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
        // Sem linha no cofre mas com segredos cifrados ⇒ o cofre antigo foi apagado. Um cofre novo
        // teria outra chave e esses segredos ficariam ilegíveis — repor o cofre antigo em vez disso.
        const { count, error: cErr } = await supabase
          .from('credenciais')
          .select('id', { count: 'exact', head: true })
          .not('segredo', 'is', null);
        if (cErr) return setErro('Não foi possível verificar as credenciais existentes. Tenta outra vez.');
        if ((count ?? 0) > 0) {
          return setErro(`Há ${count} credenciais cifradas com um cofre anterior, cuja configuração desapareceu da base de dados. Repõe a linha da tabela "cofre" (backup) em vez de criar um cofre novo.`);
        }
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
      {aviso && <p className="error-msg" style={{ marginTop: 0 }}>{aviso}</p>}
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
    await (o === 'p' ? copiarSegredo(texto) : navigator.clipboard.writeText(texto));
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

/** ilegivel: o segredo guardado não decifra com esta chave — guardar sem escrever um novo mantém-no. */
type FormCred = { id: string | null; draft: Draft; ilegivel?: boolean; erro?: string };

const AVISO_FRASE_MUDOU = 'A frase-passe do cofre foi mudada noutro browser. Desbloqueia com a frase nova.';

/** A BD recusou por o segredo vir cifrado com uma versão antiga da chave (trigger credenciais_verificar_versao). */
function versaoDesatualizada(error: { message?: string } | null): boolean {
  return !!error?.message?.includes('cofre_versao_desatualizada');
}

export default function CredenciaisPanel({ clienteId, eu, onCount }: { clienteId: string | null; eu: string; onCount?: (n: number) => void }) {
  const [cofre, setCofre] = useState<Cofre | null | undefined>(undefined);
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [form, setForm] = useState<FormCred | null>(null);
  const [verPass, setVerPass] = useState(false);
  const [mudarFrase, setMudarFrase] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const aberto = useCofreDesbloqueado();
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  const load = useCallback(async () => {
    const q = supabase.from('credenciais').select('*');
    const [{ data: cf }, { data }] = await Promise.all([
      supabase.from('cofre').select('*').eq('id', 1).maybeSingle(),
      (clienteId ? q.eq('cliente_id', clienteId) : q.is('cliente_id', null)).order('servico'),
    ]);
    const cofreBd = (cf as Cofre | null) ?? null;
    // a frase mudou noutro browser desde que este desbloqueou → a chave em memória já não serve
    if (cofreBd?.versao !== undefined && desbloqueado() && versaoCofre() !== cofreBd.versao) {
      bloquear();
      setAviso(AVISO_FRASE_MUDOU);
    }
    setCofre(cofreBd);
    const cs = (data as Credencial[]) ?? [];
    setCreds(cs);
    onCountRef.current?.(cs.length);
  }, [clienteId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (aberto) setAviso(null);
  }, [aberto]);

  async function abrirEdicao(c: Credencial) {
    let s: Segredo = { password: '', notas: '' };
    let ilegivel = false;
    if (c.segredo) {
      try {
        s = await decifrarSegredo(c.segredo);
      } catch {
        ilegivel = true; // não se mostra, mas também não se apaga ao guardar (ver guardar)
      }
    }
    setVerPass(false);
    setForm({ id: c.id, ilegivel, draft: { servico: c.servico, url: c.url ?? '', utilizador: c.utilizador ?? '', password: s.password, notas: s.notas } });
  }

  async function guardar() {
    if (!form || !form.draft.servico.trim()) return;
    const d = form.draft;
    const manterSegredo = form.ilegivel && !d.password && !d.notas;
    const segredo = d.password || d.notas ? await cifrarSegredo({ password: d.password, notas: d.notas }) : null;
    const versao = versaoCofre();
    const linha = {
      servico: d.servico.trim(),
      url: d.url.trim() || null,
      utilizador: d.utilizador.trim() || null,
      // cofre_versao só existe depois da migração 20261012000000 (versao === null antes dela)
      ...(manterSegredo ? {} : { segredo, ...(versao !== null ? { cofre_versao: versao } : {}) }),
      updated_by: eu,
      updated_at: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from('credenciais').update(linha).eq('id', form.id)
      : await supabase.from('credenciais').insert({ ...linha, cliente_id: clienteId });
    if (versaoDesatualizada(error)) {
      bloquear();
      setAviso(`${AVISO_FRASE_MUDOU} O que estavas a editar não foi guardado.`);
      setForm(null);
      load();
      return;
    }
    if (error) {
      console.error('guardar credencial:', error);
      setForm((f) => (f ? { ...f, erro: 'Não foi possível guardar. Tenta outra vez.' } : f));
      return;
    }
    setForm(null);
    load();
  }

  async function apagar(c: Credencial) {
    if (!confirm(`Apagar a credencial "${c.servico}"?`)) return;
    await supabase.from('credenciais').delete().eq('id', c.id);
    load();
  }

  if (cofre === undefined) return <p className="muted">A carregar…</p>;
  if (!cofre || !aberto) return <CofreGate cofre={cofre} onCriado={() => { setAviso(null); load(); }} aviso={aviso} />;

  const d = form?.draft;
  const setD = (patch: Partial<Draft>) => setForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));

  return (
    <>
      <div className="toolbar">
        <span className="cofre-aberto"><span className="dot ok" /> Cofre desbloqueado</span>
        <span className="muted small">{creds.length} {creds.length === 1 ? 'credencial' : 'credenciais'}</span>
        <div className="spacer" />
        {cofre.versao !== undefined && <button className="small" onClick={() => setMudarFrase(true)}>Mudar frase-passe</button>}
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
          {form.ilegivel && (
            <p className="error-msg" style={{ marginTop: 0 }}>
              A password guardada não decifra com a chave deste cofre. Se não escreveres uma nova, a atual fica como está.
            </p>
          )}
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
          {form.erro && <p className="error-msg">{form.erro}</p>}
          <div className="modal-actions">
            <button onClick={() => setForm(null)}>Cancelar</button>
            <button className="primary" disabled={!d.servico.trim()} onClick={guardar}>Guardar</button>
          </div>
        </Modal>
      )}

      {mudarFrase && (
        <MudarFraseModal
          onClose={() => setMudarFrase(false)}
          onMudada={() => { setMudarFrase(false); load(); }}
          onDesatualizado={() => { setMudarFrase(false); bloquear(); setAviso(AVISO_FRASE_MUDOU); load(); }}
        />
      )}
    </>
  );
}

/* ---------- mudar a frase-passe ---------- */

/**
 * Decifra todos os segredos (de todos os espaços) com a frase atual, cifra-os com a nova e grava tudo
 * numa só transação (função mudar_frase_cofre). Se algo falhar, nada muda.
 */
function MudarFraseModal({ onClose, onMudada, onDesatualizado }: { onClose: () => void; onMudada: () => void; onDesatualizado: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [aceito, setAceito] = useState(false);
  const [estado, setEstado] = useState<string | null>(null); // progresso
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova.length < 12) return setErro('A frase nova tem de ter pelo menos 12 caracteres.');
    if (nova !== confirmar) return setErro('As frases novas não coincidem.');
    if (nova === atual) return setErro('A frase nova é igual à atual.');
    try {
      setEstado('A ler as credenciais…');
      const [{ data: cf, error: e1 }, { data: cs, error: e2 }] = await Promise.all([
        supabase.from('cofre').select('*').eq('id', 1).single(),
        supabase.from('credenciais').select('id, servico, segredo').not('segredo', 'is', null),
      ]);
      if (e1 || e2 || !cf) throw e1 ?? e2 ?? new Error('cofre não encontrado');
      const cofre = cf as Cofre;
      const lista = (cs as Pick<Credencial, 'id' | 'servico' | 'segredo'>[]).map((c) => ({ id: c.id, servico: c.servico, segredo: c.segredo! }));
      if (cofre.versao === undefined) return setErro('Falta correr a migração 20261012000000_cofre_mudar_frase.sql.');
      if (cofre.versao !== versaoCofre()) return onDesatualizado();

      setEstado(`A cifrar ${lista.length} ${lista.length === 1 ? 'credencial' : 'credenciais'} com a frase nova…`);
      const m = await prepararMudanca(atual, nova, cofre, lista);

      setEstado('A gravar…');
      const { data: novaVersao, error } = await supabase.rpc('mudar_frase_cofre', {
        versao_atual: cofre.versao,
        novo_salt: m.salt,
        novas_iteracoes: m.iteracoes,
        novo_verificador: m.verificador,
        segredos: m.segredos,
      });
      if (error) {
        if (versaoDesatualizada(error)) return onDesatualizado();
        if (error.message.includes('segredos_incompletos')) {
          return setErro('Alguém adicionou ou apagou uma credencial durante a mudança. Nada foi alterado — tenta outra vez.');
        }
        throw error;
      }
      aplicarMudanca(m.chave, novaVersao as number);
      setFeito(true);
    } catch (e) {
      if (e instanceof ErroMudanca && e.motivo === 'frase-atual') setErro('A frase atual está errada.');
      else if (e instanceof ErroMudanca) setErro(`${e.ids.length} credencial(is) não decifram com a frase atual — nada foi alterado. Revê-as antes de mudar a frase.`);
      else {
        console.error('mudar frase-passe:', e);
        setErro('Não foi possível mudar a frase-passe. Nada foi alterado.');
      }
    } finally {
      setEstado(null);
    }
  }

  if (feito) {
    return (
      <Modal title="Frase-passe mudada">
        <p>Todas as credenciais foram cifradas de novo com a frase nova.</p>
        <p className="small muted">
          Avisa o outro sócio: no browser dele o cofre vai pedir a frase nova. A configuração anterior fica guardada
          em <span className="mono">cofre_backup</span> (só acessível por SQL), caso seja preciso voltar atrás.
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={onMudada}>Fechar</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Mudar a frase-passe do cofre" onClose={estado ? undefined : onClose}>
      <form onSubmit={submeter}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Todas as passwords (de todos os espaços) são decifradas com a frase atual e cifradas com a nova, e tudo é
          gravado de uma vez. Se alguma coisa falhar, fica tudo como estava.
        </p>
        <div className="field">
          <label>Frase atual</label>
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" autoFocus />
        </div>
        <div className="field">
          <label>Frase nova</label>
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Confirmar frase nova</label>
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />
        </div>
        <label className="check">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
          Já guardei a frase nova fora do CRM e vou passá-la ao outro sócio.
        </label>
        {estado && <p className="small muted">{estado}</p>}
        {erro && <p className="error-msg">{erro}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={!!estado}>Cancelar</button>
          <button className="primary" disabled={!!estado || !atual || !nova || !aceito}>
            {estado ? 'A mudar…' : 'Mudar frase-passe'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
