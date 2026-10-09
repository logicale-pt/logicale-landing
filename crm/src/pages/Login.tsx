import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import Logotype from '../components/Logotype';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError('Credenciais inválidas.');
    setBusy(false);
    // sucesso: App.tsx apanha o onAuthStateChange e monta a app
  }

  return (
    <div className="login-wrap">
      <svg className="login-lam" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="login-lamg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C2693B" stopOpacity="0.13" />
            <stop offset="0.75" stopColor="#C2693B" stopOpacity="0.03" />
            <stop offset="1" stopColor="#C2693B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-40 980 Q330 430 600 -120 Q870 430 1240 980" fill="none" stroke="url(#login-lamg)" strokeWidth="70" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-40 980 Q330 430 600 -120 Q870 430 1240 980" fill="none" stroke="rgba(194,105,59,0.22)" strokeWidth="1" />
      </svg>
      <form className="login-box panel" onSubmit={onSubmit}>
        <div className="brand">
          <Logotype />
          <small>backoffice</small>
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'A entrar…' : 'Entrar'}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </form>
    </div>
  );
}
