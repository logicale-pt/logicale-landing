-- ============================================================
-- LOGICALE — tabela de leads do Diagnóstico gratuito
-- Corre isto no SQL Editor da Supabase.
-- ============================================================

create table if not exists public.leads (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  source        text        not null    default 'diagnostico',
  setor         text,
  dimensao      text,
  tarefas       jsonb                    default '[]'::jsonb,
  tempo_perdido text,
  quem_faz      text,
  abertura      text,
  intencao      text,
  respostas     jsonb,
  nome          text,
  empresa       text,
  email         text,
  estado        text        not null    default 'novo'   -- pipeline: novo → contactado → ...
);

-- Row Level Security: a anon key é pública (vai no browser), por isso
-- só autorizamos INSERT. Ninguém com a anon key consegue LER/editar leads.
alter table public.leads enable row level security;

drop policy if exists "anon_insert_leads" on public.leads;
create policy "anon_insert_leads"
  on public.leads
  for insert
  to anon
  with check (true);

-- (As leads são lidas no dashboard da Supabase ou via service_role key no backend.)
