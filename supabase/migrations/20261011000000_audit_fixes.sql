-- ============================================================
-- LOGICALE CRM — correções do AUDIT.md (out 2026)
-- A2  heartbeats: o check-missed regista cada execução; o backoffice avisa se parar.
-- M8  leads/events: limites de tamanho + a anon key só escreve as colunas que a landing envia.
-- M9  cofre: sem update/delete (recriar o cofre por cima de credenciais deixava-as ilegíveis).
-- B9  runs_diarias: só leitura para o backoffice (quem escreve é o trigger).
-- B12 automacoes.token_hash: índice único.
-- Colar no SQL Editor da Supabase. Idempotente. Não apaga nem altera dados existentes.
-- Ordem: correr ANTES de fazer deploy da nova check-missed (senão o heartbeat só dá erro no log).
-- ============================================================

-- ---------- A2: heartbeats ----------
create table if not exists public.heartbeats (
  nome      text        primary key,          -- 'check-missed'
  ultimo_ok timestamptz not null,
  detalhe   jsonb
);
alter table public.heartbeats enable row level security;
-- escreve-se com a service role (Edge Function, ignora RLS); o backoffice só lê
drop policy if exists "authenticated_select_heartbeats" on public.heartbeats;
create policy "authenticated_select_heartbeats" on public.heartbeats
  for select to authenticated using (true);

-- ---------- M8: leads (landing, anon) ----------
-- NOT VALID: só se aplica a linhas novas (não falha por causa de leads antigas).
alter table public.leads drop constraint if exists leads_tamanhos_check;
alter table public.leads add constraint leads_tamanhos_check check (
      char_length(email)         <= 254
  and char_length(nome)          <= 200
  and char_length(empresa)       <= 200
  and char_length(source)        <= 50
  and char_length(setor)         <= 100
  and char_length(dimensao)      <= 100
  and char_length(tempo_perdido) <= 100
  and char_length(quem_faz)      <= 100
  and char_length(abertura)      <= 100
  and char_length(intencao)      <= 100
  and octet_length(tarefas::text)   <= 2048
  and octet_length(respostas::text) <= 8192
) not valid;

-- A anon key deixa de poder escolher id/created_at, e só pode criar leads no estado 'novo'.
revoke insert on public.leads from anon;
grant insert (source, setor, dimensao, tarefas, tempo_perdido, quem_faz, abertura, intencao,
              respostas, nome, empresa, email, estado)
  on public.leads to anon;
drop policy if exists "anon_insert_leads" on public.leads;
create policy "anon_insert_leads" on public.leads
  for insert to anon
  with check (estado = 'novo');

-- ---------- M8: events (funil da landing, anon) ----------
alter table public.events drop constraint if exists events_tamanhos_check;
alter table public.events add constraint events_tamanhos_check check (
      event ~ '^[a-z_]{1,50}$'
  and char_length(sid)  <= 64
  and char_length(page) <= 200
) not valid;

revoke insert on public.events from anon;
grant insert (event, sid, page) on public.events to anon;

-- ---------- M9: cofre só select + insert ----------
-- Repor o cofre passa a exigir SQL como postgres (de propósito): sem a frase-passe antiga,
-- as credenciais cifradas com ela ficam ilegíveis.
drop policy if exists "authenticated_all_cofre" on public.cofre;
drop policy if exists "authenticated_select_cofre" on public.cofre;
drop policy if exists "authenticated_insert_cofre" on public.cofre;
create policy "authenticated_select_cofre" on public.cofre
  for select to authenticated using (true);
create policy "authenticated_insert_cofre" on public.cofre
  for insert to authenticated with check (true);

-- ---------- B9: runs_diarias só leitura ----------
-- O trigger runs_diarias_incrementar é security definer, e o "on delete cascade" das automações
-- não passa pela RLS: nada disso precisa de policies de escrita.
drop policy if exists "authenticated_all_runs_diarias" on public.runs_diarias;
drop policy if exists "authenticated_select_runs_diarias" on public.runs_diarias;
create policy "authenticated_select_runs_diarias" on public.runs_diarias
  for select to authenticated using (true);

-- ---------- B12: token_hash único ----------
-- Se já houver hashes duplicados (não devia), não cria o índice e avisa — o resto da migração aplica-se.
do $$
begin
  if exists (select 1 from public.automacoes group by token_hash having count(*) > 1) then
    raise warning 'automacoes.token_hash tem duplicados — índice único NÃO criado. Ver: select token_hash, count(*) from automacoes group by 1 having count(*) > 1;';
  else
    create unique index if not exists automacoes_token_hash_key on public.automacoes (token_hash);
    drop index if exists public.automacoes_token_hash_idx; -- o único substitui o antigo
  end if;
end $$;

-- Verificar:
--   select tablename, policyname, roles, cmd from pg_policies where tablename in ('cofre','runs_diarias','heartbeats','leads');
--   select column_name from information_schema.column_privileges where table_name = 'leads' and grantee = 'anon';
--   select * from public.heartbeats;   -- depois do deploy da check-missed, atualiza de 15 em 15 min
