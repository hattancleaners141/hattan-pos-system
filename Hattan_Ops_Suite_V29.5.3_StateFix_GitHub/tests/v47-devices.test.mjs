// V47 end-to-end: two simulated POS devices (the real index.html + all scripts in jsdom) talking
// to the real Netlify functions and a real Postgres/PostgREST. Same env vars as v47-server.test.mjs.
//   npm i jsdom (outside the repo) and set NODE_PATH, then:
//   V47_SUPABASE_URL=… V47_SERVICE_KEY=… node --test tests/v47-devices.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.V47_SUPABASE_URL, KEY = process.env.V47_SERVICE_KEY;
let JSDOM = null;
try { ({ JSDOM } = createRequire(import.meta.url)('jsdom')); } catch (_) {}
const skip = !URL_ || !KEY || !JSDOM;
const STORE = 'v47devices';
const OPEN = [];
test.after(() => { OPEN.forEach(w => { try { w.close(); } catch (_) {} }); });
Object.assign(process.env, { SUPABASE_URL: URL_ || '', SUPABASE_SECRET_KEY: KEY || '', HATTAN_SESSION_SECRET: 's'.repeat(40), HATTAN_STORE_ID: STORE, HATTAN_MODE: 'live', CONTEXT: 'dev' });

const rest = (p, opt = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...opt, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(opt.headers || {}) } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now(); const log = (...a) => { if (process.env.V47_DEBUG) console.log(((Date.now() - T0) / 1000).toFixed(1), ...a); };

async function device(name, { online = () => true } = {}) {
  const { createSession } = await import(`${ROOT}/netlify/functions/lib/shared.mjs`);
  const cookie = `hattan_session=${createSession({ id: 'mgr1', display_name: 'Matt R', manager: true, store_id: STORE })}`;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script src="https?:[^"]*"><\/script>/g, '');
  const calls = [];
  const dom = new JSDOM(html, {
    url: 'https://pos.test/', runScripts: 'dangerously', resources: new (class extends (createRequire(import.meta.url)('jsdom').ResourceLoader) {
      fetch(url) {
        const u = new URL(url);
        if (u.host !== 'pos.test') return Promise.resolve(Buffer.from(''));
        return Promise.resolve(fs.readFileSync(path.join(ROOT, decodeURIComponent(u.pathname))));
      }
    })(), pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = () => {}; w.console.warn = () => {};
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = async (url, opts = {}) => {
        const u = new URL(url, 'https://pos.test/');
        const m = /^\/\.netlify\/functions\/([\w-]+)$/.exec(u.pathname);
        if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        if (!online()) throw new TypeError('Failed to fetch');
        calls.push(`${opts.method || 'GET'} ${m[1]}${u.search}`);
        const mod = await import(`${ROOT}/netlify/functions/${m[1]}.mjs`);
        const r = await (mod.handler || mod.default)({ httpMethod: opts.method || 'GET', headers: { cookie, host: 'pos.test', origin: 'https://pos.test' }, queryStringParameters: Object.fromEntries(u.searchParams), body: opts.body || '' });
        const body = r.body || '';
        return { ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, json: async () => JSON.parse(body), text: async () => body };
      };
    },
  });
  const w = dom.window;
  OPEN.push(w);
  for (let i = 0; i < 300 && !(w.HATTAN_V47 && w.HATTAN_V47.loaded); i++) await sleep(50);
  assert.ok(w.HATTAN_V47?.loaded, `${name} finished loading`);
  const run = code => w.eval(code);
  return { w, run, calls, name, close: () => w.close() };
}
// Write a ticket the way the counter does (state.nextTicket++, HC-<ticket>, unshift, saveState).
const writeTicket = (d, customerId, extra = {}) => d.run(`(() => { const t = state.nextTicket++; const o = { id: 'HC-' + t, ticket: String(t), customerId: ${JSON.stringify(customerId)}, status: 'dropped_off', paid: false, total: 20, createdAt: new Date().toISOString(), lineItems: [{ name: 'Shirt', qty: 1 }], ...${JSON.stringify(extra)} }; state.orders.unshift(o); saveState(); return o.id; })()`);
const flush = d => d.run('v16PushState()');
const pull = d => d.run('v16PullState(false)');

test('V47 two devices: unique ticket numbers, no lost edits, big shop, offline', { skip, timeout: 240000 }, async () => {
  for (const t of ['pos_records', 'pos_state', 'pos_counters', 'pos_state_archive', 'staff_accounts']) await rest(`${t}?store_id=eq.${STORE}`, { method: 'DELETE' });
  const { hashPin } = await import(`${ROOT}/netlify/functions/lib/shared.mjs`);
  const h = hashPin('1234');
  await rest('staff_accounts', { method: 'POST', body: JSON.stringify({ id: 'mgr1', store_id: STORE, display_name: 'Matt R', initials: 'MR', manager: true, pin_hash: h.hash, pin_salt: h.salt, pin_iterations: h.iterations }) });
  // A big existing shop in the OLD single-value format: 6,000 customers, 12,000 tickets (10 MB+).
  const customers = Array.from({ length: 6000 }, (_, i) => ({ id: `cust_${i}`, customerNumber: `C-${10001 + i}`, name: `Customer ${i}`, phone: `212555${String(i).padStart(4, '0')}`, email: '', points: 0, storeCredit: 0, addresses: [], paymentMethods: [], notes: 'x'.repeat(200) }));
  const old = Date.now() - 400 * 864e5;
  const orders = Array.from({ length: 12000 }, (_, i) => ({ id: `HC-${700000 + i}`, ticket: String(700000 + i), customerId: `cust_${i % 6000}`, status: i < 11500 ? 'picked_up' : 'ready', paid: i < 11500, total: 25, createdAt: new Date(old + i * 36e5).toISOString(), lineItems: [{ name: 'Suit', qty: 1, unitPrice: 25 }], activity: [{ type: 'created', label: 'Ticket created', at: new Date(old).toISOString() }], notes: 'y'.repeat(300) }));
  const payload = { orders, customers, nextTicket: 712000, nextCustomerNumber: 16001, rackSettings: { slots: 200 }, staff: [{ id: 'mgr1', name: 'Matt R', manager: true, payRate: 30 }] };
  assert.ok(JSON.stringify(payload).length > 6_500_000, 'test shop is bigger than the old limit');
  await rest('pos_state', { method: 'POST', body: JSON.stringify({ store_id: STORE, version: 9, payload }) });
  // Old tickets look "finished long ago" to the database.
  await rest(`pos_records?store_id=eq.${STORE}`, { method: 'DELETE' });

  const A = await device('A');
  await flush(A); // the first device tidies every record once (fills in standard empty fields)
  assert.equal(A.run('HATTAN_V47._test.changedRecords().length'), 0, 'A is fully saved');
  await rest(`pos_records?store_id=eq.${STORE}&kind=eq.order&id=lt.HC-711500`, { method: 'PATCH', body: JSON.stringify({ updated_at: new Date(old).toISOString() }) });
  const B = await device('B');
  const loadedB = B.run('state.orders.length'), custB = B.run('state.customers.length');
  assert.equal(B.run('HATTAN_V47._test.changedRecords().length'), 0, 'a second device has nothing to re-save after loading (no back-and-forth)');
  assert.equal(custB, 6000, `every customer loads (${custB}, A has ${A.run('state.customers.length')})`);
  assert.ok(loadedB >= 500 && loadedB < 12000, `only open + recent tickets load (${loadedB})`);
  assert.ok(B.calls.filter(c => c.includes('mode=initial')).length > 5, 'first load is paged');
  assert.equal(B.run('state.staff.find(s => s.id === "mgr1").payRate'), 30, 'settings survive');

  // Both devices write tickets at the same moment → never the same number.
  const idsA = [], idsB = [];
  for (let i = 0; i < 12; i++) { idsA.push(writeTicket(A, 'cust_1')); idsB.push(writeTicket(B, 'cust_2')); }
  await Promise.all([flush(A), flush(B)]);
  const all = [...idsA, ...idsB];
  assert.equal(new Set(all).size, all.length, 'no duplicate ticket numbers');
  assert.ok(all.every(id => Number(id.slice(3)) >= 712000), `numbers continue after the old counter: ${all.join(' ')}`);
  await pull(A); await pull(B);
  for (const id of all) { assert.ok(A.run(`!!state.orders.find(o => o.id === ${JSON.stringify(id)})`), `A sees ${id}`); assert.ok(B.run(`!!state.orders.find(o => o.id === ${JSON.stringify(id)})`), `B sees ${id}`); }

  // Same ticket edited on both devices at once (different fields) → both edits kept.
  const t = idsA[0];
  A.run(`(() => { const o = state.orders.find(o => o.id === '${t}'); o.status = 'ready'; o.rack = 'R12'; saveState(); })()`);
  B.run(`(() => { const o = state.orders.find(o => o.id === '${t}'); o.notes = 'button missing'; saveState(); })()`);
  await Promise.all([flush(A), flush(B)]);
  await pull(A); await pull(B); await flush(A); await flush(B); await pull(A); await pull(B);
  for (const d of [A, B]) {
    const o = d.run(`JSON.stringify(state.orders.find(o => o.id === '${t}'))`);
    const p = JSON.parse(o);
    assert.equal(p.status, 'ready', `${d.name} kept A's status`); assert.equal(p.rack, 'R12'); assert.equal(p.notes, 'button missing', `${d.name} kept B's note`);
  }

  // Offline: device C keeps writing tickets from its reserved block, then catches up.
  let net = true;
  const C = await device('C', { online: () => net });
  net = false;
  const idsC = []; for (let i = 0; i < 8; i++) idsC.push(writeTicket(C, 'cust_3'));
  const idsA2 = []; for (let i = 0; i < 8; i++) idsA2.push(writeTicket(A, 'cust_4'));
  await flush(A);
  await C.run('v16PushState()').catch(() => {});
  assert.equal(C.run('v16Live.syncStatus'), 'offline');
  net = true;
  await flush(C); await pull(A);
  assert.equal(new Set([...idsC, ...idsA2]).size, 16, 'offline tickets kept unique numbers');
  for (const id of idsC) assert.ok(A.run(`!!state.orders.find(o => o.id === '${id}')`), `A received offline ticket ${id}`);

  // Old history loads when a profile opens.
  const before = B.run(`state.orders.filter(o => o.customerId === 'cust_5').length`);
  await B.run(`HATTAN_V47.loadCustomerHistory('cust_5')`);
  const after = B.run(`state.orders.filter(o => o.customerId === 'cust_5').length`);
  assert.ok(after > before, `older tickets for a customer load on demand (${before} → ${after})`);
  // Devices fill in standard empty fields on tickets they receive; after one round nothing is left
  // to save anywhere (no endless back-and-forth).
  for (let i = 0; i < 2; i++) for (const d of [A, B, C]) { await pull(d); await flush(d); }
  for (const d of [A, B, C]) assert.equal(d.run('HATTAN_V47._test.changedRecords().length'), 0, `${d.name} settles with nothing left to save`);
  assert.equal(B.run(`state.orders.filter(o => o.customerId === 'cust_5').length`), 2, 'history tickets stay loaded');
  assert.equal(after, 2);

  // A save sends only what changed.
  A.calls.length = 0;
  A.run(`(() => { const o = state.orders.find(o => o.id === '${idsA2[0]}'); o.status = 'ready'; saveState(); })()`);
  await flush(A);
  const put = A.calls.filter(c => c.startsWith('PUT state-sync'));
  assert.equal(put.length, 1, 'one small save');
  const row = await (await rest(`pos_records?store_id=eq.${STORE}&id=eq.${idsA2[0]}&select=data`, { headers: { Prefer: '' } })).json();
  assert.equal(row[0].data.status, 'ready');
  const st = await (await rest(`pos_state?store_id=eq.${STORE}&select=payload`, { headers: { Prefer: '' } })).json();
  assert.ok(JSON.stringify(st[0].payload).length < 50_000, 'settings value stays small');
  assert.equal(st[0].payload.orders, undefined);
  [A, B, C].forEach(d => d.close());
});
