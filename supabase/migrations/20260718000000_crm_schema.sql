-- ============================================================
-- LOGICALE CRM — schema v1
-- Colar no SQL Editor da Supabase (ou `supabase db push`).
-- Idempotente: pode correr-se mais do que uma vez.
-- ============================================================

-- ---------- clientes ----------
create table if not exists public.clientes (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  empresa    text,
  email      text,
  telefone   text,
  notas      text,
  estado     text        not null default 'ativo'
             check (estado in ('ativo','inativo')),
  created_at timestamptz not null default now()
);

-- ---------- automacoes ----------
-- Remover automação = ativa=false + data_fim (nunca DELETE: preserva runs e faturação).
create table if not exists public.automacoes (
  id             uuid        primary key default gen_random_uuid(),
  cliente_id     uuid        not null references public.clientes(id),
  nome           text        not null,
  descricao      text,
  tipo_entrega   text        not null
                 check (tipo_entrega in ('cowork','routine','vm')),
  preco_mensal   numeric     not null default 0,
  schedule_tipo  text        not null default 'diaria'
                 check (schedule_tipo in ('diaria','dias_uteis','semanal','custom')),
  hora_esperada  time,
  dia_semana     int         check (dia_semana between 0 and 6), -- 0=domingo … 6=sábado (só p/ semanal)
  tolerancia_min int         not null default 60,
  token_hash     text        not null,                            -- SHA-256 hex do token de ping
  ativa          boolean     not null default true,
  data_inicio    date        not null default current_date,
  data_fim       date,
  created_at     timestamptz not null default now()
);

create index if not exists automacoes_cliente_idx on public.automacoes (cliente_id);
create index if not exists automacoes_token_hash_idx on public.automacoes (token_hash);

-- ---------- runs ----------
create table if not exists public.runs (
  id           uuid        primary key default gen_random_uuid(),
  automacao_id uuid        not null references public.automacoes(id),
  estado       text        not null check (estado in ('ok','erro','missed')),
  started_at   timestamptz not null default now(),
  duracao_seg  numeric,
  custo        numeric,
  mensagem     text,
  created_at   timestamptz not null default now()
);

create index if not exists runs_automacao_started_idx on public.runs (automacao_id, started_at desc);
create index if not exists runs_started_idx on public.runs (started_at desc);

-- ---------- incidentes ----------
create table if not exists public.incidentes (
  id             uuid        primary key default gen_random_uuid(),
  run_id         uuid        not null references public.runs(id),
  cliente_id     uuid        not null references public.clientes(id),
  estado         text        not null default 'novo'
                 check (estado in ('novo','assumido','resolvido')),
  assignee       text,
  nota_resolucao text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists incidentes_estado_idx on public.incidentes (estado);

-- ---------- pagamentos ----------
-- valor = snapshot no momento do registo (não muda se as automações mudarem depois)
create table if not exists public.pagamentos (
  id             uuid        primary key default gen_random_uuid(),
  cliente_id     uuid        not null references public.clientes(id),
  mes            date        not null,                -- 1º dia do mês
  valor          numeric     not null,
  estado         text        not null default 'pendente'
                 check (estado in ('pendente','pago','em_atraso')),
  data_pagamento date,
  created_at     timestamptz not null default now(),
  unique (cliente_id, mes)
);

-- ---------- tarefas (kanban) ----------
create table if not exists public.tarefas (
  id         uuid        primary key default gen_random_uuid(),
  titulo     text        not null,
  descricao  text,
  coluna     text        not null default 'backlog'
             check (coluna in ('backlog','em_curso','espera_cliente','feito')),
  cliente_id uuid        references public.clientes(id),
  assignee   text,
  ordem      int         not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- leads: coluna estado (já existe na tabela atual; garantia) ----------
alter table public.leads add column if not exists estado text not null default 'novo';

-- ---------- view mensalidades (derivada, nunca coluna em clientes) ----------
-- security_invoker: a view respeita a RLS de quem consulta.
create or replace view public.mensalidades
with (security_invoker = true) as
select
  c.id   as cliente_id,
  c.nome as cliente_nome,
  c.estado as cliente_estado,
  coalesce(sum(a.preco_mensal) filter (where a.ativa), 0) as mensalidade
from public.clientes c
left join public.automacoes a on a.cliente_id = c.id
group by c.id, c.nome, c.estado;

-- ============================================================
-- RLS: authenticated pode tudo, anon não pode nada.
-- Exceção: leads mantém o INSERT anon da landing (não tocar).
-- ============================================================

alter table public.clientes   enable row level security;
alter table public.automacoes enable row level security;
alter table public.runs       enable row level security;
alter table public.incidentes enable row level security;
alter table public.pagamentos enable row level security;
alter table public.tarefas    enable row level security;
-- leads já tem RLS ligada (supabase/leads.sql)

do $$
declare
  t text;
begin
  foreach t in array array['clientes','automacoes','runs','incidentes','pagamentos','tarefas','leads']
  loop
    execute format('drop policy if exists "authenticated_all_%s" on public.%I', t, t);
    execute format(
      'create policy "authenticated_all_%s" on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
