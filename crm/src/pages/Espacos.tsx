import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fmtEUR, monthISO, nameFromEmail } from '../lib/utils';
import { custoRecorrenteMensal } from '../lib/custos';
import { ESPACO_INTERNO, clienteIdDoEspaco, tabelaEmFalta } from '../lib/espacos';
import type { Cliente, Custo } from '../lib/types';
import NotasPanel from '../components/espacos/NotasPanel';
import CustosPanel from '../components/espacos/CustosPanel';
import CredenciaisPanel from '../components/espacos/CredenciaisPanel';

type Aba = 'notas' | 'custos' | 'credenciais';
const ABAS: { key: Aba; label: string }[] = [
  { key: 'notas', label: 'Notas & ideias' },
  { key: 'custos', label: 'Custos' },
  { key: 'credenciais', label: 'Credenciais' },
];

export default function Espacos({ session }: { session: Session }) {
  const { espaco } = useParams<{ espaco: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [custoPorEspaco, setCustoPorEspaco] = useState<Map<string, number>>(new Map());
  const [semMigracao, setSemMigracao] = useState(false);
  const [contagens, setContagens] = useState({ notas: 0, credenciais: 0, custoMes: 0 });
  const eu = nameFromEmail(session.user.email);

  const aba = (ABAS.some((a) => a.key === params.get('aba')) ? params.get('aba') : 'notas') as Aba;
  const clienteId = espaco ? clienteIdDoEspaco(espaco) : null;
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;

  const loadRail = useCallback(async () => {
    const mes = monthISO();
    const [{ data: cs }, custosRes] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('custos').select('*'),
    ]);
    setClientes((cs as Cliente[]) ?? []);
    if (tabelaEmFalta(custosRes.error)) return setSemMigracao(true);
    const m = new Map<string, number>();
    for (const c of (custosRes.data as Custo[]) ?? []) {
      const k = c.cliente_id ?? ESPACO_INTERNO;
      m.set(k, (m.get(k) ?? 0) + custoRecorrenteMensal(c, mes));
    }
    setCustoPorEspaco(m);
  }, []);

  useEffect(() => {
    loadRail();
  }, [loadRail]);

  // contagens do cabeçalho do espaço atual
  useEffect(() => {
    if (!espaco || semMigracao) return;
    (async () => {
      const qn = supabase.from('notas').select('id', { count: 'exact', head: true });
      const qc = supabase.from('credenciais').select('id', { count: 'exact', head: true });
      const [n, cr] = await Promise.all([
        clienteId ? qn.eq('cliente_id', clienteId) : qn.is('cliente_id', null),
        clienteId ? qc.eq('cliente_id', clienteId) : qc.is('cliente_id', null),
      ]);
      if (tabelaEmFalta(n.error)) return setSemMigracao(true);
      setContagens((c) => ({ ...c, notas: n.count ?? 0, credenciais: cr.count ?? 0 }));
    })();
  }, [espaco, clienteId, semMigracao]);

  const onNotas = useCallback((n: number) => setContagens((c) => ({ ...c, notas: n })), []);
  const onCreds = useCallback((n: number) => setContagens((c) => ({ ...c, credenciais: n })), []);
  const onCusto = useCallback(
    (v: number) => {
      setContagens((c) => ({ ...c, custoMes: v }));
      setCustoPorEspaco((m) => new Map(m).set(espaco ?? ESPACO_INTERNO, v));
    },
    [espaco],
  );

  if (!espaco) return <Navigate to={`/espacos/${ESPACO_INTERNO}`} replace />;

  const ativos = clientes.filter((c) => c.estado === 'ativo');
  const inativos = clientes.filter((c) => c.estado !== 'ativo');
  const custoMes = custoPorEspaco.get(espaco) ?? contagens.custoMes;

  function itemRail(id: string, nome: string, sub?: string, interno = false) {
    const v = custoPorEspaco.get(id) ?? 0;
    return (
      <button
        key={id}
        className={`rail-item ${espaco === id ? 'active' : ''}`}
        onClick={() => navigate(`/espacos/${id}?aba=${aba}`)}
      >
        <span className={`rail-avatar ${interno ? 'interno' : ''}`} aria-hidden="true">
          {interno ? (
            <svg viewBox="0 0 20 24" width="11" height="13"><path d="M2 22 L10 3 L18 22" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" /></svg>
          ) : (
            nome.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="rail-txt">
          <span className="rail-nome">{nome}</span>
          {sub && <span className="rail-sub">{sub}</span>}
        </span>
        {v > 0 && <span className="rail-valor">{fmtEUR(v)}</span>}
      </button>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Espaços</div>
          <h1>Notas, custos e acessos</h1>
        </div>
      </div>

      {semMigracao ? (
        <div className="panel aviso">
          <strong>Falta criar as tabelas desta secção.</strong>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Corre <span className="mono">supabase/migrations/20261009000000_espacos.sql</span> no SQL Editor da Supabase e recarrega a página.
          </p>
        </div>
      ) : (
        <div className="espacos">
          <nav className="rail" aria-label="Espaços">
            <div className="rail-grupo">Nós</div>
            {itemRail(ESPACO_INTERNO, 'LOGICALE', 'interno', true)}
            <div className="rail-grupo">Clientes</div>
            {ativos.map((c) => itemRail(c.id, c.nome, c.empresa ?? undefined))}
            {ativos.length === 0 && <p className="muted small" style={{ padding: '2px 10px' }}>Sem clientes ativos.</p>}
            {inativos.length > 0 && (
              <details className="rail-inativos">
                <summary>Inativos ({inativos.length})</summary>
                {inativos.map((c) => itemRail(c.id, c.nome, c.empresa ?? undefined))}
              </details>
            )}
          </nav>

          <section className="espaco">
            <header className="espaco-head">
              <div style={{ minWidth: 0 }}>
                <h2 className="espaco-titulo">{clienteId ? cliente?.nome ?? '…' : 'LOGICALE'}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {clienteId ? (
                    <>
                      {cliente?.empresa ? `${cliente.empresa} · ` : ''}
                      <Link to={`/clientes/${clienteId}`}>ficha do cliente →</Link>
                    </>
                  ) : (
                    'O nosso espaço: ferramentas, subscrições, acessos e ideias internas.'
                  )}
                </p>
              </div>
              <div className="espaco-kpis">
                <div><span className="kpi-num">{fmtEUR(custoMes)}</span><span className="kpi-lbl">custos / mês</span></div>
                <div><span className="kpi-num">{contagens.notas}</span><span className="kpi-lbl">notas</span></div>
                <div><span className="kpi-num">{contagens.credenciais}</span><span className="kpi-lbl">acessos</span></div>
              </div>
            </header>

            <div className="tabs" role="tablist">
              {ABAS.map((a) => (
                <button
                  key={a.key}
                  role="tab"
                  aria-selected={aba === a.key}
                  className={aba === a.key ? 'active' : ''}
                  onClick={() => setParams({ aba: a.key }, { replace: true })}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="tab-body">
              {aba === 'notas' && <NotasPanel key={espaco} clienteId={clienteId} eu={eu} onCount={onNotas} />}
              {aba === 'custos' && <CustosPanel key={espaco} clienteId={clienteId} onTotal={onCusto} />}
              {aba === 'credenciais' && <CredenciaisPanel key={espaco} clienteId={clienteId} eu={eu} onCount={onCreds} />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
