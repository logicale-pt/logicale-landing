import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, tabelaEmFalta } from '../lib/supabase';
import { fmtDateTime, fmtEUR, monthISO, monthLabel, timeAgo } from '../lib/utils';
import { custoRecorrenteMensal, somaMes } from '../lib/custos';
import { ESPACO_INTERNO } from '../lib/espacos';
import type { Cliente, Custo, Incidente, Mensalidade, Pagamento, Run, RunEstado } from '../lib/types';
import Donut, { dobrarFatias } from '../components/Donut';

type IncidenteRow = Incidente & {
  clientes: { nome: string } | null;
  runs: { estado: string; mensagem: string | null; automacao_id: string; automacoes: { nome: string } | null } | null;
};
type RunRow = Run & { automacoes: { nome: string; clientes: { nome: string } | null } | null };
type PagamentoRow = Pagamento & { clientes: { nome: string } | null };
type Vista = 'cliente' | 'ferramenta';

const ESTADOS_RUN: RunEstado[] = ['ok', 'erro', 'missed'];

/** Nº de runs de um estado desde `desde` — count no servidor (a lista da tabela fica limitada a 50). */
async function contarRuns(estado: RunEstado, desde: string): Promise<number> {
  const { count } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado)
    .gte('started_at', desde);
  return count ?? 0;
}

export default function Dashboard() {
  const [incidentes, setIncidentes] = useState<IncidenteRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runsPorEstado, setRunsPorEstado] = useState<Record<RunEstado, number>>({ ok: 0, erro: 0, missed: 0 });
  const [mrr, setMrr] = useState(0);
  const [numClientes, setNumClientes] = useState<number | null>(null);
  const [atrasados, setAtrasados] = useState<PagamentoRow[]>([]);
  const [custos, setCustos] = useState<Custo[] | null>(null); // null = tabela ainda não existe
  const [clientes, setClientes] = useState<Pick<Cliente, 'id' | 'nome' | 'created_at'>[]>([]);
  const [vista, setVista] = useState<Vista>('cliente');
  const mes = monthISO();

  useEffect(() => {
    (async () => {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [inc, rn, mens, pag, cst, cls, contagens] = await Promise.all([
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
        supabase.from('custos').select('*'),
        supabase.from('clientes').select('id, nome, created_at').order('created_at'),
        Promise.all(ESTADOS_RUN.map((e) => contarRuns(e, desde))),
      ]);
      setRunsPorEstado({ ok: contagens[0], erro: contagens[1], missed: contagens[2] });
      setCustos(tabelaEmFalta(cst.error) ? null : (cst.data as Custo[]) ?? []);
      setClientes((cls.data as Pick<Cliente, 'id' | 'nome' | 'created_at'>[]) ?? []);
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

  const totalRuns24h = runsPorEstado.ok + runsPorEstado.erro + runsPorEstado.missed;

  // custos: recorrente/mês é o número comparável ao MRR; pontuais do mês à parte
  const custoMensal = custos ? somaMes(custos, mes, true) : 0;
  const pontuaisMes = custos ? somaMes(custos, mes) - custoMensal : 0;
  const margem = mrr - custoMensal;

  const fatias = (() => {
    if (!custos) return [];
    const recorrentes = custos.filter((c) => custoRecorrenteMensal(c, mes) > 0);
    if (vista === 'cliente') {
      // ordem estável: interno primeiro, depois clientes por antiguidade
      const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
      const ordem = [ESPACO_INTERNO, ...clientes.map((c) => c.id)];
      const soma = new Map<string, number>();
      for (const c of recorrentes) {
        const k = c.cliente_id ?? ESPACO_INTERNO;
        soma.set(k, (soma.get(k) ?? 0) + custoRecorrenteMensal(c, mes));
      }
      return dobrarFatias(
        ordem.map((k) => ({ key: k, label: k === ESPACO_INTERNO ? 'LOGICALE (interno)' : nomes.get(k) ?? '?', value: soma.get(k) ?? 0 })),
      );
    }
    const soma = new Map<string, number>();
    for (const c of recorrentes) {
      const k = c.ferramenta?.trim() || 'Sem ferramenta';
      soma.set(k, (soma.get(k) ?? 0) + custoRecorrenteMensal(c, mes));
    }
    return dobrarFatias(
      [...soma.keys()].sort((a, b) => a.localeCompare(b, 'pt')).map((k) => ({ key: k, label: k, value: soma.get(k) ?? 0 })),
    );
  })();

  const hoje = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{hoje}</div>
          <h1>Visão geral</h1>
        </div>
      </div>

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
        <div className="panel stat hero-stat">
          <div className="lbl">MRR · clientes ativos</div>
          <div className="num">{fmtEUR(mrr)}</div>
        </div>
        <div className="panel stat">
          <div className="lbl">Custos / mês</div>
          <div className="num">{custos ? fmtEUR(custoMensal) : '—'}</div>
          {custos && pontuaisMes > 0 && <div className="sub">+ {fmtEUR(pontuaisMes)} pontuais em {monthLabel(mes).split(' ')[0]}</div>}
          {!custos && <div className="sub">corre a migração dos Espaços</div>}
        </div>
        <div className={`panel stat ${custos && margem < 0 ? 'alert' : ''}`}>
          <div className="lbl">Margem / mês</div>
          <div className="num">{custos ? fmtEUR(margem) : '—'}</div>
          {custos && mrr > 0 && <div className="sub">{Math.round((margem / mrr) * 100)}% do MRR</div>}
        </div>
        <div className={`panel stat ${incidentes.length ? 'alert' : ''}`}>
          <div className="lbl">Incidentes abertos</div>
          <div className="num">{incidentes.length}</div>
          {incidentes.length > 0 && <div className="sub"><Link to="/monitorizacao">ver na Monitorização →</Link></div>}
        </div>
      </div>

      <div className="grid dash-split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Para onde vai o dinheiro</div>
              <div className="muted small">Custos recorrentes de {monthLabel(mes)}</div>
            </div>
            <div className="seg" role="group" aria-label="Agrupar custos">
              <button type="button" className={vista === 'cliente' ? 'active' : ''} onClick={() => setVista('cliente')}>Por cliente</button>
              <button type="button" className={vista === 'ferramenta' ? 'active' : ''} onClick={() => setVista('ferramenta')}>Por ferramenta</button>
            </div>
          </div>
          {fatias.length > 0 ? (
            <Donut fatias={fatias} centroLabel="por mês" />
          ) : (
            <div className="empty">
              <p>{custos ? 'Ainda não há custos registados.' : 'Falta criar as tabelas dos Espaços.'}</p>
              {custos && <Link className="btn primary" to={`/espacos/${ESPACO_INTERNO}?aba=custos`}>Registar custos</Link>}
            </div>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel stat">
            <div className="lbl">Runs últimas 24 h</div>
            <div className="num">{totalRuns24h}</div>
            {totalRuns24h > 0 && (
              <div className="run-mix">
                <span><span className="dot ok" /> {runsPorEstado.ok} ok</span>
                <span><span className="dot erro" /> {runsPorEstado.erro} erro</span>
                <span><span className="dot missed" /> {runsPorEstado.missed} missed</span>
              </div>
            )}
          </div>
          <div className={`panel stat ${atrasados.length ? 'alert' : ''}`}>
            <div className="lbl">Pagamentos em atraso</div>
            <div className="num">{atrasados.length}</div>
            <div className="sub"><Link to="/financeiro">abrir Financeiro →</Link></div>
          </div>
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

      <h2>
        Runs últimas 24 h
        {totalRuns24h > runs.length && <span className="muted small"> · {runs.length} mais recentes de {totalRuns24h}</span>}
      </h2>
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
