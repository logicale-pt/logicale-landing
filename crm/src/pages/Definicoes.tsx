import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { nameFromEmail } from '../lib/utils';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export default function Definicoes({ session }: { session: Session }) {
  const [tema, setTemaState] = useState<Theme>(getTheme());
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function mudarTema(t: Theme) {
    setTheme(t);
    setTemaState(t);
  }

  async function mudarPassword(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) {
      setMsg({ ok: false, texto: 'A password tem de ter pelo menos 8 caracteres.' });
      return;
    }
    if (password !== confirmar) {
      setMsg({ ok: false, texto: 'As passwords não coincidem.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, texto: 'Não foi possível alterar a password. Tenta outra vez.' });
    } else {
      setMsg({ ok: true, texto: 'Password alterada.' });
      setPassword('');
      setConfirmar('');
    }
  }

  return (
    <>
      <h1>Definições</h1>

      <h2>Conta</h2>
      <div className="panel" style={{ maxWidth: 480 }}>
        <table>
          <tbody>
            <tr>
              <td className="muted" style={{ width: 120 }}>Nome</td>
              <td>{nameFromEmail(session.user.email)}</td>
            </tr>
            <tr>
              <td className="muted">Email</td>
              <td>{session.user.email}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Password</h2>
      <form className="panel" style={{ maxWidth: 480 }} onSubmit={mudarPassword}>
        <div className="field">
          <label>Nova password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>Confirmar password</label>
          <input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="primary" disabled={busy || !password}>
            {busy ? 'A alterar…' : 'Alterar password'}
          </button>
          {msg && <span className={msg.ok ? 'success-msg' : 'error-msg'} style={{ margin: 0 }}>{msg.texto}</span>}
        </div>
      </form>

      <h2>Aparência</h2>
      <div className="panel" style={{ maxWidth: 480, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Tema</span>
        <div className="seg" role="group" aria-label="Tema">
          <button type="button" className={tema === 'claro' ? 'active' : ''} onClick={() => mudarTema('claro')}>
            Claro
          </button>
          <button type="button" className={tema === 'escuro' ? 'active' : ''} onClick={() => mudarTema('escuro')}>
            Escuro
          </button>
        </div>
      </div>
    </>
  );
}
