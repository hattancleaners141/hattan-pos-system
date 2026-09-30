-- Hattan Ops Suite V29.11 — text messaging tables.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  dedupe_key text,
  direction text not null default 'out' check (direction in ('out', 'in')),
  kind text,
  customer_id text,
  order_ids text,
  to_phone text,
  body text,
  status text,
  twilio_sid text,
  error_message text,
  sent_by text,
  created_at timestamptz not null default now(),
  constraint sms_log_dedupe unique (store_id, dedupe_key)
);
create index if not exists sms_log_recent_idx on public.sms_log (store_id, created_at desc);
create index if not exists sms_log_sid_idx on public.sms_log (twilio_sid);

create table if not exists public.sms_optouts (
  store_id text not null,
  phone text not null,
  opted_out boolean not null default true,
  source text,
  updated_at timestamptz not null default now(),
  primary key (store_id, phone)
);

alter table public.sms_log enable row level security;
alter table public.sms_optouts enable row level security;
revoke all on public.sms_log, public.sms_optouts from anon, authenticated;
