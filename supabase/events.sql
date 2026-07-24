-- ============================================================
-- LOGICALE — tabela de eventos de funil (quiz_opened, quiz_started)
-- Corre isto no SQL Editor da Supabase.
-- ============================================================

create table if not exists public.events (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  event      text        not null,           -- 'quiz_opened' | 'quiz_started' | ...
  sid        text,                           -- id anónimo de sessão; o mesmo sid aparece em leads.respostas->>'sid'
  page       text
);

-- RLS igual à tabela leads: a anon key só pode INSERIR, nunca ler/editar.
alter table public.events enable row level security;

drop policy if exists "anon_insert_events" on public.events;
create policy "anon_insert_events"
  on public.events
  for insert
  to anon
  with check (true);

-- ============================================================
-- Queries úteis (correr no dashboard):
--
-- Funil dos últimos 30 dias (abriu → começou → completou):
--   select
--     count(distinct sid) filter (where event = 'quiz_opened')  as abriu,
--     count(distinct sid) filter (where event = 'quiz_started') as comecou,
--     (select count(*) from public.leads where created_at > now() - interval '30 days') as completou
--   from public.events
--   where created_at > now() - interval '30 days';
--
-- Ligar um lead ao seu percurso:
--   select l.email, l.created_at, e.event, e.created_at
--   from public.leads l
--   join public.events e on e.sid = l.respostas->>'sid'
--   order by l.created_at desc, e.created_at;
-- ============================================================
