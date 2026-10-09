/**
 * Modo mock — SÓ para desenvolvimento local (`npm run dev:mock`).
 * Substitui o cliente Supabase por uma BD em memória com dados fictícios e uma sessão falsa,
 * para testar a UI sem login nem dados de produção. Nunca entra no build (import dinâmico
 * protegido por import.meta.env.VITE_MOCK em main.tsx).
 */
import { supabase } from './supabase';

type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

const uid = () => crypto.randomUUID();
const dias = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const dataISO = (n: number) => dias(n).slice(0, 10);

function seed(): DB {
  const c1 = uid(), c2 = uid(), c3 = uid(), c4 = uid();
  const a1 = uid(), a2 = uid(), a3 = uid(), a4 = uid();
  const r1 = uid();
  const mes = new Date();
  const mesISO = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
  return {
    clientes: [
      { id: c1, nome: 'Clínica Sorriso', empresa: 'Sorriso Lda', email: 'geral@sorriso.pt', telefone: '912 345 678', notas: null, estado: 'ativo', created_at: dias(120) },
      { id: c2, nome: 'Contas Certas', empresa: 'Gabinete Contas Certas', email: 'info@contascertas.pt', telefone: null, notas: null, estado: 'ativo', created_at: dias(80) },
      { id: c3, nome: 'Padaria Lima', empresa: null, email: 'padaria.lima@gmail.com', telefone: null, notas: null, estado: 'ativo', created_at: dias(30) },
      { id: c4, nome: 'Oficina Rocha', empresa: 'Rocha & Filhos', email: null, telefone: null, notas: null, estado: 'inativo', created_at: dias(200) },
    ],
    automacoes: [
      { id: a1, cliente_id: c1, nome: 'Confirmação de consultas', descricao: null, tipo_entrega: 'routine', preco_mensal: 120, schedule_tipo: 'diaria', hora_esperada: '18:00:00', dia_semana: null, intervalo_min: null, janela_inicio: null, janela_fim: null, so_dias_uteis: false, tolerancia_min: 30, ativa: true, data_inicio: dataISO(120), data_fim: null, created_at: dias(120), token_hash: 'x' },
      { id: a2, cliente_id: c2, nome: 'Faturas PDF → Excel', descricao: null, tipo_entrega: 'vm', preco_mensal: 180, schedule_tipo: 'dias_uteis', hora_esperada: '09:00:00', dia_semana: null, intervalo_min: null, janela_inicio: null, janela_fim: null, so_dias_uteis: false, tolerancia_min: 60, ativa: true, data_inicio: dataISO(80), data_fim: null, created_at: dias(80), token_hash: 'x' },
      { id: a3, cliente_id: c2, nome: 'Relatório semanal', descricao: null, tipo_entrega: 'cowork', preco_mensal: 60, schedule_tipo: 'semanal', hora_esperada: '08:00:00', dia_semana: 1, intervalo_min: null, janela_inicio: null, janela_fim: null, so_dias_uteis: false, tolerancia_min: 60, ativa: true, data_inicio: dataISO(60), data_fim: null, created_at: dias(60), token_hash: 'x' },
      { id: a4, cliente_id: c3, nome: 'Sync de encomendas', descricao: null, tipo_entrega: 'vm', preco_mensal: 90, schedule_tipo: 'periodica', hora_esperada: null, dia_semana: null, intervalo_min: 15, janela_inicio: '09:00:00', janela_fim: '18:00:00', so_dias_uteis: true, tolerancia_min: 10, ativa: true, data_inicio: dataISO(30), data_fim: null, created_at: dias(30), token_hash: 'x' },
    ],
    runs: [
      { id: r1, automacao_id: a2, estado: 'erro', started_at: dias(0.1), duracao_seg: 12, custo: 0.04, mensagem: 'PDF ilegível: FT2026-0418.pdf', created_at: dias(0.1) },
      { id: uid(), automacao_id: a1, estado: 'ok', started_at: dias(0.3), duracao_seg: 41, custo: 0.06, mensagem: '14 lembretes enviados', created_at: dias(0.3) },
      { id: uid(), automacao_id: a4, estado: 'ok', started_at: dias(0.5), duracao_seg: 22, custo: 0.03, mensagem: '3 follow-ups', created_at: dias(0.5) },
      { id: uid(), automacao_id: a3, estado: 'missed', started_at: dias(0.7), duracao_seg: null, custo: null, mensagem: 'sem ping na janela esperada', created_at: dias(0.7) },
    ],
    incidentes: [
      { id: uid(), run_id: r1, cliente_id: c2, estado: 'novo', assignee: null, nota_resolucao: null, created_at: dias(0.1), resolved_at: null },
    ],
    pagamentos: [
      { id: uid(), cliente_id: c1, mes: mesISO, valor: 120, estado: 'pago', data_pagamento: dataISO(2), created_at: dias(3) },
      { id: uid(), cliente_id: c2, mes: mesISO, valor: 240, estado: 'em_atraso', data_pagamento: null, created_at: dias(3) },
    ],
    tarefas: [
      { id: uid(), titulo: 'Ligar VM nova da Contas Certas', descricao: null, coluna: 'em_curso', cliente_id: c2, assignee: 'Lourenço', ordem: 0, created_at: dias(2) },
      { id: uid(), titulo: 'Proposta Padaria Lima — fase 2', descricao: 'Inventário diário', coluna: 'backlog', cliente_id: c3, assignee: 'António', ordem: 0, created_at: dias(1) },
    ],
    leads: [
      { id: uid(), created_at: dias(0.2), source: 'diagnostico', setor: 'saude_bemestar', dimensao: '2_5', tarefas: ['emails', 'agendamentos'], tempo_perdido: '2_4h', quem_faz: 'dono', abertura: 'nunca', intencao: null, respostas: {}, nome: 'Marta Silva', empresa: 'Fisio+ ', email: 'marta@fisiomais.pt', estado: 'novo' },
    ],
    notas: [
      { id: uid(), cliente_id: null, titulo: 'Ideias para o site', conteudo: '- Página de casos com números reais\n- Vídeo curto do agente de faturas\n- Testar anúncio LinkedIn para clínicas', tipo: 'ideia', fixada: true, updated_by: 'António', created_at: dias(6), updated_at: dias(1) },
      { id: uid(), cliente_id: null, titulo: 'Preços 2027', conteudo: 'Rever mensalidade mínima. Ver margem por cliente no dashboard antes de decidir.', tipo: 'nota', fixada: false, updated_by: 'Lourenço', created_at: dias(12), updated_at: dias(4) },
      { id: uid(), cliente_id: c2, titulo: 'Reunião de arranque', conteudo: 'Contacto: Dra. Helena\nFaturas chegam a faturas@contascertas.pt\nQuerem relatório à segunda às 8h.', tipo: 'reuniao', fixada: false, updated_by: 'Lourenço', created_at: dias(70), updated_at: dias(70) },
    ],
    custos: [
      { id: uid(), cliente_id: null, descricao: 'Claude Team (2 lugares)', ferramenta: 'Claude', categoria: 'ia', valor: 56, periodicidade: 'mensal', data_inicio: dataISO(150), data_fim: null, notas: null, created_at: dias(150) },
      { id: uid(), cliente_id: null, descricao: 'Supabase Pro', ferramenta: 'Supabase', categoria: 'infraestrutura', valor: 23, periodicidade: 'mensal', data_inicio: dataISO(100), data_fim: null, notas: null, created_at: dias(100) },
      { id: uid(), cliente_id: null, descricao: 'Google Workspace', ferramenta: 'Google Workspace', categoria: 'ferramenta', valor: 13.6, periodicidade: 'mensal', data_inicio: dataISO(150), data_fim: null, notas: null, created_at: dias(150) },
      { id: uid(), cliente_id: null, descricao: 'Domínio logicale.pt', ferramenta: 'Domínio', categoria: 'infraestrutura', valor: 15, periodicidade: 'anual', data_inicio: dataISO(150), data_fim: null, notas: 'renova em junho', created_at: dias(150) },
      { id: uid(), cliente_id: c2, descricao: 'VM Hetzner CX22', ferramenta: 'Hetzner', categoria: 'infraestrutura', valor: 6.5, periodicidade: 'mensal', data_inicio: dataISO(80), data_fim: null, notas: null, created_at: dias(80) },
      { id: uid(), cliente_id: c2, descricao: 'OpenAI API (OCR faturas)', ferramenta: 'OpenAI', categoria: 'ia', valor: 18, periodicidade: 'mensal', data_inicio: dataISO(80), data_fim: null, notas: null, created_at: dias(80) },
      { id: uid(), cliente_id: c1, descricao: 'WhatsApp Business API', ferramenta: 'WhatsApp', categoria: 'servico', valor: 9, periodicidade: 'mensal', data_inicio: dataISO(110), data_fim: null, notas: null, created_at: dias(110) },
      { id: uid(), cliente_id: c3, descricao: 'Claude API', ferramenta: 'Claude', categoria: 'ia', valor: 7, periodicidade: 'mensal', data_inicio: dataISO(30), data_fim: null, notas: null, created_at: dias(30) },
      { id: uid(), cliente_id: c1, descricao: 'Setup tablet receção', ferramenta: null, categoria: 'outro', valor: 40, periodicidade: 'unico', data_inicio: dataISO(1), data_fim: null, notas: null, created_at: dias(1) },
    ],
    credenciais: [],
    cofre: [],
  };
}

const FK: Record<string, string> = { clientes: 'cliente_id', runs: 'run_id', automacoes: 'automacao_id' };

/** "*, clientes(nome), runs(estado, automacoes(nome))" → lista de embeds {tabela, sub-select} */
function parseEmbeds(sel: string): { table: string; sub: string }[] {
  const out: { table: string; sub: string }[] = [];
  let depth = 0, start = 0, name = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(') {
      if (depth === 0) { name = sel.slice(start, i).replace(/^[\s,]+/, '').trim(); start = i + 1; }
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) { out.push({ table: name, sub: sel.slice(start, i) }); start = i + 1; }
    } else if (ch === ',' && depth === 0) start = i + 1;
  }
  return out;
}

function embed(db: DB, row: Row, sel: string): Row {
  const r: Row = { ...row };
  for (const e of parseEmbeds(sel)) {
    const fk = FK[e.table];
    const rel = fk ? db[e.table]?.find((x) => x.id === row[fk]) : undefined;
    r[e.table] = rel ? embed(db, rel, e.sub) : null;
  }
  return r;
}

function mensalidades(db: DB): Row[] {
  return db.clientes.map((c) => ({
    cliente_id: c.id, cliente_nome: c.nome, cliente_estado: c.estado,
    mensalidade: db.automacoes.filter((a) => a.cliente_id === c.id && a.ativa).reduce((s, a) => s + Number(a.preco_mensal), 0),
  }));
}

type Filtro = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filtros: Filtro[] = [];
  private ordens: { col: string; asc: boolean }[] = [];
  private lim = Infinity;
  private modo: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private sel = '*';
  private head = false;
  private contar = false;
  private um: 'single' | 'maybe' | null = null;
  private payload: Row | Row[] | null = null;
  private selecionarDepois = false;

  constructor(private db: DB, private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    if (this.modo !== 'select') this.selecionarDepois = true;
    this.sel = cols;
    this.head = !!opts?.head;
    this.contar = !!opts?.count;
    return this;
  }
  insert(v: Row | Row[]) { this.modo = 'insert'; this.payload = v; return this; }
  update(v: Row) { this.modo = 'update'; this.payload = v; return this; }
  delete() { this.modo = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this; }
  is(c: string, v: null) { this.filtros.push((r) => r[c] == v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: string) { this.filtros.push((r) => String(r[c]) >= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.ordens.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.um = 'single'; return this; }
  maybeSingle() { this.um = 'maybe'; return this; }

  private executar(): { data: unknown; error: unknown; count?: number | null } {
    const t = this.table === 'mensalidades' ? mensalidades(this.db) : (this.db[this.table] ??= []);
    const passa = (r: Row) => this.filtros.every((f) => f(r));

    if (this.modo === 'insert') {
      const linhas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p,
      }));
      t.push(...linhas);
      const data = this.selecionarDepois ? (this.um ? linhas[0] : linhas) : null;
      return { data, error: null };
    }
    if (this.modo === 'update') {
      t.filter(passa).forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    }
    if (this.modo === 'delete') {
      this.db[this.table] = t.filter((r) => !passa(r));
      return { data: null, error: null };
    }

    let rows = t.filter(passa);
    for (const o of [...this.ordens].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[o.col] as string | number | boolean, y = b[o.col] as string | number | boolean;
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    rows = rows.slice(0, this.lim).map((r) => embed(this.db, r, this.sel));
    const count = this.contar ? rows.length : null;
    if (this.head) return { data: null, error: null, count };
    if (this.um) {
      if (!rows[0] && this.um === 'single') return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null, count };
  }

  then<A = { data: unknown; error: unknown; count?: number | null }, B = never>(
    ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return new Promise((res) => setTimeout(res, 60)).then(() => this.executar()).then(ok, fail);
  }
}

export function installMock(): void {
  const db = seed();
  const session = {
    access_token: 'mock', token_type: 'bearer', expires_in: 3600, refresh_token: 'mock',
    user: { id: 'mock-user', email: 'lourencomestre3@gmail.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: dias(300) },
  };
  // monkeypatch: o cliente real nunca chega a fazer pedidos
  const s = supabase as unknown as Record<string, unknown> & { auth: Record<string, unknown> };
  s.from = (table: string) => new Query(db, table);
  s.auth.getSession = async () => ({ data: { session }, error: null });
  s.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
  s.auth.signOut = async () => { location.reload(); return { error: null }; };
  s.auth.updateUser = async () => ({ data: {}, error: null });
  console.info('%c[LOGICALE] modo mock — dados fictícios em memória', 'color:#E0542A');
}
