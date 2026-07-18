import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { nameFromEmail } from '../lib/utils';

/** Dispara refresh do badge de incidentes em todas as tabs. */
export function notifyIncidentesChanged() {
  window.dispatchEvent(new Event('incidentes-changed'));
}

export default function Layout({ session }: { session: Session }) {
  const [abertos, setAbertos] = useState(0);

  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from('incidentes')
      .select('id', { count: 'exact', head: true })
      .neq('estado', 'resolvido');
    setAbertos(count ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    window.addEventListener('incidentes-changed', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('incidentes-changed', refresh);
    };
  }, [refresh]);

  const tabs = [
    { to: '/', label: 'Dashboard' },
    { to: '/leads', label: 'Leads' },
    { to: '/clientes', label: 'Clientes' },
    { to: '/kanban', label: 'Kanban' },
    { to: '/financeiro', label: 'Financeiro' },
    { to: '/monitorizacao', label: 'Monitorização', badge: true },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          λ LogiCale
          <small>backoffice</small>
        </div>
        <nav>
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}>
              {t.label}
              {t.badge && abertos > 0 && <span className="badge">{abertos}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          {nameFromEmail(session.user.email)}
          <br />
          <button className="small" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
