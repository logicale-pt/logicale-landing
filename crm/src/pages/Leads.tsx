import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateTime } from '../lib/utils';
import type { Lead, LeadEstado } from '../lib/types';

const ESTADOS: LeadEstado[] = ['novo', 'contactado', 'reuniao', 'convertido', 'perdido'];

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLeads((data as Lead[]) ?? []));
  }, []);

  async function setEstado(lead: Lead, estado: LeadEstado) {
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, estado } : l)));
    await supabase.from('leads').update({ estado }).eq('id', lead.id);
  }

  const visiveis = filtro ? leads.filter((l) => l.estado === filtro) : leads;

  return (
    <>
      <h1>Leads</h1>
      <div className="toolbar">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <span className="muted small">{visiveis.length} leads</span>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Quando</th><th>Nome</th><th>Empresa</th><th>Email</th>
              <th>Setor</th><th>Intenção</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td>{fmtDateTime(l.created_at)}</td>
                <td>{l.nome ?? '—'}</td>
                <td>{l.empresa ?? '—'}</td>
                <td>{l.email ?? '—'}</td>
                <td className="muted">{l.setor ?? '—'}</td>
                <td className="muted">{l.intencao ?? '—'}</td>
                <td>
                  <select
                    value={l.estado}
                    onChange={(e) => setEstado(l, e.target.value as LeadEstado)}
                    style={{ width: 130 }}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {l.estado !== 'convertido' && (
                    <button
                      className="small"
                      onClick={() => navigate('/clientes/novo', { state: { lead: l } })}
                    >
                      → cliente
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr><td colSpan={8} className="muted">Sem leads.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
