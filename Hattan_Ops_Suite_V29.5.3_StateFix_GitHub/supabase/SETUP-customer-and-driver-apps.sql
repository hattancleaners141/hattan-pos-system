-- ONE-TIME SETUP for the customer app (V30) and driver app (V31). Safe to run more than once.

-- Hattan Ops Suite V30 — customer app tables.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  email text not null,
  customer_id text,
  status text not null default 'new' check (status in ('new', 'pending', 'linked', 'rejected', 'deleted')),
  match_customer_id text,
  match_note text,
  signup jsonb,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint app_accounts_email unique (store_id, email)
);
create index if not exists app_accounts_status_idx on public.app_accounts (store_id, status, created_at);

create table if not exists public.app_login_codes (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists app_login_codes_email_idx on public.app_login_codes (store_id, email, created_at desc);
create index if not exists app_login_codes_ip_idx on public.app_login_codes (store_id, ip, created_at desc);

alter table public.app_accounts enable row level security;
alter table public.app_login_codes enable row level security;
revoke all on public.app_accounts, public.app_login_codes from anon, authenticated;

-- Sign-out / delete invalidates old app sessions.
alter table public.app_accounts add column if not exists session_epoch int not null default 0;
-- At most one in-flight or successful card charge per ticket (stops double charges).
create unique index if not exists payment_transactions_one_active_charge
  on public.payment_transactions (store_id, order_id)
  where type = 'charge' and status in ('processing', 'succeeded', 'unknown');
-- Hattan Ops Suite V31 — driver app: proof of delivery / pickup.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  kind text not null check (kind in ('delivery', 'pickup', 'attempt')),
  order_ids text[] not null,
  driver_id text,
  driver_name text,
  photos text[] not null default '{}',
  lat double precision,
  lng double precision,
  accuracy int,
  captured_at timestamptz not null default now(),
  method text,
  recipient text,
  note text,
  reason text,
  bags int,
  scanned text[] not null default '{}',
  scan_override text,
  created_at timestamptz not null default now()
);
create index if not exists delivery_proofs_orders_idx on public.delivery_proofs using gin (order_ids);
create index if not exists delivery_proofs_recent_idx on public.delivery_proofs (store_id, captured_at desc);
alter table public.delivery_proofs enable row level security;
revoke all on public.delivery_proofs from anon, authenticated;

-- Private photo bucket (photos are only shown through short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proof', 'delivery-proof', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
