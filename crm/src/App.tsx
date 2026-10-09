import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Clientes from './pages/Clientes';
import ClienteNovo from './pages/ClienteNovo';
import ClienteFicha from './pages/ClienteFicha';
import Kanban from './pages/Kanban';
import Financeiro from './pages/Financeiro';
import Monitorizacao from './pages/Monitorizacao';
import AutomacaoDetalhe from './pages/AutomacaoDetalhe';
import Definicoes from './pages/Definicoes';
import Espacos from './pages/Espacos';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (!session) return <Login />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout session={session} />}>
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/novo" element={<ClienteNovo />} />
          <Route path="clientes/:id" element={<ClienteFicha />} />
          <Route path="kanban" element={<Kanban session={session} />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="monitorizacao" element={<Monitorizacao session={session} />} />
          <Route path="monitorizacao/:id" element={<AutomacaoDetalhe />} />
          <Route path="espacos" element={<Espacos session={session} />} />
          <Route path="espacos/:espaco" element={<Espacos session={session} />} />
          <Route path="definicoes" element={<Definicoes session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
