import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { notifyIncidentesChanged } from '../components/Layout';
import { fmtDateTime, nameFromEmail, proximoEsperado, scheduleLabel, timeAgo } from '../lib/utils';
import type { Automacao, Incidente, Run } from '../lib/types';
import Modal from '../components/Modal';

type AutomacaoRow = Automacao & { clientes: { nome: string } | null };
type IncidenteRow = Incidente & {
  clientes: { nome: string } | null;
  runs: { estado: string; mensagem: string | null; automacoes: { nome: string } | null } | null;
};

export default function Monitorizacao({ session }: { session: Session }) {
  const [automacoes, setAutomacoes] = useState<AutomacaoRow[]>([]);
  const [ultimas, setUltimas] = useState<Map<string, Run>>(new Map());
  const [uptimes, setUptimes] = useState<Map<string, { ok: number; total: number }>>(new Map());
  const [filtro, setFiltro] = useState<'todas' | 'problemas' | 'sem_runs'>('todas');
  const [incidentes, setIncidentes] = useState<IncidenteRow[]>([]);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const [resolvendo, setResolvendo] = useState<IncidenteRow | null>(null);
  const [nota, setNota] = useState('');
  const navigate = useNavigate();
  const eu = nameFromEmail(session.user.email);

  const load = useCallback(async () => {
    const [{ data: autos }, { data: incs }] = await Promise.all([
      supabase.from('automacoes').select('*, clientes(nome)').eq('ativa', true).order('nome'),
      supabase
        .from('incidentes')
        .select('*, clientes(nome), runs(estado, mensagem, automacoes(nome))')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const autosT = (autos as AutomacaoRow[]) ?? [];
    setAutomacoes(autosT);
    setIncidentes((incs as IncidenteRow[]) ?? []);

    // últimas runs (30 dias) numa query só: última run + uptime por automação
    if (autosT.length) {
      const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data: runs } = await supabase
        .from('runs')
        .select('*')
        .in('automacao_id', autosT.map((a) => a.id))
        .gte('started_at', desde)
        .order('started_at', { ascending: false })
        .limit(3000);
      const map = new Map<string, Run>();
      const up = new Map<string, { ok: number; total: number }>();
      for (const r of (runs as Run[]) ?? []) {
        if (!map.has(r.automacao_id)) map.set(r.automacao_id, r);
        const u = up.get(r.automacao_id) ?? { ok: 0, total: 0 };
        u.total += 1;
        if (r.estado === 'ok') u.ok += 1;
        up.set(r.automacao_id, u);
      }
      setUltimas(map);
      setUptimes(up);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assumir(i: IncidenteRow) {
    await supabase.from('incidentes').update({ estado: 'assumido', assignee: eu }).eq('id', i.id);
    notifyIncidentesChanged();
    load();
  }

  async function resolver() {
    if (!resolvendo) return;
    await supabase
      .from('incidentes')
      .update({
        estado: 'resolvido',
        assignee: resolvendo.assignee ?? eu,
        nota_resolucao: nota.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', resolvendo.id);
    setResolvendo(null);
    setNota('');
    notifyIncidentesChanged();
    load();
  }

  const abertos = incidentes.filter((i) => i.estado !== 'resolvido');
  const resolvidos = incidentes.filter((i) => i.estado === 'resolvido');

  return (
    <>
      <h1>Automações / Monitorização</h1>

      <h2>Incidentes {abertos.length > 0 && <span className="badge">{abertos.length}</span>}</h2>
      <div className={`panel ${abertos.length ? 'incidente-novo' : ''}`} style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Quando</th><th>Cliente</th><th>Automação</th><th>Tipo</th><th>Estado</th><th>Assignee</th><th>Mensagem</th><th></th></tr>
          </thead>
          <tbody>
            {abertos.map((i) => (
              <tr key={i.id}>
                <td>{fmtDateTime(i.created_at)}</td>
                <td>{i.clientes?.nome ?? '—'}</td>
                <td>{i.runs?.automacoes?.nome ?? '—'}</td>
                <td><span className={`tag ${i.runs?.estado ?? ''}`}>{i.runs?.estado ?? '?'}</span></td>
                <td><span className={`tag ${i.estado === 'novo' ? 'novo-inc' : i.estado}`}>{i.estado}</span></td>
                <td>{i.assignee ?? '—'}</td>
                <td className="muted small">{i.runs?.mensagem ?? ''}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {i.estado === 'novo' && (
                    <button className="small primary" onClick={() => assumir(i)}>assumir</button>
                  )}{' '}
                  <button className="small" onClick={() => setResolvendo(i)}>resolver</button>
                </td>
              </tr>
            ))}
            {abertos.length === 0 && (
              <tr><td colSpan={8} className="muted">Sem incidentes abertos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="small">
        <button className="small" onClick={() => setVerResolvidos((v) => !v)}>
          {verResolvidos ? 'esconder resolvidos' : `ver resolvidos (${resolvidos.length})`}
        </button>
      </p>
      {verResolvidos && (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Quando</th><th>Cliente</th><th>Automação</th><th>Assignee</th><th>Resolvido</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {resolvidos.map((i) => (
                <tr key={i.id}>
                  <td>{fmtDateTime(i.created_at)}</td>
                  <td>{i.clientes?.nome ?? '—'}</td>
                  <td>{i.runs?.automacoes?.nome ?? '—'}</td>
                  <td>{i.assignee ?? '—'}</td>
                  <td>{fmtDateTime(i.resolved_at)}</td>
                  <td className="muted small">{i.nota_resolucao ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Automações ativas</h2>
      <div className="toolbar">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="todas">Todas</option>
          <option value="problemas">Só com problemas</option>
          <option value="sem_runs">Ainda sem runs</option>
        </select>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th style={{ width: 28 }}></th><th>Automação</th><th>Cliente</th><th>Schedule</th><th>Última execução</th><th>Próximo esperado</th><th className="num">Uptime 30 d</th></tr>
          </thead>
          <tbody>
            {automacoes
              .filter((a) => {
                const ultima = ultimas.get(a.id);
                if (filtro === 'problemas') return ultima != null && ultima.estado !== 'ok';
                if (filtro === 'sem_runs') return ultima == null;
                return true;
              })
              .map((a) => {
              const ultima = ultimas.get(a.id);
              const prox = proximoEsperado(a);
              const up = uptimes.get(a.id);
              const pct = up && up.total > 0 ? (up.ok / up.total) * 100 : null;
              return (
                <tr key={a.id} className="clickable" onClick={() => navigate(`/monitorizacao/${a.id}`)}>
                  <td><span className={`dot ${ultima?.estado ?? 'none'}`} /></td>
                  <td>{a.nome}</td>
                  <td>{a.clientes?.nome ?? '—'}</td>
                  <td className="small muted">{scheduleLabel(a)}</td>
                  <td>
                    {ultima ? (
                      <>
                        <span className={`tag ${ultima.estado}`}>{ultima.estado}</span>{' '}
                        <span className="muted small" title={fmtDateTime(ultima.started_at)}>
                          {timeAgo(ultima.started_at)}
                        </span>
                      </>
                    ) : (
                      <span className="muted">sem runs</span>
                    )}
                  </td>
                  <td className="muted small">{prox ? fmtDateTime(prox.toISOString()) : '—'}</td>
                  <td className="num">
                    {pct == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={pct >= 99 ? 'uptime-ok' : pct >= 90 ? 'uptime-warn' : 'uptime-bad'}>
                        {pct.toFixed(pct === 100 ? 0 : 1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {automacoes.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <p>Sem automações ativas.</p>
                    <span className="muted small">
                      Cria-as na ficha do <Link to="/clientes">cliente</Link> — cada uma recebe um token de
                      ping para a monitorização.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resolvendo && (
        <Modal title="Resolver incidente" onClose={() => setResolvendo(null)}>
          <p className="small muted">
            {resolvendo.runs?.automacoes?.nome ?? '?'} — {resolvendo.clientes?.nome ?? '?'}
          </p>
          <div className="field">
            <label>Nota de resolução (curta)</label>
            <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setResolvendo(null)}>Cancelar</button>
            <button className="primary" onClick={resolver}>Resolver</button>
          </div>
        </Modal>
      )}
    </>
  );
}
