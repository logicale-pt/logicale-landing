-- ============================================================
-- LOGICALE CRM — pg_cron: chama a Edge Function check-missed a cada 15 min
-- ANTES DE CORRER: substitui __CRON_SECRET__ pelo mesmo valor que definiste
-- no secret CRON_SECRET das Edge Functions (gera com: openssl rand -hex 32).
-- Colar no SQL Editor da Supabase. Idempotente (re-agenda se já existir).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-check-missed') then
    perform cron.unschedule('crm-check-missed');
  end if;
end $$;

select cron.schedule(
  'crm-check-missed',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://kzioedpnfslvnniznasr.supabase.co/functions/v1/check-missed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '__CRON_SECRET__'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verificar: select jobname, schedule, active from cron.job;
-- Últimas execuções: select * from cron.job_run_details order by start_time desc limit 10;
