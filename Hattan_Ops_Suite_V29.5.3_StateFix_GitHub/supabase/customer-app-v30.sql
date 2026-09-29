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
