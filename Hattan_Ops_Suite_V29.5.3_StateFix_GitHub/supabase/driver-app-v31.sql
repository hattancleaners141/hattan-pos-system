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
