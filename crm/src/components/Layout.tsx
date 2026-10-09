import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase, tabelaEmFalta } from '../lib/supabase';
import { fmtDateTime, nameFromEmail } from '../lib/utils';
import { bloquear } from '../lib/cofre';
import Logotype from './Logotype';
import {
  IconClientes,
  IconDashboard,
  IconDefinicoes,
  IconEspacos,
  IconFinanceiro,
  IconKanban,
  IconLeads,
  IconMonitorizacao,
} from './icons';

/** Dispara refresh do badge de incidentes em todas as tabs. */
export function notifyIncidentesChanged() {
  window.dispatchEvent(new Event('incidentes-changed'));
}

/** O check-missed corre de 15 em 15 min; sem heartbeat há mais do que isto ⇒ monitorização parada. */
const HEARTBEAT_MAX_MS = 35 * 60_000;

export default function Layout({ session }: { session: Session }) {
  const [abertos, setAbertos] = useState(0);
  const [avisoMonitor, setAvisoMonitor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ count }, hb] = await Promise.all([
      supabase.from('incidentes').select('id', { count: 'exact', head: true }).neq('estado', 'resolvido'),
      supabase.from('heartbeats').select('ultimo_ok').eq('nome', 'check-missed').maybeSingle(),
    ]);
    setAbertos(count ?? 0);
    // erro (ex: migração por aplicar, sessão a renovar) → sem aviso, para não dar alarmes falsos
    if (hb.error) {
      if (!tabelaEmFalta(hb.error)) console.error('heartbeats:', hb.error);
      setAvisoMonitor(null);
    } else if (!hb.data) {
      setAvisoMonitor('A verificação de automações em falta (check-missed) ainda não reportou nenhuma execução — falta o deploy da nova versão?');
    } else {
      const ultimo = (hb.data as { ultimo_ok: string }).ultimo_ok;
      setAvisoMonitor(
        Date.now() - new Date(ultimo).getTime() > HEARTBEAT_MAX_MS
          ? `A verificação de automações em falta (check-missed) não corre desde ${fmtDateTime(ultimo)} — não estão a ser criados alertas de missed.`
          : null,
      );
    }
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
    { to: '/espacos', label: 'Espaços', icon: <IconEspacos /> },
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
          <button className="small" onClick={() => { bloquear(); supabase.auth.signOut(); }}>Sair</button>
        </div>
      </aside>
      <main className="main">
        {avisoMonitor && (
          <div className="panel aviso" role="alert" style={{ marginBottom: 14 }}>
            <strong>Monitorização parada.</strong> <span className="small">{avisoMonitor} Ver SETUP.md §8.</span>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
