import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateTime, fmtEUR, timeAgo } from '../lib/utils';
import type { Incidente, Mensalidade, Pagamento, Run } from '../lib/types';

type IncidenteRow = Incidente & {
  clientes: { nome: string } | null;
  runs: { estado: string; mensagem: string | null; automacao_id: string; automacoes: { nome: string } | null } | null;
};
type RunRow = Run & { automacoes: { nome: string; clientes: { nome: string } | null } | null };
type PagamentoRow = Pagamento & { clientes: { nome: string } | null };

export default function Dashboard() {
  const [incidentes, setIncidentes] = useState<IncidenteRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [mrr, setMrr] = useState(0);
  const [numClientes, setNumClientes] = useState<number | null>(null);
  const [atrasados, setAtrasados] = useState<PagamentoRow[]>([]);

  useEffect(() => {
    (async () => {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [inc, rn, mens, pag] = await Promise.all([
        supabase
          .from('incidentes')
          .select('*, clientes(nome), runs(estado, mensagem, automacao_id, automacoes(nome))')
          .neq('estado', 'resolvido')
          .order('created_at', { ascending: false }),
        supabase
          .from('runs')
          .select('*, automacoes(nome, clientes(nome))')
          .gte('started_at', desde)
          .order('started_at', { ascending: false })
          .limit(50),
        supabase.from('mensalidades').select('*'),
        supabase
          .from('pagamentos')
          .select('*, clientes(nome)')
          .eq('estado', 'em_atraso')
          .order('mes', { ascending: false }),
      ]);
      setIncidentes((inc.data as IncidenteRow[]) ?? []);
      setRuns((rn.data as RunRow[]) ?? []);
      const mensT = (mens.data as Mensalidade[]) ?? [];
      setNumClientes(mensT.length);
      setMrr(
        mensT
          .filter((m) => m.cliente_estado === 'ativo')
          .reduce((s, m) => s + Number(m.mensalidade), 0),
      );
      setAtrasados((pag.data as PagamentoRow[]) ?? []);
    })();
  }, []);

  const porEstado = (e: string) => runs.filter((r) => r.estado === e).length;

  return (
    <>
      <h1>Dashboard</h1>

      {numClientes === 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <strong>Primeiros passos</strong>
          <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 2 }}>
            <li><Link to="/clientes/novo">Cria o primeiro cliente</Link> com as automações dele — cada uma gera um token de ping.</li>
            <li>Cola o comando curl no prompt da automação (Cowork/Routine) ou no wrapper da VM.</li>
            <li>Acompanha as execuções na <Link to="/monitorizacao">Monitorização</Link> — erros e falhas criam incidentes aqui.</li>
          </ol>
        </div>
      )}

      <div className="grid cols-4">
        <div className={`panel stat ${incidentes.length ? 'alert' : ''}`}>
          <div className="num">{incidentes.length}</div>
          <div className="lbl">Incidentes abertos</div>
        </div>
        <div className="panel stat">
          <div className="num">{fmtEUR(mrr)}</div>
          <div className="lbl">MRR (clientes ativos)</div>
        </div>
        <div className="panel stat">
          <div className="num">{runs.length}</div>
          <div className="lbl">
            Runs últimas 24 h
            {runs.length > 0 && (
              <span> — {porEstado('ok')} ok · {porEstado('erro')} erro · {porEstado('missed')} missed</span>
            )}
          </div>
        </div>
        <div className={`panel stat ${atrasados.length ? 'alert' : ''}`}>
          <div className="num">{atrasados.length}</div>
          <div className="lbl">Pagamentos em atraso</div>
        </div>
      </div>

      {incidentes.length > 0 && (
        <>
          <h2>Incidentes abertos</h2>
          <div className="panel incidente-novo" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Quando</th><th>Cliente</th><th>Automação</th><th>Tipo</th><th>Estado</th><th>Mensagem</th></tr>
              </thead>
              <tbody>
                {incidentes.map((i) => (
                  <tr key={i.id}>
                    <td>{fmtDateTime(i.created_at)}</td>
                    <td>{i.clientes?.nome ?? '—'}</td>
                    <td>{i.runs?.automacoes?.nome ?? '—'}</td>
                    <td><span className={`tag ${i.runs?.estado ?? ''}`}>{i.runs?.estado ?? '?'}</span></td>
                    <td><span className={`tag ${i.estado === 'novo' ? 'novo-inc' : i.estado}`}>{i.estado}</span></td>
                    <td className="muted">{i.runs?.mensagem ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small" style={{ padding: '8px 10px' }}>
              <Link to="/monitorizacao">→ gerir na Monitorização</Link>
            </p>
          </div>
        </>
      )}

      {atrasados.length > 0 && (
        <>
          <h2>Pagamentos em atraso</h2>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Cliente</th><th>Mês</th><th>Valor</th></tr></thead>
              <tbody>
                {atrasados.map((p) => (
                  <tr key={p.id}>
                    <td>{p.clientes?.nome ?? '—'}</td>
                    <td>{p.mes.slice(0, 7)}</td>
                    <td>{fmtEUR(Number(p.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Runs últimas 24 h</h2>
      <div className="panel" style={{ padding: 0 }}>
        {runs.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>Sem runs nas últimas 24 horas.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Quando</th><th>Cliente</th><th>Automação</th><th>Estado</th><th>Duração</th><th>Mensagem</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td title={fmtDateTime(r.started_at)}>{timeAgo(r.started_at)}</td>
                  <td>{r.automacoes?.clientes?.nome ?? '—'}</td>
                  <td>{r.automacoes?.nome ?? '—'}</td>
                  <td><span className={`tag ${r.estado}`}>{r.estado}</span></td>
                  <td>{r.duracao_seg != null ? `${r.duracao_seg}s` : '—'}</td>
                  <td className="muted">{r.mensagem ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
