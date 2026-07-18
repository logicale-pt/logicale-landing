import { useCallback, useEffect, useState, type DragEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ASSIGNEES, nameFromEmail } from '../lib/utils';
import type { Cliente, KanbanColuna, Tarefa } from '../lib/types';
import Modal from '../components/Modal';

const COLUNAS: { key: KanbanColuna; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'em_curso', label: 'Em curso' },
  { key: 'espera_cliente', label: 'À espera do cliente' },
  { key: 'feito', label: 'Feito' },
];

export default function Kanban({ session }: { session: Session }) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<KanbanColuna | null>(null);
  const [nova, setNova] = useState(false);
  // form nova tarefa
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [assignee, setAssignee] = useState<string>(nameFromEmail(session.user.email));

  const load = useCallback(async () => {
    const [{ data: ts }, { data: cs }] = await Promise.all([
      supabase.from('tarefas').select('*').order('ordem'),
      supabase.from('clientes').select('*').order('nome'),
    ]);
    setTarefas((ts as Tarefa[]) ?? []);
    setClientes((cs as Cliente[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clienteNome = (id: string | null) => clientes.find((c) => c.id === id)?.nome;

  async function criarTarefa() {
    if (!titulo.trim()) return;
    const maxOrdem = Math.max(0, ...tarefas.filter((t) => t.coluna === 'backlog').map((t) => t.ordem));
    await supabase.from('tarefas').insert({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      cliente_id: clienteId || null,
      assignee,
      coluna: 'backlog',
      ordem: maxOrdem + 1,
    });
    setNova(false);
    setTitulo('');
    setDescricao('');
    setClienteId('');
    load();
  }

  async function apagarTarefa(t: Tarefa) {
    if (!confirm(`Apagar "${t.titulo}"?`)) return;
    await supabase.from('tarefas').delete().eq('id', t.id);
    load();
  }

  async function moverPara(coluna: KanbanColuna, beforeId?: string) {
    if (!dragId) return;
    const movida = tarefas.find((t) => t.id === dragId);
    if (!movida) return;

    // nova ordem da coluna destino: insere antes de beforeId, ou no fim
    const col = tarefas
      .filter((t) => t.coluna === coluna && t.id !== dragId)
      .sort((a, b) => a.ordem - b.ordem);
    const idx = beforeId ? col.findIndex((t) => t.id === beforeId) : -1;
    const novaCol = idx >= 0
      ? [...col.slice(0, idx), movida, ...col.slice(idx)]
      : [...col, movida];

    // otimista + persistência das ordens
    setTarefas((ts) =>
      ts.map((t) => {
        const pos = novaCol.findIndex((x) => x.id === t.id);
        return pos >= 0 ? { ...t, coluna, ordem: pos } : t;
      }),
    );
    setDragId(null);
    setOverCol(null);
    await Promise.all(
      novaCol.map((t, pos) =>
        supabase.from('tarefas').update({ coluna, ordem: pos }).eq('id', t.id),
      ),
    );
  }

  function onDropCol(e: DragEvent, coluna: KanbanColuna) {
    e.preventDefault();
    moverPara(coluna);
  }

  const visiveis = filtroCliente ? tarefas.filter((t) => t.cliente_id === filtroCliente) : tarefas;

  return (
    <>
      <h1>Kanban</h1>
      <div className="toolbar">
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <div className="spacer" />
        <button className="primary" onClick={() => setNova(true)}>+ tarefa</button>
      </div>

      <div className="kanban">
        {COLUNAS.map((col) => (
          <div
            key={col.key}
            className={`col ${overCol === col.key ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol(null)}
            onDrop={(e) => onDropCol(e, col.key)}
          >
            <h3>
              {col.label} <span className="muted">({visiveis.filter((t) => t.coluna === col.key).length})</span>
            </h3>
            {visiveis
              .filter((t) => t.coluna === col.key)
              .sort((a, b) => a.ordem - b.ordem)
              .map((t) => (
                <div
                  key={t.id}
                  className={`card ${dragId === t.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    moverPara(col.key, t.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>{t.titulo}</span>
                    <button
                      className="small danger"
                      style={{ border: 'none', background: 'none', padding: 0 }}
                      onClick={() => apagarTarefa(t)}
                      title="apagar"
                    >
                      ×
                    </button>
                  </div>
                  {t.descricao && <div className="small muted">{t.descricao}</div>}
                  <div className="meta">
                    {t.cliente_id && <span className="tag novo">{clienteNome(t.cliente_id) ?? '?'}</span>}
                    {t.assignee && <span>{t.assignee}</span>}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>

      {nova && (
        <Modal title="Nova tarefa" onClose={() => setNova(false)}>
          <div className="field">
            <label>Título *</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Descrição</label>
            <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="row">
            <div className="field">
              <label>Cliente (opcional)</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">—</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Assignee</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {ASSIGNEES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setNova(false)}>Cancelar</button>
            <button className="primary" disabled={!titulo.trim()} onClick={criarTarefa}>
              Criar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
