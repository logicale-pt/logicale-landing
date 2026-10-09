-- ============================================================
-- LOGICALE CRM — mudar a frase-passe do cofre sem perder credenciais
-- O browser decifra tudo com a chave antiga e volta a cifrar com a nova; esta função grava
-- a nova configuração do cofre + todos os segredos numa só transação (ou tudo, ou nada).
-- - cofre.versao: sobe a cada mudança de frase.
-- - credenciais.cofre_versao: versão da chave com que o segredo foi cifrado. Um trigger recusa
--   gravar segredos cifrados com uma versão antiga (ex: o outro sócio tinha o cofre aberto
--   com a frase antiga quando ela mudou) — sem isto ficariam ilegíveis para sempre.
-- - cofre_backup: estado anterior a cada mudança (parâmetros + segredos cifrados), para se poder
--   voltar atrás com a frase ANTIGA se algo correr mal. Só acessível por SQL (sem policies).
-- Requer 20261011000000_audit_fixes.sql. Colar no SQL Editor da Supabase. Idempotente.
-- ============================================================

alter table public.cofre       add column if not exists versao       int not null default 1;
alter table public.credenciais add column if not exists cofre_versao int;

-- segredos que já existem foram cifrados com a versão 1 (a única que existiu até aqui)
-- (antes de criar o trigger, que não deixaria mudar cofre_versao sem mudar o segredo)
drop trigger if exists credenciais_verificar_versao on public.credenciais;
update public.credenciais set cofre_versao = 1 where segredo is not null and cofre_versao is null;

-- ---------- trigger: só se gravam segredos cifrados com a chave atual ----------
create or replace function public.credenciais_verificar_versao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual int;
begin
  if tg_op = 'UPDATE' and new.segredo is not distinct from old.segredo then
    new.cofre_versao := old.cofre_versao; -- o segredo não mudou: a versão também não
    return new;
  end if;
  if new.segredo is null then
    new.cofre_versao := null;
    return new;
  end if;
  select versao into atual from public.cofre where id = 1;
  if atual is null then
    return new; -- sem cofre não há com que comparar (a UI não deixa chegar aqui)
  end if;
  if new.cofre_versao is null and atual = 1 then
    new.cofre_versao := 1; -- backoffice anterior a esta migração: ok enquanto a frase nunca tiver mudado
    return new;
  end if;
  if new.cofre_versao is distinct from atual then
    raise exception 'cofre_versao_desatualizada'
      using hint = 'A frase-passe do cofre mudou: bloqueia e desbloqueia com a nova.';
  end if;
  return new;
end $$;

revoke execute on function public.credenciais_verificar_versao() from public, anon, authenticated;

create trigger credenciais_verificar_versao
  before insert or update on public.credenciais
  for each row execute function public.credenciais_verificar_versao();

-- ---------- backup do estado anterior a cada mudança ----------
create table if not exists public.cofre_backup (
  id          bigint      generated always as identity primary key,
  versao      int         not null,  -- versão que foi substituída
  salt        text        not null,
  iteracoes   int         not null,
  verificador text        not null,
  segredos    jsonb       not null,  -- [{id, segredo}] cifrados com a chave dessa versão
  created_at  timestamptz not null default now()
);
alter table public.cofre_backup enable row level security; -- sem policies: só SQL (postgres)

-- ---------- mudar a frase: tudo numa transação ----------
-- segredos: [{ "id": uuid, "segredo": "<base64 cifrado com a chave nova>" }] — tem de trazer
-- exatamente todas as credenciais com segredo (nem mais, nem menos), senão aborta.
create or replace function public.mudar_frase_cofre(
  versao_atual     int,
  novo_salt        text,
  novas_iteracoes  int,
  novo_verificador text,
  segredos         jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c          public.cofre;
  esperados  int;
  recebidos  int;
  nova       int;
begin
  if novas_iteracoes < 310000 then
    raise exception 'iteracoes_insuficientes';
  end if;
  if coalesce(novo_salt, '') = '' or coalesce(novo_verificador, '') = '' or jsonb_typeof(segredos) <> 'array' then
    raise exception 'parametros_invalidos';
  end if;

  select * into c from public.cofre where id = 1 for update; -- serializa mudanças concorrentes
  if not found then
    raise exception 'cofre_inexistente';
  end if;
  if c.versao <> versao_atual then
    raise exception 'cofre_versao_desatualizada'
      using hint = 'A frase-passe mudou entretanto noutro browser.';
  end if;

  -- trancar as credenciais: ninguém grava segredos a meio da mudança
  perform 1 from public.credenciais where segredo is not null for update;
  select count(*) into esperados from public.credenciais where segredo is not null;
  select count(distinct cr.id) into recebidos
    from jsonb_array_elements(segredos) e
    join public.credenciais cr on cr.id = (e->>'id')::uuid and cr.segredo is not null;
  if recebidos <> esperados or jsonb_array_length(segredos) <> esperados then
    raise exception 'segredos_incompletos'
      using hint = format('esperados %s, recebidos %s — alguém mexeu nas credenciais entretanto?', esperados, recebidos);
  end if;

  insert into public.cofre_backup (versao, salt, iteracoes, verificador, segredos)
  select c.versao, c.salt, c.iteracoes, c.verificador,
         coalesce(jsonb_agg(jsonb_build_object('id', cr.id, 'segredo', cr.segredo)), '[]'::jsonb)
    from public.credenciais cr where cr.segredo is not null;

  nova := c.versao + 1;
  update public.cofre
     set salt = novo_salt, iteracoes = novas_iteracoes, verificador = novo_verificador, versao = nova
   where id = 1;
  update public.credenciais cr
     set segredo = e->>'segredo', cofre_versao = nova
    from jsonb_array_elements(segredos) e
   where cr.id = (e->>'id')::uuid;

  return nova;
end $$;

revoke execute on function public.mudar_frase_cofre(int, text, int, text, jsonb) from public, anon;
grant execute on function public.mudar_frase_cofre(int, text, int, text, jsonb) to authenticated;

-- Verificar:  select id, versao, iteracoes from public.cofre;
-- Voltar atrás (só com a frase ANTIGA, e se a nova se perdeu): ver SETUP.md §5.4.
