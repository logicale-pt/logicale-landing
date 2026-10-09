import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import type { Nota, NotaTipo } from '../../lib/types';

const TIPOS: { key: NotaTipo; label: string; emoji: string }[] = [
  { key: 'ideia', label: 'Ideia', emoji: '💡' },
  { key: 'nota', label: 'Nota', emoji: '📝' },
  { key: 'reuniao', label: 'Reunião', emoji: '🗓️' },
];
const EMOJI: Record<NotaTipo, string> = { ideia: '💡', nota: '📝', reuniao: '🗓️' };

type Estado = 'idle' | 'a-guardar' | 'guardado' | 'erro';

/** Páginas estilo Notion: lista à esquerda, editor sem moldura à direita, autosave. */
export default function NotasPanel({ clienteId, eu, onCount }: { clienteId: string | null; eu: string; onCount?: (n: number) => void }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('idle');
  const [filtro, setFiltro] = useState('');
  const pendente = useRef<{ id: string; patch: Partial<Nota> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const corpo = useRef<HTMLTextAreaElement>(null);
  const titulo = useRef<HTMLTextAreaElement>(null);
  const onCountRef = useRef(onCount);
  const focarTitulo = useRef(false);
  onCountRef.current = onCount;

  const load = useCallback(async () => {
    const q = supabase.from('notas').select('*');
    const { data } = await (clienteId ? q.eq('cliente_id', clienteId) : q.is('cliente_id', null))
      .order('fixada', { ascending: false })
      .order('updated_at', { ascending: false });
    const ns = (data as Nota[]) ?? [];
    setNotas(ns);
    onCountRef.current?.(ns.length);
    setSelId((cur) => (cur && ns.some((n) => n.id === cur) ? cur : ns[0]?.id ?? null));
  }, [clienteId]);

  useEffect(() => {
    setSelId(null);
    load();
  }, [load]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pendente.current;
    if (!p) return;
    pendente.current = null;
    const { error } = await supabase.from('notas').update(p.patch).eq('id', p.id);
    setEstado(error ? 'erro' : 'guardado');
  }, []);

  // guarda o que estiver pendente ao trocar de nota / sair da página
  useEffect(() => () => void flush(), [flush, selId]);

  const sel = notas.find((n) => n.id === selId) ?? null;

  // foca o título da nota acabada de criar (num efeito pós-render, sem timers)
  useEffect(() => {
    if (focarTitulo.current && sel) {
      focarTitulo.current = false;
      document.getElementById('nota-titulo')?.focus();
    }
  }, [sel]);

  /** Sair de uma nota que ficou vazia → apaga-a, para não acumular "Sem título". */
  async function descartarSeVazia() {
    if (!sel || sel.titulo.trim() || sel.conteudo.trim()) return;
    pendente.current = null;
    setNotas((ns) => ns.filter((n) => n.id !== sel.id));
    await supabase.from('notas').delete().eq('id', sel.id);
  }

  // textarea cresce com o conteúdo (sem scroll interno, como no Notion)
  useEffect(() => {
    for (const el of [titulo.current, corpo.current]) {
      if (!el) continue;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [sel?.conteudo, sel?.titulo, selId]);

  function editar(patch: Partial<Nota>) {
    if (!sel) return;
    const agora = new Date().toISOString();
    const completo = { ...patch, updated_at: agora, updated_by: eu };
    setNotas((ns) => ns.map((n) => (n.id === sel.id ? { ...n, ...completo } : n)));
    pendente.current = {
      id: sel.id,
      patch: { ...(pendente.current?.id === sel.id ? pendente.current.patch : {}), ...completo },
    };
    setEstado('a-guardar');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  async function criar(tipo: NotaTipo) {
    if (sel && !sel.titulo.trim() && !sel.conteudo.trim()) {
      // já há uma nota vazia aberta: reaproveita-a em vez de criar outra
      editar({ tipo });
      document.getElementById('nota-titulo')?.focus();
      return;
    }
    await flush();
    const { data, error } = await supabase
      .from('notas')
      .insert({ cliente_id: clienteId, tipo, titulo: '', conteudo: '', updated_by: eu })
      .select('*')
      .single();
    if (error || !data) return;
    const n = data as Nota;
    setNotas((ns) => [n, ...ns]);
    onCountRef.current?.(notas.length + 1);
    focarTitulo.current = true;
    setSelId(n.id);
  }

  async function apagar() {
    if (!sel || !confirm(`Apagar "${sel.titulo || 'Sem título'}"?`)) return;
    pendente.current = null;
    await supabase.from('notas').delete().eq('id', sel.id);
    setSelId(null);
    load();
  }

  const q = filtro.trim().toLowerCase();
  const visiveis = q
    ? notas.filter((n) => n.titulo.toLowerCase().includes(q) || n.conteudo.toLowerCase().includes(q))
    : notas;

  return (
    <div className="notas">
      <aside className="notas-lista">
        <div className="notas-novo">
          {TIPOS.map((t) => (
            <button key={t.key} className="small" onClick={() => criar(t.key)} title={`Nova ${t.label.toLowerCase()}`}>
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>
        {notas.length > 4 && (
          <input type="search" placeholder="Procurar nas notas…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        )}
        <ul>
          {visiveis.map((n) => (
            <li key={n.id}>
              <button
                className={`nota-item ${n.id === selId ? 'active' : ''}`}
                onClick={() => {
                  if (n.id === selId) return;
                  void flush();
                  void descartarSeVazia();
                  setSelId(n.id);
                }}
              >
                <span className="nota-emoji" aria-hidden="true">{EMOJI[n.tipo]}</span>
                <span className="nota-item-txt">
                  <span className="nota-item-titulo">
                    {n.fixada && <span className="pin" title="Fixada">●</span>}
                    {n.titulo || <span className="muted">Sem título</span>}
                  </span>
                  <span className="nota-item-meta">{timeAgo(n.updated_at)}{n.updated_by ? ` · ${n.updated_by}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {notas.length === 0 && <p className="muted small" style={{ padding: '4px 8px' }}>Ainda sem notas. Começa por uma ideia.</p>}
      </aside>

      <section className="nota-editor">
        {sel ? (
          <>
            <div className="nota-toolbar">
              <div className="chips" role="group" aria-label="Tipo">
                {TIPOS.map((t) => (
                  <button
                    key={t.key}
                    className={`chip ${sel.tipo === t.key ? 'active' : ''}`}
                    onClick={() => editar({ tipo: t.key })}
                  >
                    <span aria-hidden="true">{t.emoji}</span>{t.label}
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <span className={`save-state ${estado}`}>
                {estado === 'a-guardar' ? 'A guardar…' : estado === 'guardado' ? 'Guardado' : estado === 'erro' ? 'Erro ao guardar' : ''}
              </span>
              <button className="small ghost" onClick={() => editar({ fixada: !sel.fixada })}>
                {sel.fixada ? 'Desafixar' : 'Fixar'}
              </button>
              <button className="small ghost danger" onClick={apagar}>Apagar</button>
            </div>
            <textarea
              ref={titulo}
              id="nota-titulo"
              className="nota-titulo"
              rows={1}
              placeholder="Sem título"
              value={sel.titulo}
              onChange={(e) => editar({ titulo: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  corpo.current?.focus();
                }
              }}
            />
            <textarea
              ref={corpo}
              className="nota-corpo"
              placeholder="Escreve à vontade — ideias, decisões, próximos passos…"
              value={sel.conteudo}
              onChange={(e) => editar({ conteudo: e.target.value })}
              onBlur={() => void flush()}
            />
            <p className="nota-rodape">
              Editada {timeAgo(sel.updated_at)}{sel.updated_by ? ` por ${sel.updated_by}` : ''} · criada {timeAgo(sel.created_at)}
            </p>
          </>
        ) : (
          <div className="empty">
            <p>Escolhe uma nota ou cria uma nova.</p>
            <button className="primary" onClick={() => criar('ideia')}>💡 Nova ideia</button>
          </div>
        )}
      </section>
    </div>
  );
}
