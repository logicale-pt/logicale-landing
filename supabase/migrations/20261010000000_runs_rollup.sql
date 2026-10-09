-- ============================================================
-- LOGICALE CRM — histórico de runs: resumo diário + limpeza automática
-- - runs_diarias: contadores por automação e dia (Lisboa), mantidos por trigger
--   a cada insert em runs; ficam para sempre (mesmo depois de as runs serem apagadas).
-- - view automacoes_saude: última run + ok/erro/missed dos últimos 30 dias, por automação
--   (o backoffice deixa de puxar milhares de runs para o browser).
-- - limpar_runs_antigas() + pg_cron diário às 03:30 (UTC): apaga runs `ok` com mais de
--   30 dias (sem incidente e que não sejam a última run da automação). erro/missed ficam.
-- Não mexe em dados existentes (só lê runs para o backfill).
-- Colar no SQL Editor da Supabase. Idempotente.
-- ============================================================

-- ---------- runs_diarias ----------
create table if not exists public.runs_diarias (
  automacao_id  uuid    not null references public.automacoes(id) on delete cascade,
  dia           date    not null,                   -- (started_at at time zone 'Europe/Lisbon')::date
  ok            int     not null default 0,
  erro          int     not null default 0,
  missed        int     not null default 0,
  duracao_total numeric not null default 0,         -- soma de duracao_seg
  custo_total   numeric not null default 0,         -- soma de custo
  primary key (automacao_id, dia)
);

-- ---------- trigger: cada run nova incrementa o dia dela ----------
create or replace function public.runs_diarias_incrementar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.runs_diarias as d (automacao_id, dia, ok, erro, missed, duracao_total, custo_total)
  values (
    new.automacao_id,
    (new.started_at at time zone 'Europe/Lisbon')::date,
    (new.estado = 'ok')::int,
    (new.estado = 'erro')::int,
    (new.estado = 'missed')::int,
    coalesce(new.duracao_seg, 0),
    coalesce(new.custo, 0)
  )
  on conflict (automacao_id, dia) do update set
    ok            = d.ok            + excluded.ok,
    erro          = d.erro          + excluded.erro,
    missed        = d.missed        + excluded.missed,
    duracao_total = d.duracao_total + excluded.duracao_total,
    custo_total   = d.custo_total   + excluded.custo_total;
  return null;
end $$;

revoke execute on function public.runs_diarias_incrementar() from public, anon, authenticated;

drop trigger if exists runs_diarias_after_insert on public.runs;
create trigger runs_diarias_after_insert
  after insert on public.runs
  for each row execute function public.runs_diarias_incrementar();

-- ---------- backfill a partir das runs existentes ----------
-- greatest(): as runs só diminuem (limpeza), por isso o valor certo é o maior entre o que já
-- está no resumo e o recalculado. Assim, voltar a correr isto depois da limpeza não apaga
-- os totais dos dias antigos.
insert into public.runs_diarias as d (automacao_id, dia, ok, erro, missed, duracao_total, custo_total)
select
  r.automacao_id,
  (r.started_at at time zone 'Europe/Lisbon')::date,
  count(*) filter (where r.estado = 'ok'),
  count(*) filter (where r.estado = 'erro'),
  count(*) filter (where r.estado = 'missed'),
  coalesce(sum(r.duracao_seg), 0),
  coalesce(sum(r.custo), 0)
from public.runs r
group by 1, 2
on conflict (automacao_id, dia) do update set
  ok            = greatest(d.ok,            excluded.ok),
  erro          = greatest(d.erro,          excluded.erro),
  missed        = greatest(d.missed,        excluded.missed),
  duracao_total = greatest(d.duracao_total, excluded.duracao_total),
  custo_total   = greatest(d.custo_total,   excluded.custo_total);

-- ---------- RLS: igual ao resto do CRM — authenticated pode tudo, anon nada ----------
alter table public.runs_diarias enable row level security;

drop policy if exists "authenticated_all_runs_diarias" on public.runs_diarias;
create policy "authenticated_all_runs_diarias" on public.runs_diarias
  for all to authenticated using (true) with check (true);

-- ---------- view automacoes_saude (uma linha por automação) ----------
-- security_invoker: a view respeita a RLS de quem consulta.
-- 30 dias = 30 dias civis de Lisboa, incluindo hoje.
create or replace view public.automacoes_saude
with (security_invoker = true) as
select
  a.id                          as automacao_id,
  u.estado                      as ultima_estado,
  u.started_at                  as ultima_started_at,
  coalesce(s.ok, 0)::int        as ok_30d,
  coalesce(s.erro, 0)::int      as erro_30d,
  coalesce(s.missed, 0)::int    as missed_30d
from public.automacoes a
left join lateral (
  select r.estado, r.started_at
  from public.runs r
  where r.automacao_id = a.id
  order by r.started_at desc
  limit 1
) u on true
left join lateral (
  select sum(d.ok) as ok, sum(d.erro) as erro, sum(d.missed) as missed
  from public.runs_diarias d
  where d.automacao_id = a.id
    and d.dia >= (now() at time zone 'Europe/Lisbon')::date - 29
) s on true;

revoke all on public.automacoes_saude from anon;
grant select on public.automacoes_saude to authenticated;

-- ---------- limpeza: runs ok com mais de 30 dias ----------
-- Mantém: erro/missed (sempre), runs com incidente (FK) e a última run de cada automação
-- (para a "última execução" de automações pouco frequentes não desaparecer).
-- Os totais por dia ficam em runs_diarias.
create or replace function public.limpar_runs_antigas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  apagadas int;
begin
  delete from public.runs r
  where r.estado = 'ok'
    and r.started_at < now() - interval '30 days'
    and not exists (select 1 from public.incidentes i where i.run_id = r.id)
    and r.started_at < (
      select max(r2.started_at) from public.runs r2 where r2.automacao_id = r.automacao_id
    );
  get diagnostics apagadas = row_count;
  return apagadas;
end $$;

revoke execute on function public.limpar_runs_antigas() from public, anon, authenticated;

-- ---------- pg_cron: todos os dias às 03:30 (UTC — 04:30 em Lisboa no verão) ----------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-limpar-runs') then
    perform cron.unschedule('crm-limpar-runs');
  end if;
end $$;

select cron.schedule(
  'crm-limpar-runs',
  '30 3 * * *',
  $$ select public.limpar_runs_antigas(); $$
);

-- Verificar: select jobname, schedule, active from cron.job;
-- Resumo:    select * from public.runs_diarias order by dia desc limit 20;
-- Saúde:     select * from public.automacoes_saude;
-- Limpar já: select public.limpar_runs_antigas();  -- devolve nº de runs apagadas
