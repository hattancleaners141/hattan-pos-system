// POST /.netlify/functions/clover-charge-amount — manager charges a typed amount to a customer's
// Clover card on file (old A/R balances, tests, one-off charges). The POS then applies the payment
// to the customer's oldest unpaid tickets (same way a check payment is applied).
// Body: { customerId, amount (dollars), note?, idempotencyKey }
import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, randomId, requireSession, safePaymentResponse, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';

const MAX_CENTS = 200000; // $2,000 per charge

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const session = requireSession(event, true);
    const body = parseBody(event);
    const customerId = String(body.customerId || '').trim();
    const amount = Math.round(Number(body.amount || 0) * 100);
    const note = String(body.note || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 60);
    if (!customerId) throw new HttpError(400, 'Customer is required');
    if (!Number.isSafeInteger(amount) || amount < 50) throw new HttpError(400, 'Enter an amount of at least $0.50');
    if (amount > MAX_CENTS) throw new HttpError(400, 'For safety, one charge can be at most $2,000');
    const sid = encodeURIComponent(storeId());
    const idempotencyKey = `amt:${String(body.idempotencyKey || randomId()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`;
    const prior = (await selectRows('payment_transactions', `store_id=eq.${sid}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`, '*'))?.[0];
    if (prior?.status === 'succeeded') return json(200, { ok: true, alreadyProcessed: true, payment: { id: prior.processor_id, status: 'succeeded', paid: true, amount: Number(prior.amount_cents || 0), brand: prior.brand, last4: prior.last4 } });
    if (prior?.status === 'processing') throw new HttpError(409, 'This charge may still be processing. Check Clover before trying again.');
    const store = (await selectRows('pos_state', `store_id=eq.${sid}&limit=1`, 'payload'))?.[0]?.payload || {};
    const customer = (store.customers || []).find(c => String(c?.id) === customerId);
    if (!customer) throw new HttpError(409, 'This customer is not in the latest shared store data yet');
    const vault = (await selectRows('payment_vault', `store_id=eq.${sid}&customer_id=eq.${encodeURIComponent(customerId)}&active=eq.true&limit=1`, '*'))?.[0];
    if (!vault?.clover_customer_id) throw new HttpError(409, 'This customer does not have a live Clover card on file');
    if (!prior) await insertRows('payment_transactions', [{ store_id: storeId(), order_id: null, customer_id: customerId, type: 'charge', processor: 'clover', idempotency_key: idempotencyKey, amount_cents: amount, currency: 'usd', status: 'processing', initiated_by: session.sub, error_message: note ? `Note: ${note}` : null }], 'return=minimal');
    else await updateRows('payment_transactions', `store_id=eq.${sid}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, { status: 'processing', error_message: null });
    try {
      const charge = await cloverRequest('/v1/charges', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ amount, currency: 'usd', source: vault.clover_customer_id, description: `Hattan account payment${note ? ' - ' + note : ''}`.slice(0, 80), external_reference_id: String(customer.customerNumber || customerId).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || undefined, ecomind: 'moto' }),
      }, event);
      const safe = safePaymentResponse(charge);
      if (!safe.paid) throw new HttpError(402, `Clover returned ${safe.status || 'an incomplete payment'}`);
      await updateRows('payment_transactions', `store_id=eq.${sid}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, { processor_id: safe.id, status: 'succeeded', brand: safe.brand || vault.brand, last4: safe.last4 || vault.last4, error_message: note ? `Note: ${note}` : null, processor_created_at: safe.created ? new Date(Number(safe.created)).toISOString() : null });
      return json(200, { ok: true, payment: { ...safe, brand: safe.brand || vault.brand, last4: safe.last4 || vault.last4 } });
    } catch (error) {
      await updateRows('payment_transactions', `store_id=eq.${sid}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, { status: 'failed', error_message: String(error.message || 'Charge failed').slice(0, 500) });
      throw error;
    }
  } catch (error) { return handleError(error); }
};
