-- ============================================================
-- LOGICALE CRM — Espaços (notas, custos, credenciais)
-- Cada registo pertence a um cliente (cliente_id) ou ao espaço interno
-- da LOGICALE (cliente_id = null).
-- Colar no SQL Editor da Supabase. Idempotente.
-- ============================================================

-- ---------- notas (páginas estilo Notion: ideias, reuniões, apontamentos) ----------
create table if not exists public.notas (
  id         uuid        primary key default gen_random_uuid(),
  cliente_id uuid        references public.clientes(id) on delete cascade,
  titulo     text        not null default '',
  conteudo   text        not null default '',
  tipo       text        not null default 'nota'
             check (tipo in ('nota','ideia','reuniao')),
  fixada     boolean     not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notas_cliente_idx on public.notas (cliente_id);

-- ---------- custos (o que gastamos — por cliente ou internos) ----------
-- periodicidade: mensal → conta valor/mês; anual → valor/12 por mês; unico → só no mês de data_inicio
create table if not exists public.custos (
  id            uuid        primary key default gen_random_uuid(),
  cliente_id    uuid        references public.clientes(id) on delete cascade,
  descricao     text        not null,
  ferramenta    text,                                  -- ex: Claude, Supabase, n8n, Google Workspace
  categoria     text        not null default 'ferramenta'
                check (categoria in ('ferramenta','ia','infraestrutura','servico','outro')),
  valor         numeric     not null check (valor >= 0),
  periodicidade text        not null default 'mensal'
                check (periodicidade in ('mensal','anual','unico')),
  data_inicio   date        not null default current_date,
  data_fim      date,                                  -- null = ainda ativo
  notas         text,
  created_at    timestamptz not null default now()
);
create index if not exists custos_cliente_idx on public.custos (cliente_id);

-- ---------- credenciais (segredo cifrado no browser, AES-GCM) ----------
-- A base de dados NUNCA vê a password em claro: `segredo` é ciphertext (base64)
-- cifrado com uma chave derivada da frase-passe do cofre (PBKDF2), que só existe no browser.
create table if not exists public.credenciais (
  id         uuid        primary key default gen_random_uuid(),
  cliente_id uuid        references public.clientes(id) on delete cascade,
  servico    text        not null,
  url        text,
  utilizador text,
  segredo    text,                                     -- base64(iv || ciphertext) de {password, notas}
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credenciais_cliente_idx on public.credenciais (cliente_id);

-- ---------- cofre (parâmetros da chave; uma só linha) ----------
-- Guarda o salt do PBKDF2 e um "verificador" cifrado para validar a frase-passe.
-- Não guarda a frase-passe nem a chave.
create table if not exists public.cofre (
  id          int         primary key default 1 check (id = 1),
  salt        text        not null,
  iteracoes   int         not null,
  verificador text        not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS: igual ao resto do CRM — authenticated pode tudo, anon nada.
-- ============================================================
alter table public.notas       enable row level security;
alter table public.custos      enable row level security;
alter table public.credenciais enable row level security;
alter table public.cofre       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['notas','custos','credenciais','cofre']
  loop
    execute format('drop policy if exists "authenticated_all_%s" on public.%I', t, t);
    execute format(
      'create policy "authenticated_all_%s" on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
