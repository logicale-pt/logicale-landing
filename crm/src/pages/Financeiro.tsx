import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDate, fmtEUR, monthISO, monthLabel, todayISO } from '../lib/utils';
import type { Mensalidade, Pagamento, PagamentoEstado } from '../lib/types';

type PagamentoRow = Pagamento & { clientes: { nome: string } | null };

export default function Financeiro() {
  const [mes, setMes] = useState(monthISO());
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoRow[]>([]);
  // valores editáveis antes de registar (descontos pontuais), por cliente
  const [valores, setValores] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ data: mens }, { data: pags }] = await Promise.all([
      supabase.from('mensalidades').select('*'),
      supabase
        .from('pagamentos')
        .select('*, clientes(nome)')
        .order('mes', { ascending: false }),
    ]);
    setMensalidades((mens as Mensalidade[]) ?? []);
    setPagamentos((pags as PagamentoRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ativos = mensalidades.filter((m) => m.cliente_estado === 'ativo');
  const mrr = ativos.reduce((s, m) => s + Number(m.mensalidade), 0);
  const doMes = pagamentos.filter((p) => p.mes === mes);
  const pagamentoDe = (clienteId: string) => doMes.find((p) => p.cliente_id === clienteId);
  const recebidoMes = doMes.filter((p) => p.estado === 'pago').reduce((s, p) => s + Number(p.valor), 0);

  function shiftMes(delta: number) {
    const [y, m] = mes.split('-').map((n) => parseInt(n, 10));
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }

  // Regista com snapshot do valor (editável antes de registar)
  async function registar(m: Mensalidade, estado: PagamentoEstado) {
    const valor = parseFloat(valores[m.cliente_id] ?? '') || Number(m.mensalidade);
    await supabase.from('pagamentos').insert({
      cliente_id: m.cliente_id,
      mes,
      valor,
      estado,
      data_pagamento: estado === 'pago' ? todayISO() : null,
    });
    load();
  }

  async function mudarEstado(p: Pagamento, estado: PagamentoEstado) {
    await supabase
      .from('pagamentos')
      .update({ estado, data_pagamento: estado === 'pago' ? todayISO() : null })
      .eq('id', p.id);
    load();
  }

  return (
    <>
      <h1>Financeiro</h1>

      <div className="grid cols-2">
        <div className="panel stat">
          <div className="num">{fmtEUR(mrr)}</div>
          <div className="lbl">MRR (mensalidades derivadas, clientes ativos)</div>
        </div>
        <div className="panel stat">
          <div className="num">{fmtEUR(recebidoMes)}</div>
          <div className="lbl">Recebido em {monthLabel(mes)}</div>
        </div>
      </div>

      <h2>Mês</h2>
      <div className="toolbar">
        <button className="fixed" onClick={() => shiftMes(-1)}>←</button>
        <strong className="fixed" style={{ minWidth: 160, textAlign: 'center' }}>{monthLabel(mes)}</strong>
        <button className="fixed" onClick={() => shiftMes(1)}>→</button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Cliente</th><th>Mensalidade atual</th><th>Valor do mês</th><th>Estado</th><th>Pago em</th><th></th></tr>
          </thead>
          <tbody>
            {ativos.map((m) => {
              const p = pagamentoDe(m.cliente_id);
              return (
                <tr key={m.cliente_id}>
                  <td>{m.cliente_nome}</td>
                  <td className="muted">{fmtEUR(Number(m.mensalidade))}</td>
                  <td>
                    {p ? (
                      fmtEUR(Number(p.valor))
                    ) : (
                      <input
                        type="number" min="0" step="0.01" style={{ width: 110 }}
                        placeholder={String(m.mensalidade)}
                        value={valores[m.cliente_id] ?? ''}
                        onChange={(e) => setValores((v) => ({ ...v, [m.cliente_id]: e.target.value }))}
                      />
                    )}
                  </td>
                  <td>{p ? <span className={`tag ${p.estado}`}>{p.estado.replace('_', ' ')}</span> : <span className="muted">—</span>}</td>
                  <td>{p?.data_pagamento ? fmtDate(p.data_pagamento) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p ? (
                      <>
                        {p.estado !== 'pago' && (
                          <button className="small primary" onClick={() => mudarEstado(p, 'pago')}>marcar pago</button>
                        )}{' '}
                        {p.estado === 'pendente' && (
                          <button className="small danger" onClick={() => mudarEstado(p, 'em_atraso')}>em atraso</button>
                        )}
                        {p.estado === 'pago' && (
                          <button className="small" onClick={() => mudarEstado(p, 'pendente')}>desfazer</button>
                        )}
                      </>
                    ) : (
                      <>
                        <button className="small" onClick={() => registar(m, 'pendente')}>registar</button>{' '}
                        <button className="small primary" onClick={() => registar(m, 'pago')}>registar pago</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {ativos.length === 0 && (
              <tr><td colSpan={6} className="muted">Sem clientes ativos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Histórico</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Mês</th><th>Cliente</th><th>Valor (snapshot)</th><th>Estado</th><th>Pago em</th></tr>
          </thead>
          <tbody>
            {pagamentos.map((p) => (
              <tr key={p.id}>
                <td>{p.mes.slice(0, 7)}</td>
                <td>{p.clientes?.nome ?? '—'}</td>
                <td>{fmtEUR(Number(p.valor))}</td>
                <td><span className={`tag ${p.estado}`}>{p.estado.replace('_', ' ')}</span></td>
                <td>{p.data_pagamento ? fmtDate(p.data_pagamento) : '—'}</td>
              </tr>
            ))}
            {pagamentos.length === 0 && (
              <tr><td colSpan={5} className="muted">Sem pagamentos registados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
