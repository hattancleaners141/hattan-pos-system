// V47 server integration test. Needs a Postgres with the Supabase SQL files applied, served by
// PostgREST at $V47_SUPABASE_URL (…/rest/v1/…) with a service_role key in $V47_SERVICE_KEY.
//   V47_SUPABASE_URL=http://127.0.0.1:3012 V47_SERVICE_KEY=… node --test tests/v47-server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const URL_ = process.env.V47_SUPABASE_URL, KEY = process.env.V47_SERVICE_KEY;
const skip = !URL_ || !KEY;
Object.assign(process.env, { SUPABASE_URL: URL_ || '', SUPABASE_SECRET_KEY: KEY || '', HATTAN_SESSION_SECRET: 's'.repeat(40), HATTAN_STORE_ID: 'v47test', CONTEXT: 'dev' });

const { createSession } = await import('../netlify/functions/lib/shared.mjs');
const sync = (await import('../netlify/functions/state-sync.mjs')).handler;
const records = await import('../netlify/functions/lib/records.mjs');
const cookie = () => `hattan_session=${createSession({ id: 'staff1', display_name: 'Test', manager: true, store_id: 'v47test' })}`;
const call = async (method, { q, body } = {}) => {
  const r = await sync({ httpMethod: method, headers: { cookie: cookie(), host: 'x', origin: 'https://x' }, queryStringParameters: q || {}, body: body ? JSON.stringify(body) : '' });
  return { status: r.statusCode, data: JSON.parse(r.body) };
};
const rest = (path, opt = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opt, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(opt.headers || {}) } });

test('V47 records: migration, paging, conflicts, numbers, server writes', { skip }, async () => {
  for (const t of ['pos_records', 'pos_state', 'pos_counters', 'pos_state_archive']) await rest(`${t}?store_id=eq.v47test`, { method: 'DELETE' });
  // An old-style store: everything inside one payload.
  const orders = Array.from({ length: 2000 }, (_, i) => ({ id: `HC-${i + 1}`, ticket: String(i + 1), customerId: `c${i % 300}`, status: i < 1500 ? 'picked_up' : 'ready', paid: i < 1500, createdAt: new Date(Date.now() - (2000 - i) * 36e5).toISOString(), lineItems: [{ name: 'Shirt', qty: 2 }] }));
  const customers = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Customer ${i}`, phone: `(212) 555-${String(1000 + i)}`, email: `c${i}@x.com`, ...(i === 7 ? { smsConsent: { on: true, phone: '+12125551007' } } : {}) }));
  await rest('pos_state', { method: 'POST', body: JSON.stringify({ store_id: 'v47test', version: 4, payload: { orders, customers, nextTicket: 2001, nextCustomerNumber: 10300, rackSettings: { a: 1 } } }) });

  // First load migrates and pages.
  let got = [], after = 0, upto, pages = 0;
  for (;;) {
    const r = await call('GET', { q: { mode: 'initial', after: String(after), ...(upto ? { upto: String(upto) } : {}) } });
    assert.equal(r.status, 200);
    assert.equal(r.data.snapshot.orders, undefined, 'tickets are no longer in settings');
    assert.equal(r.data.snapshot.nextTicket, undefined);
    upto = r.data.upto; got.push(...r.data.records); pages++;
    if (!r.data.next) break; after = r.data.next;
  }
  assert.ok(pages >= 3, 'loads in pages');
  assert.equal(got.filter(r => r.kind === 'customer').length, 300);
  assert.equal(got.filter(r => r.kind === 'order').length, 2000, 'all recent tickets load (all were changed today)');

  // Ticket numbers continue from the old counter and never repeat.
  const a = await call('POST', { body: { op: 'reserve', name: 'ticket', count: 50 } });
  const b = await call('POST', { body: { op: 'reserve', name: 'ticket', count: 50 } });
  assert.equal(a.data.first, 2001); assert.equal(b.data.first, 2051);
  const c = await call('POST', { body: { op: 'reserve', name: 'customer', count: 1 } });
  assert.equal(c.data.first, 10300);

  // Save one changed ticket; a second device with the old rev gets a conflict back.
  const t5 = got.find(r => r.id === 'HC-1505');
  const s1 = await call('PUT', { body: { clientId: 'devA', records: [{ kind: 'order', id: 'HC-1505', baseRev: t5.rev, data: { ...t5.data, status: 'picked_up', paid: true } }] } });
  assert.equal(s1.data.records.applied.length, 1);
  const s2 = await call('PUT', { body: { clientId: 'devB', records: [{ kind: 'order', id: 'HC-1505', baseRev: t5.rev, data: { ...t5.data, notes: 'B' } }] } });
  assert.equal(s2.data.records.conflicts.length, 1);
  assert.equal(s2.data.records.conflicts[0].data.status, 'picked_up');

  // Two devices creating the same ticket id: both are kept.
  await call('PUT', { body: { clientId: 'devA', records: [{ kind: 'order', id: 'HC-9001', baseRev: 0, data: { id: 'HC-9001', ticket: '9001', customerId: 'c1' } }] } });
  const dup = await call('PUT', { body: { clientId: 'devB', records: [{ kind: 'order', id: 'HC-9001', baseRev: 0, data: { id: 'HC-9001', ticket: '9001', customerId: 'c2' } }] } });
  assert.equal(dup.data.records.renamed.length, 1);
  const both = await records.recordsByIds('order', ['HC-9001', dup.data.records.renamed[0].to]);
  assert.deepEqual(both.map(r => r.data.customerId).sort(), ['c1', 'c2']);

  // Catch-up only returns what changed.
  const since = await call('GET', { q: { since: String(upto) } });
  assert.ok(since.data.records.length >= 3 && since.data.records.length < 10);

  // A finished, paid ticket is not "open"; customer history returns old tickets on demand.
  const hist = await call('GET', { q: { customer: 'c5' } });
  assert.ok(hist.data.records.length >= 6);

  // Settings save still uses the version check.
  const st = await call('PUT', { body: { clientId: 'devA', baseVersion: since.data.version, snapshot: { rackSettings: { a: 2 }, orders: [{ id: 'nope' }] } } });
  assert.equal(st.data.settings.conflict, false);
  const st2 = await call('PUT', { body: { clientId: 'devB', baseVersion: since.data.version, snapshot: { rackSettings: { a: 3 } } } });
  assert.equal(st2.data.settings.conflict, true);
  assert.deepEqual(st2.data.settings.snapshot.rackSettings, { a: 2 });
  assert.equal(st2.data.settings.snapshot.orders, undefined, 'tickets can never be written back into settings');

  // Server-side read/modify/write (customer app, drivers, Clover …).
  const out = await records.mutateStore(s => {
    const o = s.orders.find(x => x.id === 'HC-1999'); o.status = 'out_for_delivery';
    s.customers.find(x => x.id === 'c7').points = 42;
    return 'done';
  }, { orderIds: ['HC-1999'], customerIds: ['c7'] });
  assert.equal(out, 'done');
  const [o1999] = await records.recordsByIds('order', ['HC-1999']);
  assert.equal(o1999.data.status, 'out_for_delivery');
  const byText = await records.customersByTextNumber('+12125551007');
  assert.equal(byText[0].data.points, 42);
  const byEmail = await records.customersByEmail('C3@X.com');
  assert.equal(byEmail[0].id, 'c3');
  const working = await records.workingOrders(0);
  assert.ok(working.every(r => r.data.status !== 'picked_up' || !r.data.paid), 'working set = open tickets');
  assert.equal(working.length, 501);

  // History keeps the earlier version.
  const h = await (await rest(`pos_record_history?store_id=eq.v47test&id=eq.HC-1505&select=data`, { headers: { Prefer: '' } })).json();
  assert.equal(h[0].data.status, 'ready');
});
