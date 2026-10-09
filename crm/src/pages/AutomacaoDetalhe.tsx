import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, tabelaEmFalta } from '../lib/supabase';
import { fmtDateTime, fmtEUR, scheduleLabel } from '../lib/utils';
import type { Automacao, Run, RunDiaria } from '../lib/types';

type AutomacaoRow = Automacao & { clientes: { nome: string } | null };
type Totais = Pick<RunDiaria, 'ok' | 'erro' | 'missed' | 'custo_total'>;

export default function AutomacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [automacao, setAutomacao] = useState<AutomacaoRow | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [totais, setTotais] = useState<Totais | null>(null); // null = sem runs_diarias (migração por correr)

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: a }, { data: rs }, dias] = await Promise.all([
        supabase.from('automacoes').select('*, clientes(nome)').eq('id', id).single(),
        supabase
          .from('runs')
          .select('*')
          .eq('automacao_id', id)
          .order('started_at', { ascending: false })
          .limit(200),
        // 1 linha por dia com runs → 1000 linhas (max-rows) chegam para ~2,7 anos
        supabase.from('runs_diarias').select('ok, erro, missed, custo_total').eq('automacao_id', id),
      ]);
      setAutomacao(a as AutomacaoRow);
      setRuns((rs as Run[]) ?? []);
      if (!dias.error) {
        setTotais(
          ((dias.data as Totais[]) ?? []).reduce<Totais>(
            (s, d) => ({ ok: s.ok + d.ok, erro: s.erro + d.erro, missed: s.missed + d.missed, custo_total: s.custo_total + Number(d.custo_total) }),
            { ok: 0, erro: 0, missed: 0, custo_total: 0 },
          ),
        );
      } else if (!tabelaEmFalta(dias.error)) console.error('runs_diarias:', dias.error);
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

      {totais && totais.ok + totais.erro + totais.missed > 0 && (
        <div className="run-mix" style={{ marginBottom: 6 }}>
          <span className="muted small">Desde o início:</span>
          <span><span className="dot ok" /> {totais.ok} ok</span>
          <span><span className="dot erro" /> {totais.erro} erro</span>
          <span><span className="dot missed" /> {totais.missed} missed</span>
          {totais.custo_total > 0 && <span className="muted small">custo {fmtEUR(totais.custo_total)}</span>}
        </div>
      )}

      <h2>Histórico de runs ({runs.length})</h2>
      <p className="muted small">
        Runs <b>ok</b> com mais de 30 dias são apagadas automaticamente (fica o resumo diário); erros e missed ficam sempre.
      </p>
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
