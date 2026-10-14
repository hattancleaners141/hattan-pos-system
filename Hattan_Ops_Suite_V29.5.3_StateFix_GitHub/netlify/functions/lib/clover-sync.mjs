// Keeps the POS in step with what happens on the Clover side (V41).
// When a card charge made by the POS is VOIDED or REFUNDED in the Clover app / Clover machine,
// this finds it, records it on the ticket(s), alerts the shop and texts the customer.
//
// Runs on a schedule (clover-reconcile, every 15 minutes: charges from the last 3 days; once a night:
// the last 60 days) and on demand (clover-sync, manager button on the Payments screen).
import { cloverRequest, env, insertRows, selectRows, storeId, updateRows } from './shared.mjs';
import { mutateStore } from './app.mjs';
import { staffAlert } from './alerts.mjs';
import { compose, deliver, smsSettings } from './sms.mjs';
import { deviceApi, deviceConfig, deviceConfigured, readAuth, validAuth } from './clover-device.mjs';

const sid = () => encodeURIComponent(storeId());
const VOID_WORDS = ['voided', 'void', 'canceled', 'cancelled', 'reversed'];
const usd = c => '$' + (Number(c || 0) / 100).toFixed(2);

// What Clover says now about one charge: { found, voided, refundedCents, raw }
export async function cloverChargeState(row) {
  const id = String(row.processor_id || '');
  if (!id) return { found: false };
  // Clover Flex payments (and any charge the merchant API can see): v3 payment, result VOIDED + refunds.
  const tryV3 = async () => {
    if (!deviceConfigured()) return null;
    const a = await readAuth().catch(() => null);
    if (!a) return null;
    const ecomEnv = env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    if (row.processor !== 'clover-flex' && deviceConfig().environment !== ecomEnv) return null;
    const auth = await validAuth();
    const p = await deviceApi(auth, `/payments/${encodeURIComponent(id)}?expand=refunds`).catch(e => (String(e.message).includes('404') ? { __missing: true } : Promise.reject(e)));
    if (!p || p.__missing) return null;
    const refunds = (p.refunds?.elements || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const result = String(p.result || '').toUpperCase();
    return { found: true, voided: result === 'VOIDED' || result === 'VOIDING', refundedCents: refunds, raw: { source: 'v3', result, amount: p.amount, refunds } };
  };
  if (row.processor === 'clover-flex') return (await tryV3()) || { found: false };
  // Online (card-on-file / counter card) charges: Ecommerce API.
  let c;
  try { c = await cloverRequest(`/v1/charges/${encodeURIComponent(id)}`); }
  catch (e) { if (Number(e?.details?.processorStatus) === 404) return (await tryV3().catch(() => null)) || { found: false }; throw e; }
  const status = String(c?.status || '').toLowerCase();
  const refundList = Array.isArray(c?.refunds?.data) ? c.refunds.data : [];
  const refundedCents = Math.max(Number(c?.amount_refunded || 0), refundList.reduce((s, r) => s + (String(r.status || 'succeeded').toLowerCase() === 'failed' ? 0 : Number(r.amount || 0)), 0));
  const voided = VOID_WORDS.includes(status) || c?.voided === true || c?.void === true;
  const out = { found: true, voided, refundedCents, raw: { source: 'ecomm', status, amount: c?.amount, amount_refunded: c?.amount_refunded, refunded: c?.refunded, captured: c?.captured, refunds: refundList.length } };
  // If the ecommerce view shows nothing unusual, the merchant API may still know about a void.
  if (!voided && !refundedCents) { const v3 = await tryV3().catch(() => null); if (v3 && (v3.voided || v3.refundedCents)) return v3; }
  return out;
}

async function recordedRefundCents(chargeId) {
  const rows = await selectRows('payment_transactions', `store_id=eq.${sid()}&type=eq.refund&status=eq.succeeded&parent_processor_id=eq.${encodeURIComponent(chargeId)}`, 'order_id,amount_cents');
  return (rows || []).reduce((s, r) => s + Number(r.amount_cents || 0), 0);
}

// Apply a detected void / refund to the POS records. Safe to call again — it only acts on the difference.
async function applyChange(chargeRows, state, event) {
  const chargeId = chargeRows[0].processor_id;
  const totalCents = chargeRows.reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  const already = await recordedRefundCents(chargeId);
  const kind = state.voided ? 'void' : 'refund';
  const targetCents = state.voided ? totalCents : Math.min(totalCents, state.refundedCents);
  const delta = targetCents - already;
  if (delta <= 0 && !state.voided) return null;
  const at = new Date().toISOString();
  // Split the amount across the tickets this one charge paid for.
  let left = Math.max(0, delta);
  const parts = chargeRows.map(r => { const c = Math.min(left, Number(r.amount_cents || 0)); left -= c; return { row: r, cents: c }; }).filter(p => p.cents > 0 || state.voided);
  for (const p of parts) {
    if (p.cents > 0) {
      try {
        await insertRows('payment_transactions', [{ store_id: storeId(), order_id: p.row.order_id, customer_id: p.row.customer_id, type: 'refund', processor: p.row.processor, parent_processor_id: chargeId, idempotency_key: `clover-sync:${kind}:${chargeId}:${p.row.order_id}:${already + p.cents}`, amount_cents: p.cents, currency: 'usd', status: 'succeeded', brand: p.row.brand, last4: p.row.last4, initiated_by: 'clover-sync', error_message: kind === 'void' ? 'Voided in Clover' : 'Refunded in Clover' }], 'return=minimal');
      } catch (e) { if (!/duplicate|unique|409/i.test(String(e.message))) throw e; }
    }
  }
  if (state.voided || targetCents >= totalCents) {
    await updateRows('payment_transactions', `store_id=eq.${sid()}&type=eq.charge&processor_id=eq.${encodeURIComponent(chargeId)}`, { status: state.voided ? 'voided' : 'refunded', error_message: state.voided ? 'Voided in Clover' : 'Fully refunded in Clover' });
  }
  // Ticket(s) in the shared store.
  const changed = [];
  let customer = null;
  await mutateStore(s => {
    changed.length = 0; customer = null; // the save may retry after a conflict
    for (const p of parts) {
      const o = (s.orders || []).find(x => String(x.id) === String(p.row.order_id));
      if (!o) continue;
      o.activity = Array.isArray(o.activity) ? o.activity : [];
      if (state.voided) {
        if (o.paymentVoidedAt) continue;
        o.paid = false; o.paymentStatus = 'unpaid'; o.amountCharged = 0; o.paidAt = null;
        o.paymentVoidedAt = at; o.paymentVoidedChargeId = chargeId;
        o.activity.unshift({ id: 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'payment_void', label: `Card payment ${usd(p.row.amount_cents)} voided in Clover — balance is due again`, at, by: 'Clover' });
      } else {
        o.refunds = Array.isArray(o.refunds) ? o.refunds : [];
        if (o.refunds.some(r => r.cloverSyncKey === `${chargeId}:${already + p.cents}`)) continue;
        o.refunds.unshift({ id: 'refund_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amount: p.cents / 100, method: 'original', methodLabel: 'Original card', reason: 'Refunded in Clover', at, by: 'Clover', processorStatus: 'completed', cloverSyncKey: `${chargeId}:${already + p.cents}` });
        o.refundedAt = at;
        const refunded = o.refunds.reduce((a, r) => a + Number(r.amount || 0), 0);
        o.paymentStatus = refunded + 0.004 >= Number(o.amountCharged || o.total || 0) ? 'refunded' : 'partially_refunded';
        o.activity.unshift({ id: 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'refund', label: `Refund ${usd(p.cents)} to original card (done in Clover)`, at, by: 'Clover' });
      }
      o.activity = o.activity.slice(0, 80);
      changed.push({ ...o });
      if (!customer) customer = (s.customers || []).find(c => String(c.id) === String(o.customerId)) || null;
    }
    if (!changed.length) return { __noWrite: true, value: null };
    return null;
  });
  if (!changed.length && !(delta > 0)) return null;
  const cents = state.voided ? totalCents : delta;
  const tickets = (changed.length ? changed : parts.map(p => ({ id: p.row.order_id, ticket: String(p.row.order_id).replace(/^HC-/, '') })));
  const label = tickets.map(o => '#' + (o.ticket || o.id)).join(', ');
  try {
    await staffAlert({ type: 'clover', title: state.voided ? `Card payment voided in Clover — ${label}` : `Refund in Clover — ${label}`, text: `${usd(cents)} on card ending ${chargeRows[0].last4 || '----'}. ${state.voided ? 'The ticket is unpaid again.' : 'Recorded on the ticket.'}`, customerId: customer?.id || chargeRows[0].customer_id || '', customerName: customer?.name || '', orderIds: tickets.map(o => o.id) });
  } catch (_) {}
  // Customer text (only if they opted in and the text type is on).
  try {
    if (customer) {
      const enabled = await textEnabled();
      if (enabled) await deliver({ keys: [`reversed:${chargeId}:${kind}:${already + Math.max(0, delta)}`], kind: 'reversed', customer, orderIds: tickets.map(o => o.id), body: compose('reversed', { customer, orders: tickets, charge: { amount: cents / 100, last4: chargeRows[0].last4 || '' }, voided: state.voided }), sentBy: 'clover-sync', event });
    }
  } catch (e) { console.error('reversed text', e.message); }
  return { chargeId, kind, cents, tickets: tickets.map(o => o.id) };
}
async function textEnabled() {
  try { const rows = await selectRows('pos_state', `store_id=eq.${sid()}&limit=1`, 'payload'); return smsSettings(rows?.[0]?.payload || {}).enabled.reversed !== false; } catch (_) { return true; }
}

export async function runCloverSync({ days = 3, limit = 400, event = null } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await selectRows('payment_transactions', `store_id=eq.${sid()}&type=eq.charge&status=eq.succeeded&processor=in.(clover,clover-flex)&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${limit}`, '*') || [];
  const byCharge = new Map();
  for (const r of rows) { if (!r.processor_id) continue; if (!byCharge.has(r.processor_id)) byCharge.set(r.processor_id, []); byCharge.get(r.processor_id).push(r); }
  const result = { checked: 0, changes: [], errors: 0 };
  const list = [...byCharge.values()];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async group => {
      try {
        const st = await cloverChargeState(group[0]);
        result.checked++;
        if (!st.found || (!st.voided && !st.refundedCents)) return;
        const ch = await applyChange(group, st, event);
        if (ch) result.changes.push(ch);
      } catch (e) { result.errors++; console.error('clover-sync', group[0].processor_id, e.message); }
    }));
  }
  return result;
}

// Detailed run for the cron + manager button: { checked, changed, results:[{chargeId, orders, state, refundedCents, error}] }
export async function syncCloverReversals({ days = 3, chargeId = '', limit = 400, event = null } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const filt = chargeId ? `&processor_id=eq.${encodeURIComponent(chargeId)}` : `&created_at=gte.${encodeURIComponent(since)}`;
  const rows = await selectRows('payment_transactions', `store_id=eq.${sid()}&type=eq.charge&status=eq.succeeded&processor=in.(clover,clover-flex)${filt}&order=created_at.desc&limit=${limit}`, '*') || [];
  const byCharge = new Map();
  for (const r of rows) { if (!r.processor_id) continue; if (!byCharge.has(r.processor_id)) byCharge.set(r.processor_id, []); byCharge.get(r.processor_id).push(r); }
  const out = { checked: 0, changed: 0, results: [] };
  const list = [...byCharge.values()];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async group => {
      const res = { chargeId: group[0].processor_id, orders: group.map(r => r.order_id), state: 'ok' };
      try {
        const st = await cloverChargeState(group[0]);
        out.checked++;
        res.state = !st.found ? 'not found on Clover' : st.voided ? 'voided' : st.refundedCents ? 'refunded' : 'ok';
        res.refundedCents = st.refundedCents || 0;
        if (chargeId) res.clover = st.raw || null;
        if (st.found && (st.voided || st.refundedCents)) { const ch = await applyChange(group, st, event); if (ch) { out.changed++; res.updated = true; } }
      } catch (e) { res.error = String(e.message || e).slice(0, 200); console.error('clover-sync', res.chargeId, e.message); }
      out.results.push(res);
    }));
  }
  return out;
}
