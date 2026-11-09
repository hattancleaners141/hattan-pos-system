-- Hattan Ops Suite V47 — tickets and customers become individual database rows.
--
-- Before V47 every customer and ticket lived inside ONE json value (pos_state.payload). Each save
-- re-sent the whole shop, and Netlify refuses requests over 6 MB, so the system would stop saving
-- after a few thousand tickets. From V47:
--   * every ticket and every customer is its own row in public.pos_records (no practical limit);
--   * pos_state.payload keeps only small settings (prices, racks, texts, staff alerts …);
--   * ticket and customer numbers come from the database (pos_counters), so two devices can never
--     hand out the same ticket number;
--   * every earlier version of a ticket/customer is kept for 90 days in pos_record_history.
--
-- Run this whole file once in Supabase → SQL Editor → New query → Run. It is safe to run again.
-- It does not move any data by itself: the first time the V47 site loads, the server copies the
-- existing tickets and customers out of pos_state into pos_records (and keeps them in pos_state's
-- history row pos_state_archive as a backup).

begin;

create sequence if not exists public.pos_rev_seq;

create table if not exists public.pos_records (
  store_id       text   not null,
  kind           text   not null check (kind in ('order', 'customer')),
  id             text   not null,
  rev            bigint not null,
  data           jsonb  not null,
  deleted        boolean not null default false,
  created_client text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text,
  updated_client text,
  -- Lookup columns, always derived from data by the database itself.
  customer_id text generated always as (case when kind = 'order' then data->>'customerId' end) stored,
  ticket      text generated always as (case when kind = 'order' then data->>'ticket' end) stored,
  phone10     text generated always as (case when kind = 'customer'
                then nullif(right(regexp_replace(coalesce(data->>'phone', ''), '\D', '', 'g'), 10), '') end) stored,
  email       text generated always as (case when kind = 'customer'
                then nullif(lower(btrim(coalesce(data->>'email', ''))), '') end) stored,
  -- An order is "open" until it has left the shop AND is settled. Open orders always load on
  -- every device; finished ones load only when recent or when a customer's history is opened.
  open boolean generated always as (
    kind = 'order' and not (
      coalesce(data->>'status', '') in ('picked_up', 'delivered', 'voided', 'void', 'cancelled', 'canceled')
      and (
        data->'paid' = 'true'::jsonb
        or coalesce(data->>'paymentStatus', '') = 'paid'
        or coalesce(data->>'status', '') in ('voided', 'void', 'cancelled', 'canceled')
        or coalesce(data->>'legacy', '') = 'true'
      )
    )
  ) stored,
  primary key (store_id, kind, id)
);
create index if not exists pos_records_rev_idx      on public.pos_records (store_id, rev);
create index if not exists pos_records_customer_idx on public.pos_records (store_id, customer_id) where kind = 'order';
create index if not exists pos_records_open_idx     on public.pos_records (store_id, open) where kind = 'order';
create index if not exists pos_records_updated_idx  on public.pos_records (store_id, kind, updated_at desc);
create index if not exists pos_records_ticket_idx   on public.pos_records (store_id, ticket) where kind = 'order';
create index if not exists pos_records_phone_idx    on public.pos_records (store_id, phone10) where kind = 'customer';
create index if not exists pos_records_email_idx    on public.pos_records (store_id, email) where kind = 'customer';

create table if not exists public.pos_record_history (
  hid        bigint generated always as identity primary key,
  store_id   text not null,
  kind       text not null,
  id         text not null,
  rev        bigint not null,
  data       jsonb not null,
  deleted    boolean not null default false,
  changed_by text,
  saved_at   timestamptz not null default now()
);
create index if not exists pos_record_history_lookup_idx on public.pos_record_history (store_id, kind, id, rev desc);
create index if not exists pos_record_history_age_idx on public.pos_record_history (saved_at);

create or replace function public.hattan_keep_record_history() returns trigger
language plpgsql as $$
begin
  insert into public.pos_record_history(store_id, kind, id, rev, data, deleted, changed_by)
    values (old.store_id, old.kind, old.id, old.rev, old.data, old.deleted, old.updated_by);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists pos_records_history on public.pos_records;
create trigger pos_records_history before update or delete on public.pos_records
  for each row execute function public.hattan_keep_record_history();

-- Numbers handed out by the database. Each device reserves a small block of ticket numbers so it
-- can keep writing tickets during a short internet drop without ever duplicating another device.
create table if not exists public.pos_counters (
  store_id   text   not null,
  name       text   not null,
  next_value bigint not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, name)
);

-- Returns the first number of a block of p_count numbers. p_at_least lets the shop raise the
-- starting point (e.g. "start tickets at 50000") but never lowers it.
create or replace function public.hattan_reserve_numbers(p_store_id text, p_name text, p_count integer, p_at_least bigint default 1)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  first_value bigint;
  n integer := greatest(0, least(coalesce(p_count, 1), 1000));
begin
  insert into public.pos_counters(store_id, name, next_value)
    values (p_store_id, p_name, greatest(coalesce(p_at_least, 1), 1) + n)
  on conflict (store_id, name) do update
    set next_value = greatest(public.pos_counters.next_value, coalesce(p_at_least, 1)) + n,
        updated_at = now()
  returning next_value - n into first_value;
  return first_value;
end $$;

alter table public.pos_state add column if not exists records_rev bigint not null default 0;
create table if not exists public.pos_state_archive (
  id         bigint generated always as identity primary key,
  store_id   text not null,
  reason     text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

-- Save a batch of tickets/customers. Each item: {kind, id, baseRev, data}.
--   baseRev = the rev this device last saw (0 for a record it just created).
-- Results:
--   applied   – saved; the record's new rev
--   conflicts – someone else changed it first; the current server copy is returned so the
--               device can merge field by field and send again
--   renamed   – a DIFFERENT device already created a record with the same id (e.g. the same
--               ticket number written offline). Nothing is merged or lost: this copy is saved
--               under a new id and the device is told the new id.
create or replace function public.hattan_put_records(p_store_id text, p_records jsonb, p_staff_id text, p_client_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  cur public.pos_records%rowtype;
  v_kind text; v_id text; v_new_id text; v_base bigint; v_rev bigint; v_data jsonb;
  applied jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; renamed jsonb := '[]'::jsonb;
  max_rev bigint := 0;
begin
  -- One writer at a time per shop (always lock the shop row first, like every other save), so
  -- saves can never deadlock each other.
  perform 1 from public.pos_state where store_id = p_store_id for update;
  for item in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    v_kind := item->>'kind';
    v_id := left(coalesce(item->>'id', ''), 200);
    v_base := coalesce((item->>'baseRev')::bigint, 0);
    v_data := item->'data';
    if v_kind not in ('order', 'customer') or v_id = '' or v_data is null or jsonb_typeof(v_data) <> 'object' then
      continue;
    end if;
    select * into cur from public.pos_records where store_id = p_store_id and kind = v_kind and id = v_id for update;
    if not found then
      v_rev := nextval('public.pos_rev_seq');
      insert into public.pos_records(store_id, kind, id, rev, data, created_client, updated_by, updated_client)
        values (p_store_id, v_kind, v_id, v_rev, v_data, p_client_id, p_staff_id, p_client_id);
      applied := applied || jsonb_build_object('kind', v_kind, 'id', v_id, 'rev', v_rev);
    elsif v_base = 0 and coalesce(cur.created_client, '') <> coalesce(p_client_id, '') then
      -- Two devices created the same id. Keep both.
      v_new_id := v_id || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
      v_rev := nextval('public.pos_rev_seq');
      v_data := jsonb_set(v_data, '{id}', to_jsonb(v_new_id));
      insert into public.pos_records(store_id, kind, id, rev, data, created_client, updated_by, updated_client)
        values (p_store_id, v_kind, v_new_id, v_rev, v_data, p_client_id, p_staff_id, p_client_id);
      renamed := renamed || jsonb_build_object('kind', v_kind, 'from', v_id, 'to', v_new_id, 'rev', v_rev,
        'ticket', v_data->>'ticket');
    elsif (v_base <> 0 and cur.rev <> v_base)
       or (v_base = 0 and coalesce(cur.updated_client, '') <> coalesce(p_client_id, '')) then
      conflicts := conflicts || jsonb_build_object('kind', v_kind, 'id', v_id, 'rev', cur.rev, 'data', cur.data, 'deleted', cur.deleted);
      continue;
    else
      -- Normal save (or this device re-sending a record it created whose reply it never got).
      v_rev := nextval('public.pos_rev_seq');
      update public.pos_records
        set rev = v_rev, data = v_data, deleted = false, updated_at = now(), updated_by = p_staff_id, updated_client = p_client_id
        where store_id = p_store_id and kind = v_kind and id = v_id;
      applied := applied || jsonb_build_object('kind', v_kind, 'id', v_id, 'rev', v_rev);
    end if;
    max_rev := greatest(max_rev, v_rev);
  end loop;
  if max_rev > 0 then
    -- Touching pos_state wakes every other device through Supabase Realtime.
    update public.pos_state
      set records_rev = greatest(records_rev, max_rev), updated_client = p_client_id, updated_by = p_staff_id
      where store_id = p_store_id;
  end if;
  return jsonb_build_object('applied', applied, 'conflicts', conflicts, 'renamed', renamed, 'maxRev', max_rev);
end $$;

-- All-or-nothing save used by the server (customer app, driver app, Clover, texting): either every
-- record is still at the rev the server read (and the settings are at p_base_version, when given)
-- and everything is saved together, or nothing is saved and {conflict:true} comes back so the
-- server re-reads and re-applies its change once.
create or replace function public.hattan_commit(p_store_id text, p_base_version bigint, p_payload jsonb, p_records jsonb, p_staff_id text, p_client_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  st public.pos_state%rowtype;
  cur_rev bigint;
  result jsonb := jsonb_build_object('applied', '[]'::jsonb, 'maxRev', 0);
  new_version bigint;
begin
  select * into st from public.pos_state where store_id = p_store_id for update;
  if not found then
    insert into public.pos_state(store_id, version, payload, updated_by, updated_client) values (p_store_id, 0, '{}'::jsonb, p_staff_id, p_client_id)
      returning * into st;
  end if;
  if p_payload is not null and st.version <> coalesce(p_base_version, 0) then
    return jsonb_build_object('conflict', true, 'reason', 'settings');
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    select rev into cur_rev from public.pos_records
      where store_id = p_store_id and kind = item->>'kind' and id = item->>'id' for update;
    if coalesce(cur_rev, 0) <> coalesce((item->>'baseRev')::bigint, 0) then
      return jsonb_build_object('conflict', true, 'reason', 'record', 'kind', item->>'kind', 'id', item->>'id');
    end if;
  end loop;
  if jsonb_array_length(coalesce(p_records, '[]'::jsonb)) > 0 then
    result := public.hattan_put_records(p_store_id, p_records, p_staff_id, p_client_id);
  end if;
  if p_payload is not null then
    new_version := st.version + 1;
    update public.pos_state
      set payload = p_payload - 'orders' - 'customers' - 'nextTicket' - 'nextCustomerNumber',
          version = new_version, updated_at = now(), updated_by = p_staff_id, updated_client = p_client_id
      where store_id = p_store_id;
    insert into public.sync_audit(store_id, version, staff_id, client_id) values (p_store_id, new_version, p_staff_id, p_client_id);
    result := result || jsonb_build_object('version', new_version);
  end if;
  return result || jsonb_build_object('conflict', false);
end $$;

-- One-time move of the old all-in-one payload into rows. Idempotent: existing rows are kept,
-- and the original payload is copied to pos_state_archive before orders/customers are removed.
create or replace function public.hattan_migrate_payload_records(p_store_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st public.pos_state%rowtype;
  moved_orders integer := 0; moved_customers integer := 0;
  max_rev bigint := 0;
begin
  select * into st from public.pos_state where store_id = p_store_id for update;
  if not found then return jsonb_build_object('migrated', false); end if;
  if not (st.payload ? 'orders' or st.payload ? 'customers' or st.payload ? 'nextTicket' or st.payload ? 'nextCustomerNumber') then
    return jsonb_build_object('migrated', false);
  end if;
  insert into public.pos_state_archive(store_id, reason, payload) values (p_store_id, 'before V47 records migration', st.payload);

  with src as (
    select 'order' as kind, e as data from jsonb_array_elements(case when jsonb_typeof(st.payload->'orders') = 'array' then st.payload->'orders' else '[]'::jsonb end) e
    union all
    select 'customer', e from jsonb_array_elements(case when jsonb_typeof(st.payload->'customers') = 'array' then st.payload->'customers' else '[]'::jsonb end) e
  ), ok as (
    select distinct on (kind, data->>'id') kind, data from src
    where jsonb_typeof(data) = 'object' and coalesce(data->>'id', '') <> ''
  ), ins as (
    insert into public.pos_records(store_id, kind, id, rev, data, created_client, updated_by, updated_client)
      select p_store_id, kind, data->>'id', nextval('public.pos_rev_seq'), data, 'v47-migration', 'v47-migration', 'v47-migration' from ok
    on conflict (store_id, kind, id) do nothing
    returning kind, rev
  )
  select count(*) filter (where kind = 'order'), count(*) filter (where kind = 'customer'), coalesce(max(rev), 0)
    into moved_orders, moved_customers, max_rev from ins;

  if st.payload ? 'nextTicket' then
    perform public.hattan_reserve_numbers(p_store_id, 'ticket', 0, coalesce(nullif(regexp_replace(st.payload->>'nextTicket', '\D', '', 'g'), '')::bigint, 1));
  end if;
  if st.payload ? 'nextCustomerNumber' then
    perform public.hattan_reserve_numbers(p_store_id, 'customer', 0, coalesce(nullif(regexp_replace(st.payload->>'nextCustomerNumber', '\D', '', 'g'), '')::bigint, 10001));
  end if;

  update public.pos_state
    set payload = st.payload - 'orders' - 'customers' - 'nextTicket' - 'nextCustomerNumber',
        version = st.version + 1,
        records_rev = greatest(st.records_rev, max_rev),
        updated_at = now(), updated_by = 'v47-migration', updated_client = 'v47-migration'
    where store_id = p_store_id;
  return jsonb_build_object('migrated', true, 'orders', moved_orders, 'customers', moved_customers);
end $$;

-- Deletes saved earlier versions older than p_days (called by the 15-minute Clover sync job).
create or replace function public.hattan_trim_record_history(p_days integer default 90)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.pos_record_history where saved_at < now() - make_interval(days => greatest(p_days, 7));
  get diagnostics n = row_count;
  return n;
end $$;

alter table public.pos_records enable row level security;
alter table public.pos_record_history enable row level security;
alter table public.pos_counters enable row level security;
alter table public.pos_state_archive enable row level security;
revoke all on public.pos_records, public.pos_record_history, public.pos_counters, public.pos_state_archive from anon, authenticated;
revoke all on function public.hattan_put_records(text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.hattan_reserve_numbers(text, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.hattan_migrate_payload_records(text) from public, anon, authenticated;
revoke all on function public.hattan_trim_record_history(integer) from public, anon, authenticated;
revoke all on function public.hattan_commit(text, bigint, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.hattan_commit(text, bigint, jsonb, jsonb, text, text) to service_role;
grant execute on function public.hattan_put_records(text, jsonb, text, text) to service_role;
grant execute on function public.hattan_reserve_numbers(text, text, integer, bigint) to service_role;
grant execute on function public.hattan_migrate_payload_records(text) to service_role;
grant execute on function public.hattan_trim_record_history(integer) to service_role;
grant select, insert, update, delete on public.pos_records, public.pos_record_history, public.pos_counters, public.pos_state_archive to service_role;
grant usage, select on sequence public.pos_rev_seq to service_role;

commit;
