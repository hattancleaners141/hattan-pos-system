// V47 — tickets ("orders") and customers are individual rows in public.pos_records.
// pos_state.payload keeps only small shop settings. See supabase/records-v47.sql.
import { selectRows, supabaseRest, storeId, HttpError } from './shared.mjs';

export const RECORD_KEYS = { orders: 'order', customers: 'customer' };
// Keys that used to live in pos_state.payload but no longer do.
export const RETIRED_PAYLOAD_KEYS = ['orders', 'customers', 'nextTicket', 'nextCustomerNumber'];
export const RECORD_SELECT = 'kind,id,rev,data,deleted';
// Finished tickets stay on every device this long after their last change.
export const RECENT_DAYS = 120;
// Records per page when a device loads or catches up (keeps every reply far below 6 MB).
export const PAGE_SIZE = 800;

const sid = () => encodeURIComponent(storeId());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
export const inList = ids => encodeURIComponent('(' + ids.map(i => `"${String(i).replace(/["\\]/g, '')}"`).join(',') + ')');
export const isoDaysAgo = days => new Date(Date.now() - days * 864e5).toISOString();

const SECRET_KEY = /^(pin|pinHash|pinSalt|pinIterations|processorToken|privateToken|cardNumber|cvv|cvc|securityCode)$/i;
// Never store card secrets, PIN material or inline photo data in shared data.
export function stripSecrets(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map(item => stripSecrets(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || /dataUrl/i.test(key)) continue;
    safe[key] = stripSecrets(item, depth + 1);
  }
  return safe;
}

// ------------------------------------------------------------------ one-time migration
let migrated = false;
export async function ensureMigrated() {
  if (migrated) return;
  const result = await supabaseRest('rpc/hattan_migrate_payload_records', { method: 'POST', body: JSON.stringify({ p_store_id: storeId() }) });
  if (result?.migrated) console.log('[V47] moved tickets/customers into pos_records', result);
  migrated = true;
}

// ------------------------------------------------------------------ reads
export async function recordsByIds(kind, ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  const out = [];
  for (const part of chunk(list, 80)) {
    const rows = await selectRows('pos_records', `store_id=eq.${sid()}&kind=eq.${kind}&deleted=eq.false&id=in.${inList(part)}`, RECORD_SELECT);
    out.push(...(rows || []));
  }
  return out;
}
export async function queryRecords(kind, filter = '', { limit = 5000, order = 'rev.desc' } = {}) {
  const rows = await selectRows('pos_records', `store_id=eq.${sid()}&kind=eq.${kind}&deleted=eq.false${filter ? '&' + filter : ''}&order=${order}&limit=${limit}`, RECORD_SELECT);
  return rows || [];
}
export async function ordersForCustomers(customerIds, { limit = 2000 } = {}) {
  const list = [...new Set((customerIds || []).map(String).filter(Boolean))];
  const out = [];
  for (const part of chunk(list, 80)) out.push(...await queryRecords('order', `customer_id=in.${inList(part)}`, { limit }));
  return out;
}
// Tickets still in the shop or unpaid, plus anything changed in the last `recentDays`.
export async function workingOrders(recentDays = 3) {
  return queryRecords('order', `or=(open.eq.true,updated_at.gt.${encodeURIComponent(isoDaysAgo(recentDays))})`, { limit: 20000 });
}
export async function customerByPhone(digits10) {
  if (!/^\d{10}$/.test(String(digits10 || ''))) return [];
  return queryRecords('customer', `phone10=eq.${digits10}`, { limit: 20 });
}
export async function customersByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return [];
  return queryRecords('customer', `email=eq.${encodeURIComponent(e)}`, { limit: 20 });
}
// A texting number (+12125550101) → customers whose phone or text-consent phone matches it.
export async function customersByTextNumber(e164) {
  const d = String(e164 || '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return [];
  const a = await customerByPhone(d);
  const b = await queryRecords('customer', `data->smsConsent->>phone=eq.${encodeURIComponent('+1' + d)}`, { limit: 20 });
  return [...a, ...b];
}
export async function textableCustomers() {
  return queryRecords('customer', `data->smsConsent->>on=eq.true`, { limit: 50000 });
}

export async function readSettings() {
  const rows = await selectRows('pos_state', `store_id=eq.${sid()}&limit=1`, 'store_id,version,payload,records_rev,updated_at,updated_by,updated_client');
  const row = rows?.[0];
  const payload = { ...(row?.payload || {}) };
  RETIRED_PAYLOAD_KEYS.forEach(k => delete payload[k]);
  return { exists: !!row, version: Number(row?.version || 0), recordsRev: Number(row?.records_rev || 0), payload, row };
}

// ------------------------------------------------------------------ writes
export async function putRecords(records, staffId, clientId) {
  const applied = [], conflicts = [], renamed = [];
  records = [...records].sort((a, b) => (a.kind + ':' + a.id).localeCompare(b.kind + ':' + b.id));
  // Small batches keep each database call quick and each request far below size limits.
  for (const part of chunk(records, 150)) {
    const res = await supabaseRest('rpc/hattan_put_records', {
      method: 'POST',
      body: JSON.stringify({ p_store_id: storeId(), p_records: part, p_staff_id: String(staffId || ''), p_client_id: String(clientId || '').slice(0, 100) }),
    });
    applied.push(...(res?.applied || [])); conflicts.push(...(res?.conflicts || [])); renamed.push(...(res?.renamed || []));
  }
  return { applied, conflicts, renamed };
}

// Number blocks from public.pos_counters. Returns the first number of the block.
export async function reserveNumbers(name, count = 1, atLeast = 1) {
  const first = await supabaseRest('rpc/hattan_reserve_numbers', {
    method: 'POST',
    body: JSON.stringify({ p_store_id: storeId(), p_name: name, p_count: count, p_at_least: atLeast }),
  });
  const n = Number(first);
  if (!Number.isSafeInteger(n)) throw new HttpError(503, 'Could not reserve a number');
  return n;
}
export const nextCustomerNumber = async () => `C-${await reserveNumbers('customer', 1, 10001)}`;

// ------------------------------------------------------------------ server-side read/modify/write
// scope (all optional):
//   customerIds: [...]        customers by id
//   customerRows: async () => rows   any custom customer lookup (phone, email …)
//   ordersOfCustomers: true   every ticket of the loaded customers
//   orderIds: [...]           tickets by id
//   workingOrders: true|days  open tickets + recently changed ones
//   orderCustomers: true      the customers of the loaded tickets
//   textable: true            customers who agreed to texts
export async function readStore(scope = {}) {
  await ensureMigrated();
  const settings = await readSettings();
  const customers = new Map(), orders = new Map();
  const add = (map, rows) => (rows || []).forEach(r => { if (r && !r.deleted && r.data && typeof r.data === 'object') map.set(String(r.id), r); });
  if (scope.customerIds?.length) add(customers, await recordsByIds('customer', scope.customerIds));
  if (scope.customerRows) add(customers, await scope.customerRows());
  if (scope.textable) add(customers, await textableCustomers());
  if (scope.orderIds?.length) add(orders, await recordsByIds('order', scope.orderIds));
  if (scope.workingOrders) add(orders, await workingOrders(typeof scope.workingOrders === 'number' ? scope.workingOrders : 3));
  if (scope.ordersOfCustomers && customers.size) add(orders, await ordersForCustomers([...customers.keys()]));
  if (scope.orderCustomers) {
    const missing = [...new Set([...orders.values()].map(r => String(r.data.customerId || '')).filter(id => id && !customers.has(id)))];
    if (missing.length) add(customers, await recordsByIds('customer', missing));
  }
  const revs = new Map();
  customers.forEach((r, id) => revs.set(`customer:${id}`, Number(r.rev)));
  orders.forEach((r, id) => revs.set(`order:${id}`, Number(r.rev)));
  const payload = {
    ...settings.payload,
    customers: [...customers.values()].map(r => r.data),
    orders: [...orders.values()].map(r => r.data).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  };
  return { version: settings.version, payload, revs };
}

const text = v => JSON.stringify(v);
export async function mutateStore(fn, scope = {}, { staffId = 'server', clientId = 'server' } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { version, payload, revs } = await readStore(scope);
    const before = new Map();
    for (const [key, kind] of Object.entries(RECORD_KEYS)) (payload[key] || []).forEach(r => before.set(`${kind}:${r.id}`, text(r)));
    const smallBefore = { ...payload }; delete smallBefore.orders; delete smallBefore.customers;
    const smallBeforeText = text(smallBefore);
    const draft = structuredClone(payload);
    const out = await fn(draft);
    if (out && out.__noWrite) return out.value;

    const records = [];
    for (const [key, kind] of Object.entries(RECORD_KEYS)) {
      for (const r of draft[key] || []) {
        if (!r || typeof r !== 'object' || !r.id) continue;
        const k = `${kind}:${r.id}`;
        if (before.get(k) === text(r)) continue;
        records.push({ kind, id: String(r.id), baseRev: revs.get(k) || 0, data: stripSecrets(r) });
      }
    }
    const small = { ...draft }; delete small.orders; delete small.customers;
    RETIRED_PAYLOAD_KEYS.forEach(k => delete small[k]);
    const smallChanged = text(small) !== smallBeforeText;
    if (!records.length && !smallChanged) return out;

    const res = await supabaseRest('rpc/hattan_commit', {
      method: 'POST',
      body: JSON.stringify({
        p_store_id: storeId(), p_base_version: version, p_payload: smallChanged ? small : null,
        p_records: records, p_staff_id: staffId, p_client_id: clientId,
      }),
    });
    if (!res?.conflict) return out;
    await sleep(120 * (attempt + 1));
  }
  throw new HttpError(503, 'The shop system is busy. Please try again.');
}
export const noWrite = value => ({ __noWrite: true, value });
