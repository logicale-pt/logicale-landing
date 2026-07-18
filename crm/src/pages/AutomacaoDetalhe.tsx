import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmtDateTime, fmtEUR, scheduleLabel } from '../lib/utils';
import type { Automacao, Run } from '../lib/types';

type AutomacaoRow = Automacao & { clientes: { nome: string } | null };

export default function AutomacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [automacao, setAutomacao] = useState<AutomacaoRow | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: a }, { data: rs }] = await Promise.all([
        supabase.from('automacoes').select('*, clientes(nome)').eq('id', id).single(),
        supabase
          .from('runs')
          .select('*')
          .eq('automacao_id', id)
          .order('started_at', { ascending: false })
          .limit(200),
      ]);
      setAutomacao(a as AutomacaoRow);
      setRuns((rs as Run[]) ?? []);
    })();
  }, [id]);

  if (!automacao) return <p className="muted">A carregar…</p>;

  return (
    <>
      <p className="small">
        <Link to="/monitorizacao">← Monitorização</Link>
      </p>
      <h1>
        {automacao.nome}{' '}
        <span className={`tag ${automacao.ativa ? 'ativo' : 'inativo'}`}>
          {automacao.ativa ? 'ativa' : 'desativada'}
        </span>
      </h1>
      <p className="muted">
        <Link to={`/clientes/${automacao.cliente_id}`}>{automacao.clientes?.nome ?? '?'}</Link> ·{' '}
        {automacao.tipo_entrega} · {scheduleLabel(automacao)} · {fmtEUR(Number(automacao.preco_mensal))}/mês
        {automacao.descricao && <> · {automacao.descricao}</>}
      </p>

      <h2>Histórico de runs ({runs.length})</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Quando</th><th>Estado</th><th>Duração</th><th>Custo</th><th>Mensagem</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.started_at)}</td>
                <td><span className={`tag ${r.estado}`}>{r.estado}</span></td>
                <td>{r.duracao_seg != null ? `${r.duracao_seg}s` : '—'}</td>
                <td>{r.custo != null ? fmtEUR(Number(r.custo)) : '—'}</td>
                <td className="muted">{r.mensagem ?? ''}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={5} className="muted">Ainda sem runs — testa o ping com o curl do token.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
