// POST /.netlify/functions/app-pay — a customer pays open tickets with their saved card.
// The amount is always worked out here from the shop's data, never taken from the phone.
import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, randomId, safePaymentResponse, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';
import { baseDue, cardFee, mutateStore, readStore, requireAccount, vaultCard } from './lib/app.mjs';

const sid = () => encodeURIComponent(storeId());

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const account = await requireAccount(event);
    if (!account.customer_id) throw new HttpError(409, 'Finish setting up your account first');
    const body = parseBody(event);
    const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 20);
    if (!ids.length) throw new HttpError(400, 'Choose what to pay');
    const attempt = String(body.attemptId || randomId()).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);

    const { payload: store } = await readStore();
    const customer = (store.customers || []).find(c => String(c.id) === String(account.customer_id));
    if (!customer) throw new HttpError(409, 'Your account is not ready yet');
    const vault = await vaultCard(customer.id);
    if (!vault?.clover_customer_id) throw new HttpError(409, 'Add a card first');

    const results = [];
    for (const orderId of ids.slice(0, 5)) {
      const o = (store.orders || []).find(x => String(x.id) === orderId);
      if (!o || String(o.customerId) !== String(customer.id)) { results.push({ orderId, ok: false, error: 'Ticket not found' }); continue; }
      if (o.paid || o.paymentStatus === 'paid') { results.push({ orderId, ok: true, already: true }); continue; }
      if (o.legacy || o.status === 'voided' || !(Number(o.total) > 0)) { results.push({ orderId, ok: false, error: 'Please pay this one at the counter' }); continue; }
      const base = baseDue(o), fee = cardFee(o), amount = Math.round((base + fee) * 100);
      if (amount < 1) { results.push({ orderId, ok: true, already: true }); continue; }
      const prior = await selectRows('payment_transactions', `store_id=eq.${sid()}&order_id=eq.${encodeURIComponent(orderId)}&type=eq.charge`, 'status');
      const active = (prior || []).find(t => ['succeeded', 'processing', 'unknown'].includes(t.status));
      if (active) { results.push({ orderId, ok: active.status === 'succeeded', already: true, error: active.status === 'succeeded' ? undefined : 'A payment for this ticket is being checked. Please don\'t pay again — call us if it doesn\'t clear.' }); continue; }
      // One key per ticket + amount (+ number of earlier declines), so a double tap or a
      // retry after a lost response reuses Clover's result instead of charging twice.
      const failedBefore = (prior || []).filter(t => t.status === 'failed').length;
      const key = `app-${orderId}-${amount}-${failedBefore}`.slice(0, 100);
      try {
        await insertRows('payment_transactions', [{ store_id: storeId(), order_id: orderId, customer_id: customer.id, type: 'charge', processor: 'clover', idempotency_key: key, amount_cents: amount, currency: 'usd', status: 'processing', initiated_by: `app:${account.id}` }], 'return=minimal');
      } catch (_) { results.push({ orderId, ok: false, already: true, error: 'This ticket is already being paid' }); continue; }
      let charged = null;
      try {
        const charge = await cloverRequest('/v1/charges', {
          method: 'POST', headers: { 'idempotency-key': key },
          body: JSON.stringify({
            amount, currency: 'usd', source: vault.clover_customer_id,
            description: `Hattan ticket ${String(o.ticket || orderId).slice(0, 40)} (app)`,
            external_reference_id: String(o.ticket || orderId).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 12) || undefined,
            receipt_email: account.email, ecomind: 'ecom',
          }),
        }, event);
        const safe = safePaymentResponse(charge);
        if (!safe.paid) { const e = new HttpError(402, `Card was ${safe.status || 'not charged'}`); e.definite = true; throw e; }
        await updateRows('payment_transactions', `store_id=eq.${sid()}&idempotency_key=eq.${encodeURIComponent(key)}`, { processor_id: safe.id, status: 'succeeded', brand: safe.brand || vault.brand, last4: safe.last4 || vault.last4, error_message: null });
        charged = { orderId, ok: true, amount: amount / 100, chargeId: safe.id, last4: safe.last4 || vault.last4, fee };
      } catch (e) {
        // Only a clear decline counts as failed. Anything else (Clover down, timeout) might
        // have charged the card, so it stays blocked until staff check Clover.
        const ps = Number(e?.details?.processorStatus || 0);
        const definite = e.definite || (ps >= 400 && ps < 500 && ps !== 401 && ps !== 408 && ps !== 429);
        await updateRows('payment_transactions', `store_id=eq.${sid()}&idempotency_key=eq.${encodeURIComponent(key)}`, { status: definite ? 'failed' : 'unknown', error_message: String(e.message || 'Charge failed').slice(0, 500) });
        results.push({ orderId, ok: false, error: definite ? (e.message || 'The card was declined') : 'We couldn\'t confirm this payment with the card company. Please don\'t pay again — we\'ll check and let you know.' });
        continue;
      }
      results.push(charged);
      // Mark the ticket paid in the shop's data right away (POS sees it instantly). If the
      // ticket changed at the counter meanwhile, flag it for staff instead.
      try {
        await mutateStore(s => {
          const cur = (s.orders || []).find(x => String(x.id) === orderId);
          if (!cur) return;
          const nowDue = Math.round((baseDue(cur) + cardFee(cur)) * 100);
          if (cur.paid || nowDue !== amount) {
            cur.paymentReview = { at: new Date().toISOString(), via: 'customer-app', chargeId: charged.chargeId, amount: charged.amount, note: cur.paid ? 'Ticket was already marked paid when the app payment went through — check for a double payment' : `Ticket total changed during app payment (charged ${charged.amount}, now due ${nowDue / 100})` };
            return;
          }
          Object.assign(cur, {
            cloverChargeId: charged.chargeId, paymentProcessor: 'clover', paymentStatus: 'paid', surcharge: fee,
            amountCharged: charged.amount, amountPaid: charged.amount, paymentMethod: `Clover card on file •${charged.last4 || ''} (app)`,
            paid: true, paidAt: new Date().toISOString(), paidVia: 'customer-app',
          });
          delete cur.paymentError;
          const c = (s.customers || []).find(x => String(x.id) === String(customer.id));
          if (c && !cur.pointsAwarded) {
            const pts = Math.max(0, Math.round(Number(cur.total || 0) - Number(cur.discount || 0)));
            c.points = Math.round(Number(c.points || 0)) + pts; cur.pointsAwarded = true; cur._lastPtsEarned = pts;
          }
        });
      } catch (e) { console.error('app-pay store update (charge recorded in payment_transactions)', e.message); }
    }
    const failed = results.filter(r => !r.ok);
    return json(failed.length && !results.some(r => r.ok) ? 402 : 200, { ok: !failed.length, results, error: failed[0]?.error });
  } catch (error) { return handleError(error); }
};
