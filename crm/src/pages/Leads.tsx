import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/utils';
import type { Lead, LeadEstado } from '../lib/types';

const ESTADOS: LeadEstado[] = ['novo', 'contactado', 'reuniao', 'convertido', 'perdido'];

function listify(v: unknown): string {
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${String(val)}`)
      .join(' · ');
  }
  return v ? String(v) : '—';
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [aberto, setAberto] = useState<string | null>(null);
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
        <span className="muted small">{visiveis.length} de {leads.length}</span>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Recebido</th><th>Nome</th><th>Empresa</th><th>Email</th>
              <th>Setor</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <Fragment key={l.id}>
                <tr className="clickable" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                  <td><span className={`chev ${aberto === l.id ? 'open' : ''}`}>▶</span></td>
                  <td title={new Date(l.created_at).toLocaleString('pt-PT')}>{timeAgo(l.created_at)}</td>
                  <td>{l.nome ?? '—'}</td>
                  <td>{l.empresa ?? '—'}</td>
                  <td>
                    {l.email ? (
                      <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()}>{l.email}</a>
                    ) : '—'}
                  </td>
                  <td className="muted">{l.setor ?? '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
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
                  <td onClick={(e) => e.stopPropagation()}>
                    {l.estado !== 'convertido' && (
                      <button
                        className="small"
                        onClick={() => navigate('/clientes/novo', { state: { lead: l } })}
                      >
                        Converter em cliente
                      </button>
                    )}
                  </td>
                </tr>
                {aberto === l.id && (
                  <tr className="lead-detail">
                    <td colSpan={8}>
                      <dl className="lead-grid">
                        <div><dt>Dimensão</dt><dd>{l.dimensao ?? '—'}</dd></div>
                        <div><dt>Tarefas a automatizar</dt><dd>{listify(l.tarefas)}</dd></div>
                        <div><dt>Tempo perdido</dt><dd>{l.tempo_perdido ?? '—'}</dd></div>
                        <div><dt>Quem faz hoje</dt><dd>{l.quem_faz ?? '—'}</dd></div>
                        <div><dt>Abertura</dt><dd>{l.abertura ?? '—'}</dd></div>
                        <div><dt>Intenção</dt><dd>{l.intencao ?? '—'}</dd></div>
                        <div><dt>Origem</dt><dd>{l.source}</dd></div>
                        {l.respostas != null && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <dt>Respostas completas</dt>
                            <dd className="mono">{listify(l.respostas)}</dd>
                          </div>
                        )}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty">
                    <p>Ainda não há leads{filtro ? ` no estado "${filtro}"` : ''}.</p>
                    <span className="muted small">O diagnóstico da landing escreve aqui automaticamente.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
