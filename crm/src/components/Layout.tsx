import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { nameFromEmail } from '../lib/utils';
import Logotype from './Logotype';
import {
  IconClientes,
  IconDashboard,
  IconDefinicoes,
  IconFinanceiro,
  IconKanban,
  IconLeads,
  IconMonitorizacao,
} from './icons';

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
    { to: '/', label: 'Dashboard', icon: <IconDashboard /> },
    { to: '/leads', label: 'Leads', icon: <IconLeads /> },
    { to: '/clientes', label: 'Clientes', icon: <IconClientes /> },
    { to: '/kanban', label: 'Kanban', icon: <IconKanban /> },
    { to: '/financeiro', label: 'Financeiro', icon: <IconFinanceiro /> },
    { to: '/monitorizacao', label: 'Monitorização', icon: <IconMonitorizacao />, badge: true },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Logotype />
          <small>backoffice</small>
        </div>
        <nav>
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}>
              {t.icon}
              {t.label}
              {t.badge && abertos > 0 && <span className="badge">{abertos}</span>}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/definicoes" style={{ marginBottom: 8 }} className="nav-settings">
          <IconDefinicoes />
          Definições
        </NavLink>
        <div className="user">
          <b>{nameFromEmail(session.user.email)}</b>
          <button className="small" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
