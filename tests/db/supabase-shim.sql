-- Reproduz, num Postgres comum, o mínimo do ambiente Supabase de que as migrações dependem:
-- papéis anon/authenticated/service_role, schema auth, auth.users e auth.uid().
-- Executado como superusuário só nos testes; no Supabase tudo isto já existe.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'app_owner') then
    create role app_owner login nosuperuser nobypassrls password 'app_owner';
  end if;
end $$;

grant anon, authenticated, service_role to app_owner;

create schema if not exists auth;
grant usage on schema auth to app_owner, authenticated, service_role, anon;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);
grant references, select on auth.users to app_owner;
grant select, insert, delete on auth.users to service_role;

-- Mesma definição usada pelo Supabase: tolera a configuração vazia fora de uma requisição.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role, app_owner;

grant create, usage on schema public to app_owner;
grant usage on schema public to anon, authenticated, service_role;
