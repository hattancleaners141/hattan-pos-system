-- Hattan Ops Suite V33 — Clover Flex (send totals to the card terminal).
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Holds the Clover sign-in for the Flex app. Only the Netlify server can read it.
create table if not exists public.clover_device_auth (
  store_id text primary key,
  environment text not null default 'sandbox',
  merchant_id text not null,
  access_token text not null,
  access_expires_at timestamptz,
  refresh_token text,
  refresh_expires_at timestamptz,
  device_id text,
  device_serial text,
  device_name text,
  connected_by text,
  updated_at timestamptz not null default now()
);
alter table public.clover_device_auth enable row level security;
revoke all on public.clover_device_auth from anon, authenticated;
