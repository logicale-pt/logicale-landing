-- ============================================================
-- LOGICALE CRM — automações periódicas (ex: de 15 em 15 min, entre as 09:00 e as 18:00)
-- Só acrescenta colunas e alarga o check de schedule_tipo; não mexe em dados existentes.
-- Colar no SQL Editor da Supabase. Idempotente.
-- ============================================================

alter table public.automacoes
  add column if not exists intervalo_min int,             -- só p/ periodica: minutos entre execuções
  add column if not exists janela_inicio time,            -- só p/ periodica: null = desde 00:00
  add column if not exists janela_fim    time,            -- só p/ periodica: null = até 24:00
  add column if not exists so_dias_uteis boolean not null default false; -- só p/ periodica

alter table public.automacoes drop constraint if exists automacoes_schedule_tipo_check;
alter table public.automacoes add constraint automacoes_schedule_tipo_check
  check (schedule_tipo in ('diaria','dias_uteis','semanal','periodica','custom'));

alter table public.automacoes drop constraint if exists automacoes_periodica_check;
alter table public.automacoes add constraint automacoes_periodica_check
  check (
    schedule_tipo <> 'periodica'
    or (
      intervalo_min between 5 and 720
      and (janela_inicio is null or janela_fim is null or janela_inicio < janela_fim)
    )
  );
