-- Hattan Ops Suite V16.1 shared database foundation
-- Run this entire file once in Supabase > SQL Editor.

begin;

create table if not exists public.staff_accounts (
  id text primary key,
  store_id text not null,
  display_name text not null,
  initials text not null,
  manager boolean not null default false,
  active boolean not null default true,
  pin_hash text not null,
  pin_salt text not null,
  pin_iterations integer not null default 210000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, display_name)
);

create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  store_id text not null,
  staff_id text not null,
  ip_address text not null,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_guard_idx on public.login_attempts (store_id, staff_id, ip_address, attempted_at desc);

create table if not exists public.pos_state (
  store_id text primary key,
  version bigint not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  updated_client text
);

create table if not exists public.sync_audit (
  id bigint generated always as identity primary key,
  store_id text not null,
  version bigint not null,
  staff_id text,
  client_id text,
  created_at timestamptz not null default now()
);
create index if not exists sync_audit_store_idx on public.sync_audit (store_id, created_at desc);

create table if not exists public.payment_vault (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  customer_id text not null,
  clover_customer_id text not null,
  clover_source_id text,
  brand text,
  last4 text,
  exp_month text,
  exp_year text,
  active boolean not null default true,
  consent_at timestamptz not null,
  consent_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, customer_id)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  order_id text,
  customer_id text,
  type text not null check (type in ('charge', 'refund')),
  processor text not null default 'clover',
  processor_id text,
  parent_processor_id text,
  idempotency_key text,
  amount_cents bigint not null default 0,
  currency text not null default 'usd',
  status text not null,
  brand text,
  last4 text,
  error_message text,
  initiated_by text,
  processor_created_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_transactions_idempotency_idx
  on public.payment_transactions (store_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists payment_transactions_order_idx on public.payment_transactions (store_id, order_id, created_at desc);

-- V25.4 normalized legacy migration storage. Large customer lists must not be
-- embedded in the single pos_state JSON document.
create table if not exists public.legacy_customers (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  legacy_customer_number text not null,
  name text,
  phone text,
  email text,
  address_line1 text,
  apartment text,
  city text,
  state text,
  postal_code text,
  balance numeric(12,2),
  store_credit numeric(12,2),
  memo text,
  preferences text,
  default_fulfillment text,
  last_visit text,
  join_date text,
  route text,
  customer_type text,
  legacy_payload jsonb not null default '{}'::jsonb,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, legacy_customer_number)
);
create index if not exists legacy_customers_number_idx on public.legacy_customers (store_id, legacy_customer_number);
create index if not exists legacy_customers_name_idx on public.legacy_customers (store_id, lower(name));
create index if not exists legacy_customers_phone_idx on public.legacy_customers (store_id, phone);

create table if not exists public.migration_imports (
  store_id text not null,
  file_hash text not null,
  file_name text not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  total_rows bigint not null default 0,
  processed_rows bigint not null default 0,
  inserted_rows bigint not null default 0,
  updated_rows bigint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  imported_by text,
  error_message text,
  primary key (store_id, file_hash)
);

create or replace function public.hattan_upsert_legacy_customers(
  p_store_id text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Customer import batches must contain 1 to 500 rows';
  end if;
  insert into public.legacy_customers as current (
    store_id, legacy_customer_number, name, phone, email, address_line1,
    apartment, city, state, postal_code, balance, store_credit, memo,
    preferences, default_fulfillment, last_visit, join_date, route,
    customer_type, legacy_payload, source_file, updated_at
  )
  select
    p_store_id, nullif(trim(row->>'customer_number'),''), nullif(trim(row->>'name'),''),
    nullif(trim(row->>'phone'),''), nullif(trim(row->>'email'),''),
    nullif(trim(row->>'address_line1'),''), nullif(trim(row->>'apartment'),''),
    nullif(trim(row->>'city'),''), nullif(trim(row->>'state'),''),
    nullif(trim(row->>'postal_code'),''), nullif(row->>'balance','')::numeric,
    nullif(row->>'store_credit','')::numeric, nullif(trim(row->>'memo'),''),
    nullif(trim(row->>'preferences'),''), nullif(trim(row->>'default_fulfillment'),''),
    nullif(trim(row->>'last_visit'),''), nullif(trim(row->>'join_date'),''),
    nullif(trim(row->>'route'),''), nullif(trim(row->>'customer_type'),''),
    coalesce(row->'legacy_payload','{}'::jsonb), nullif(trim(row->>'source_file'),''), now()
  from jsonb_array_elements(p_rows) row
  where nullif(trim(row->>'customer_number'),'') is not null
  on conflict (store_id, legacy_customer_number) do update set
    name=coalesce(excluded.name,current.name), phone=coalesce(excluded.phone,current.phone),
    email=coalesce(excluded.email,current.email), address_line1=coalesce(excluded.address_line1,current.address_line1),
    apartment=coalesce(excluded.apartment,current.apartment), city=coalesce(excluded.city,current.city),
    state=coalesce(excluded.state,current.state), postal_code=coalesce(excluded.postal_code,current.postal_code),
    balance=coalesce(excluded.balance,current.balance), store_credit=coalesce(excluded.store_credit,current.store_credit),
    memo=coalesce(excluded.memo,current.memo), preferences=coalesce(excluded.preferences,current.preferences),
    default_fulfillment=coalesce(excluded.default_fulfillment,current.default_fulfillment),
    last_visit=coalesce(excluded.last_visit,current.last_visit), join_date=coalesce(excluded.join_date,current.join_date),
    route=coalesce(excluded.route,current.route), customer_type=coalesce(excluded.customer_type,current.customer_type),
    legacy_payload=current.legacy_payload || excluded.legacy_payload,
    source_file=coalesce(excluded.source_file,current.source_file), updated_at=now();
  get diagnostics affected = row_count;
  return jsonb_build_object('affected', affected);
end;
$$;

alter table public.staff_accounts enable row level security;
alter table public.login_attempts enable row level security;
alter table public.pos_state enable row level security;
alter table public.sync_audit enable row level security;
alter table public.payment_vault enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.legacy_customers enable row level security;
alter table public.migration_imports enable row level security;

revoke all on public.staff_accounts, public.login_attempts, public.pos_state, public.sync_audit, public.payment_vault, public.payment_transactions from anon, authenticated;
revoke all on public.legacy_customers, public.migration_imports from anon, authenticated;
revoke all on function public.hattan_upsert_legacy_customers(text, jsonb) from public, anon, authenticated;
grant execute on function public.hattan_upsert_legacy_customers(text, jsonb) to service_role;
grant select on public.pos_state to authenticated;

drop policy if exists "Hattan signed-in staff can receive their store state" on public.pos_state;
create policy "Hattan signed-in staff can receive their store state"
  on public.pos_state for select to authenticated
  using ((select auth.jwt()->>'store_id') = store_id);

create or replace function public.hattan_sync_state(
  p_store_id text,
  p_base_version bigint,
  p_payload jsonb,
  p_staff_id text,
  p_client_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.pos_state%rowtype;
  next_version bigint;
begin
  select * into current_row from public.pos_state where store_id = p_store_id for update;
  if not found then
    if coalesce(p_base_version, 0) <> 0 then
      return jsonb_build_object('conflict', true, 'version', 0, 'payload', '{}'::jsonb);
    end if;
    insert into public.pos_state(store_id, version, payload, updated_at, updated_by, updated_client)
      values (p_store_id, 1, coalesce(p_payload, '{}'::jsonb), now(), p_staff_id, p_client_id)
      returning * into current_row;
    insert into public.sync_audit(store_id, version, staff_id, client_id)
      values (p_store_id, 1, p_staff_id, p_client_id);
    return jsonb_build_object('conflict', false, 'version', 1, 'updated_at', current_row.updated_at);
  end if;

  if current_row.version <> coalesce(p_base_version, 0) then
    return jsonb_build_object(
      'conflict', true,
      'version', current_row.version,
      'payload', current_row.payload,
      'updated_at', current_row.updated_at,
      'updated_by', current_row.updated_by,
      'updated_client', current_row.updated_client
    );
  end if;

  next_version := current_row.version + 1;
  update public.pos_state
    set version = next_version,
        payload = coalesce(p_payload, '{}'::jsonb),
        updated_at = now(),
        updated_by = p_staff_id,
        updated_client = p_client_id
    where store_id = p_store_id
    returning * into current_row;
  insert into public.sync_audit(store_id, version, staff_id, client_id)
    values (p_store_id, next_version, p_staff_id, p_client_id);
  return jsonb_build_object('conflict', false, 'version', next_version, 'updated_at', current_row.updated_at);
end;
$$;

revoke all on function public.hattan_sync_state(text, bigint, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.hattan_sync_state(text, bigint, jsonb, text, text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_state'
  ) then
    alter publication supabase_realtime add table public.pos_state;
  end if;
end $$;

commit;
