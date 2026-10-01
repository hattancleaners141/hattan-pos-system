// POST /.netlify/functions/sms-notify — send one automatic text (or a batch of a store notice).
// The browser only says WHAT happened (kind + customer + tickets). The server re-reads the
// shared store data, checks consent/opt-out, checks the ticket really is in that state, writes
// the message itself, and refuses duplicates.
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, HttpError } from './lib/shared.mjs';
import { KINDS, ascii, compose, deliver, e164, loadStore, logInsert, receiptUrl, siteUrl, smsMode, smsSettings, baseDue, testNumbers, twilioConfigured, twilioSend } from './lib/sms.mjs';

const nyDay = (d = Date.now()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const inList = ids => `(${ids.map(i => `"${String(i).replace(/"/g, '')}"`).join(',')})`;

async function alreadySent(keys) {
  if (!keys.length) return new Set();
  const rows = await selectRows('sms_log', `store_id=eq.${encodeURIComponent(storeId())}&dedupe_key=in.${encodeURIComponent(inList(keys))}`, 'dedupe_key');
  return new Set((rows || []).map(r => r.dedupe_key));
}
async function txFor(orderIds, status) {
  const rows = await selectRows('payment_transactions',
    `store_id=eq.${encodeURIComponent(storeId())}&order_id=in.${encodeURIComponent(inList(orderIds))}&type=eq.charge&status=eq.${status}&order=created_at.desc`,
    'order_id,amount_cents,last4,brand,processor_id,created_at');
  return rows || [];
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const body = parseBody(event);
    const kind = String(body.kind || '');
    // ---- manager test text: straight to Twilio, returns Twilio's own error so setup problems are visible ----
    if (kind === 'test') {
      const session = requireSession(event, true);
      const mode = smsMode();
      if (mode === 'off') throw new HttpError(409, 'SMS_MODE is off in Netlify — set it to test (or live) and redeploy');
      if (!twilioConfigured()) throw new HttpError(409, 'Twilio settings are missing in Netlify (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID) — add them and redeploy');
      const to = e164(body.phone);
      if (!to) throw new HttpError(400, 'Enter a 10-digit US mobile number');
      if (mode === 'test' && !testNumbers().includes(to)) throw new HttpError(409, `SMS_MODE is test and ${to} is not in SMS_TEST_NUMBERS — add it in Netlify and redeploy`);
      const msg = compose('test', {});
      const sent = await twilioSend(to, msg, event);
      try { await logInsert({ direction: 'out', kind: 'test', to_phone: to, body: msg, status: sent.ok ? (sent.status || 'queued') : 'failed', twilio_sid: sent.sid || null, error_message: sent.ok ? null : String(sent.error || '').slice(0, 300), sent_by: session.sub, dedupe_key: `test:${Date.now()}` }); } catch (_) {}
      if (!sent.ok) return json(200, { ok: false, error: `Twilio said: ${sent.error}${sent.code ? ` (code ${sent.code})` : ''}`, code: sent.code });
      return json(200, { ok: true, sent: true, sid: sent.sid, status: sent.status, to: to.slice(-4) });
    }
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Unknown text type');
    const session = requireSession(event, kind === 'notice');
    if (smsMode() === 'off') return json(200, { ok: true, skipped: 'Texting is off (SMS_MODE)' });

    const store = await loadStore();
    const settings = smsSettings(store);
    if (kind in settings.enabled && !settings.enabled[kind]) return json(200, { ok: true, skipped: 'This automatic text is switched off' });
    const customers = store.customers || [];
    const byId = id => customers.find(c => String(c?.id) === String(id));
    const base = siteUrl(event);

    // ---- store notice: manager-written text to a batch of opted-in customers ----
    if (kind === 'notice') {
      const text = ascii(body.text);
      if (text.length < 5) throw new HttpError(400, 'Write the notice first');
      if (text.length > 280) throw new HttpError(400, 'Keep the notice under 280 characters');
      const noticeId = String(body.noticeId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      if (!noticeId) throw new HttpError(400, 'Notice id is required');
      const ids = (Array.isArray(body.customerIds) ? body.customerIds : []).slice(0, 25);
      const msg = compose('notice', { text });
      const results = [];
      for (const id of ids) {
        const c = byId(id);
        if (!c) { results.push({ customerId: id, ok: true, skipped: 'Customer not found' }); continue; }
        try { results.push({ customerId: id, ...(await deliver({ keys: [`notice:${noticeId}:${c.id}`], kind, customer: c, body: msg, sentBy: session.sub, event })) }); }
        catch (e) { results.push({ customerId: id, ok: false, error: e.message }); }
      }
      return json(200, { ok: true, results });
    }

    const customer = byId(body.customerId);
    if (!customer) throw new HttpError(409, 'That customer is not in the latest shared store data yet');

    if (kind === 'optin') {
      const phone = e164(customer.smsConsent?.phone || customer.phone);
      if (!customer.smsConsent?.on || !phone) return json(200, { ok: true, skipped: 'No text consent on file' });
      const r = await deliver({ keys: [`optin:${customer.id}:${phone}`], kind, customer, body: compose('optin', {}), sentBy: session.sub, event });
      return json(200, r);
    }

    if (kind === 'cardSaved') {
      const rows = await selectRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customer.id)}&active=eq.true&limit=1`, 'brand,last4');
      const card = rows?.[0];
      if (!card?.last4) return json(200, { ok: true, skipped: 'No saved card found' });
      const r = await deliver({ keys: [`cardSaved:${customer.id}:${card.last4}`], kind, customer, body: compose('cardSaved', { customer, card }), sentBy: session.sub, event });
      return json(200, r);
    }

    // ---- ticket-based texts ----
    const wanted = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 20);
    if (!wanted.length) throw new HttpError(400, 'Which ticket?');
    let orders = wanted.map(id => (store.orders || []).find(o => String(o?.id) === id)).filter(Boolean)
      .filter(o => String(o.customerId || '') === String(customer.id) && !o.legacy && String(o.status || '') !== 'voided');
    const statusOk = {
      dropoff: () => true,
      ready: o => o.status === 'ready',
      pickup: o => o.status === 'picked_up',
      delivered: o => o.status === 'delivered',
      charged: () => true,
      declined: o => !o.paid && o.paymentStatus !== 'paid',
    }[kind];
    if (!statusOk) throw new HttpError(400, 'That text type is sent automatically by the server');
    orders = orders.filter(statusOk);
    const keyOf = o => kind === 'declined' ? `declined:${o.id}:${nyDay()}` : `${kind}:${o.id}`;
    const done = await alreadySent(orders.map(keyOf));
    orders = orders.filter(o => !done.has(keyOf(o)));
    if (!orders.length) return json(200, { ok: true, skipped: 'Already sent or ticket not in that state' });

    const ctx = { customer, orders, links: [] };
    const keys = orders.map(keyOf);

    if (kind === 'charged' || kind === 'dropoff') {
      const paid = await txFor(orders.map(o => o.id), 'succeeded');
      if (kind === 'charged') {
        orders = orders.filter(o => paid.some(t => t.order_id === o.id));
        const chargedDone = await alreadySent(orders.map(o => `charged:${o.id}`));
        orders = orders.filter(o => !chargedDone.has(`charged:${o.id}`));
        if (!orders.length) return json(200, { ok: true, skipped: 'No successful card charge to report' });
        ctx.orders = orders; keys.length = 0; keys.push(...orders.map(o => `charged:${o.id}`));
        const t = orders.map(o => paid.find(x => x.order_id === o.id));
        ctx.charge = { amount: t.reduce((s, x) => s + Number(x.amount_cents || 0), 0) / 100, last4: t[0]?.last4 || '' };
      } else {
        // include a drop-off card charge in the thank-you text so the customer gets one text
        const ch = orders.map(o => paid.find(t => t.order_id === o.id)).filter(Boolean);
        const chargedDone = await alreadySent(ch.map(t => `charged:${t.order_id}`));
        const fresh = ch.filter(t => !chargedDone.has(`charged:${t.order_id}`));
        if (fresh.length) {
          ctx.charge = { amount: fresh.reduce((s, t) => s + Number(t.amount_cents || 0), 0) / 100, last4: fresh[0].last4 || '' };
          keys.push(...fresh.map(t => `charged:${t.order_id}`));
        }
      }
    }
    if (kind === 'declined') {
      const failed = await txFor(orders.map(o => o.id), 'failed');
      const t = failed[0];
      const vault = await selectRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customer.id)}&active=eq.true&limit=1`, 'last4');
      ctx.charge = { amount: t ? Number(t.amount_cents || 0) / 100 : orders.reduce((s, o) => s + baseDue(o), 0), last4: t?.last4 || vault?.[0]?.last4 || '' };
    }
    if (kind !== 'declined') ctx.links = orders.length === 1 ? [receiptUrl(base, orders[0].id)] : [];

    const r = await deliver({ keys, kind, customer, orderIds: orders.map(o => o.id), body: compose(kind, ctx), sentBy: session.sub, event });
    return json(200, r);
  } catch (error) { return handleError(error); }
};
