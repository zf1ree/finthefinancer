-- Fin · schema inicial do MVP
-- Convenções: dinheiro em centavos (bigint), user_id em toda tabela de usuário,
-- RLS ligado e forçado, FKs compostas (id, user_id) para impedir referência a dados de outro usuário.


create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============ Tipos ============
create type public.account_type      as enum ('checking','savings','credit_card','investment','loan','other');
create type public.tx_direction      as enum ('in','out');
create type public.tx_status         as enum ('pending','posted','removed');
create type public.tx_kind           as enum ('regular','internal_transfer','card_bill_payment','investment_move','refund');
create type public.category_source   as enum ('user','user_rule','system_rule','provider','ai','default');
create type public.connection_status as enum ('active','updating','login_error','outdated','revoked','error');
create type public.insight_severity  as enum ('info','positive','warning','critical');
create type public.insight_status    as enum ('new','seen','dismissed','acted');
create type public.pending_status    as enum ('proposed','confirmed','discarded','expired','failed');
create type public.created_by        as enum ('user','ai_confirmed');

-- ============ Perfil ============
create table public.user_profile (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  display_name                text not null check (length(display_name) between 1 and 60),
  monthly_income_cents        bigint check (monthly_income_cents >= 0),
  main_goal                   text check (main_goal in ('organize','save','debt','invest','other')),
  low_balance_threshold_cents bigint not null default 50000 check (low_balance_threshold_cents >= 0),
  payday_day                  smallint check (payday_day between 1 and 31),
  timezone                    text not null default 'America/Sao_Paulo',
  ai_enabled                  boolean not null default true,
  onboarded_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ============ Open Finance ============
create table public.institution (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'pluggy',
  external_id   text not null,
  name          text not null,
  logo_url      text,
  primary_color text,
  unique (provider, external_id)
);

create table public.of_connection (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  institution_id          uuid references public.institution(id),
  provider                text not null default 'pluggy',
  external_item_id        text not null,
  status                  public.connection_status not null default 'active',
  status_detail           text,
  last_synced_at          timestamptz,
  last_provider_update_at timestamptz,
  tx_cursor_date          date,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, provider, external_item_id),
  unique (id, user_id)
);

create table public.consent (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  connection_id       uuid not null,
  external_consent_id text,
  permissions         text[] not null default '{}',
  granted_at          timestamptz,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (connection_id, user_id) references public.of_connection(id, user_id) on delete cascade
);

-- ============ Contas ============
create table public.account (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  connection_id     uuid,
  external_id       text,
  type              public.account_type not null,
  name              text not null check (length(name) between 1 and 120),
  number_masked     text check (number_masked is null or length(number_masked) <= 8),
  currency          char(3) not null default 'BRL',
  balance_cents     bigint not null default 0,
  balance_at        timestamptz,
  include_in_totals boolean not null default true,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (connection_id, external_id),
  unique (id, user_id),
  foreign key (connection_id, user_id) references public.of_connection(id, user_id) on delete set null (connection_id)
);

create table public.credit_card (
  account_id            uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  brand                 text,
  credit_limit_cents    bigint check (credit_limit_cents >= 0),
  available_limit_cents bigint,
  closing_day           smallint check (closing_day between 1 and 31),
  due_day               smallint check (due_day between 1 and 31),
  closing_day_source    text check (closing_day_source in ('provider','inferred','user')),
  updated_at            timestamptz not null default now(),
  foreign key (account_id, user_id) references public.account(id, user_id) on delete cascade
);

create table public.credit_card_invoice (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null,
  external_id     text,
  reference_month date not null check (extract(day from reference_month) = 1),
  close_date      date,
  due_date        date,
  total_cents     bigint,
  minimum_cents   bigint,
  is_open         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id, reference_month),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.account(id, user_id) on delete cascade
);

-- ============ Categorias ============
create table public.category (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,  -- null = categoria do sistema
  parent_id    uuid references public.category(id),
  slug         text not null check (slug ~ '^[a-z0-9_]+(\.[a-z0-9_]+)?$'),
  name         text not null check (length(name) between 1 and 60),
  icon         text,
  color_token  text,
  kind         text not null check (kind in ('expense','income','transfer','investment')),
  is_essential boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index category_slug_unique
  on public.category (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

create table public.categorization_rule (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  match_type      text not null check (match_type in ('merchant_exact','description_contains','cnpj')),
  match_value     text not null check (length(match_value) between 2 and 120),
  category_id     uuid not null references public.category(id),
  priority        smallint not null default 100,
  created_from_tx uuid,
  hits            integer not null default 0 check (hits >= 0),
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, match_type, match_value)
);

-- ============ Transações ============
create table public.transaction (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null,
  external_id         text not null,
  date                date not null,
  amount_cents        bigint not null check (amount_cents > 0),
  direction           public.tx_direction not null,
  currency            char(3) not null default 'BRL',
  status              public.tx_status not null default 'posted',
  kind                public.tx_kind not null default 'regular',
  description_raw     text not null,
  merchant_name_raw   text,
  merchant_cnpj       text,
  merchant_key        text,
  payment_method      text,
  category_id         uuid references public.category(id),
  category_source     public.category_source not null default 'default',
  category_confidence real check (category_confidence between 0 and 1),
  invoice_id          uuid,
  installment_number  smallint check (installment_number > 0),
  installment_total   smallint check (installment_total > 0),
  linked_tx_id        uuid,
  note                text check (length(note) <= 280),
  is_hidden           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (account_id, external_id),
  unique (id, user_id),
  check ((installment_number is null) = (installment_total is null)),
  check (installment_number is null or installment_number <= installment_total),
  foreign key (account_id, user_id) references public.account(id, user_id) on delete cascade,
  foreign key (invoice_id, user_id) references public.credit_card_invoice(id, user_id) on delete set null (invoice_id),
  foreign key (linked_tx_id, user_id) references public.transaction(id, user_id) on delete set null (linked_tx_id)
);
create index tx_user_date     on public.transaction (user_id, date desc);
create index tx_user_category on public.transaction (user_id, category_id, date desc);
create index tx_account_date  on public.transaction (account_id, date desc);
create index tx_user_merchant on public.transaction (user_id, merchant_key);
create index tx_invoice       on public.transaction (invoice_id) where invoice_id is not null;

-- ============ Investimentos (caixinhas) ============
create table public.investment (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  connection_id         uuid not null,
  external_id           text not null,
  name                  text not null,
  type                  text not null,
  subtype               text,
  balance_cents         bigint not null,
  amount_invested_cents bigint,
  rate_description      text,
  liquidity             text,
  balance_at            timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (connection_id, external_id),
  unique (id, user_id),
  foreign key (connection_id, user_id) references public.of_connection(id, user_id) on delete cascade
);

create table public.investment_snapshot (
  investment_id uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  balance_cents bigint not null,
  primary key (investment_id, day),
  foreign key (investment_id, user_id) references public.investment(id, user_id) on delete cascade
);

-- ============ Orçamento, plano e reservas ============
create table public.budget (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  month             date not null check (extract(day from month) = 1),
  total_limit_cents bigint check (total_limit_cents > 0),
  created_by        public.created_by not null,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, month),
  unique (id, user_id)
);

create table public.budget_line (
  id          uuid primary key default gen_random_uuid(),
  budget_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.category(id),
  limit_cents bigint not null check (limit_cents > 0),
  unique (budget_id, category_id),
  foreign key (budget_id, user_id) references public.budget(id, user_id) on delete cascade
);

create table public.reserve (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null check (length(name) between 1 and 60),
  kind                 text not null check (kind in ('emergency','travel','purchase','debt','retirement','custom')),
  target_cents         bigint check (target_cents > 0),
  target_date          date,
  investment_id        uuid,
  manual_balance_cents bigint check (manual_balance_cents >= 0),
  priority             smallint not null default 100,
  created_by           public.created_by not null,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  foreign key (investment_id, user_id) references public.investment(id, user_id) on delete set null (investment_id)
);

create table public.spending_plan (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (length(name) between 1 and 60),
  expected_income_cents bigint not null check (expected_income_cents > 0),
  is_active             boolean not null default true,
  rationale             text check (length(rationale) <= 1000),
  created_by            public.created_by not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id)
);
create unique index one_active_plan on public.spending_plan (user_id) where is_active;

create table public.spending_plan_allocation (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  bucket       text not null check (bucket in ('essential','lifestyle','reserve','debt','invest')),
  category_id  uuid references public.category(id),
  reserve_id   uuid,
  amount_cents bigint not null check (amount_cents >= 0),
  check (bucket <> 'reserve' or reserve_id is not null),
  foreign key (plan_id, user_id) references public.spending_plan(id, user_id) on delete cascade,
  foreign key (reserve_id, user_id) references public.reserve(id, user_id) on delete cascade
);

-- ============ Insights ============
create table public.financial_insight (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null,
  severity       public.insight_severity not null,
  title          text not null,
  body           text not null,
  recommendation text,
  data           jsonb not null,
  action         jsonb,
  fingerprint    text not null,
  status         public.insight_status not null default 'new',
  valid_until    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index insight_user_status on public.financial_insight (user_id, status, created_at desc);

-- ============ IA ============
create table public.ai_conversation (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  summary    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ai_message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool')),
  content         text not null,
  tool_name       text,
  tool_args       jsonb,
  tool_result     jsonb,
  validation      jsonb,
  model           text,
  input_tokens    integer check (input_tokens >= 0),
  output_tokens   integer check (output_tokens >= 0),
  latency_ms      integer check (latency_ms >= 0),
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversation(id, user_id) on delete cascade
);
create index ai_message_conv on public.ai_message (conversation_id, created_at);

create table public.ai_pending_action (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  action_type     text not null check (action_type in ('create_budget','create_spending_plan','create_reserve','update_budget_line','recategorize')),
  payload         jsonb not null,
  status          public.pending_status not null default 'proposed',
  expires_at      timestamptz not null default now() + interval '24 hours',
  decided_at      timestamptz,
  result_ref      uuid,
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversation(id, user_id) on delete set null (conversation_id)
);

-- ============ Operação e auditoria ============
create table public.sync_run (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trigger     text not null check (trigger in ('cron','manual','initial')),
  status      text not null check (status in ('running','ok','partial','failed')),
  step        text,
  stats       jsonb not null default '{}',
  error_code  text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_run_user_started on public.sync_run (user_id, started_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  actor       text not null check (actor in ('user','system','ai_confirmed')),
  action      text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}',
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index audit_user_created on public.audit_log (user_id, created_at desc);

-- ============ Categoria visível para o dono da linha ============
-- FK não passa por RLS; sem isto, uma linha poderia apontar para a categoria própria de outro usuário.
-- A função roda com os privilégios de quem insere (security invoker): para um usuário, a categoria de
-- outra pessoa nem aparece na consulta (RLS) e a inserção é recusada; o service_role enxerga tudo.
create or replace function public.assert_category_visible() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid;
begin
  if new.category_id is null then
    return new;
  end if;
  select c.user_id into owner from public.category c where c.id = new.category_id;
  if not found or (owner is not null and owner is distinct from new.user_id) then
    raise exception 'category % is not available to this user', new.category_id using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.assert_category_parent_visible() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select c.user_id into owner from public.category c where c.id = new.parent_id;
  if not found or (owner is not null and owner is distinct from new.user_id) then
    raise exception 'parent category is not available to this user' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger category_parent_visible before insert or update of parent_id, user_id on public.category
  for each row execute function public.assert_category_parent_visible();
create trigger tx_category_visible before insert or update of category_id, user_id on public.transaction
  for each row execute function public.assert_category_visible();
create trigger rule_category_visible before insert or update of category_id, user_id on public.categorization_rule
  for each row execute function public.assert_category_visible();
create trigger budget_line_category_visible before insert or update of category_id, user_id on public.budget_line
  for each row execute function public.assert_category_visible();
create trigger allocation_category_visible before insert or update of category_id, user_id on public.spending_plan_allocation
  for each row execute function public.assert_category_visible();

-- ============ updated_at ============
do $$
declare t text;
begin
  foreach t in array array[
    'user_profile','of_connection','consent','account','credit_card','credit_card_invoice','category',
    'categorization_rule','transaction','investment','budget','reserve','spending_plan',
    'financial_insight','ai_conversation'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- ============ Row Level Security ============
-- Toda tabela com user_id: o usuário só vê e altera as próprias linhas.
do $$
declare t text;
begin
  foreach t in array array[
    'user_profile','of_connection','consent','account','credit_card','credit_card_invoice',
    'categorization_rule','transaction','investment','investment_snapshot','budget','budget_line',
    'reserve','spending_plan','spending_plan_allocation','financial_insight','ai_conversation',
    'ai_message','ai_pending_action','sync_run'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- institution: catálogo global, leitura para usuários logados, escrita só pelo servidor (service_role).
alter table public.institution enable row level security;
alter table public.institution force row level security;
create policy institution_read on public.institution for select to authenticated using (true);
grant select on public.institution to authenticated;
revoke all on public.institution from anon;

-- category: lê as do sistema e as próprias; altera só as próprias.
alter table public.category enable row level security;
alter table public.category force row level security;
create policy category_select on public.category for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy category_insert on public.category for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy category_update on public.category for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy category_delete on public.category for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.category to authenticated;
revoke all on public.category from anon;

-- audit_log: só inserir e ler as próprias linhas; nunca alterar ou apagar.
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
create policy audit_select on public.audit_log for select to authenticated using (user_id = (select auth.uid()));
create policy audit_insert on public.audit_log for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.audit_log to authenticated;
revoke all on public.audit_log from anon;

-- O servidor (cron) usa service_role, que no Supabase ignora RLS.

grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;
