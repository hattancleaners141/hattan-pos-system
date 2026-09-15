import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, randomId, requireSession, safePaymentResponse, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const session = requireSession(event);
    const body = parseBody(event);
    const customerId = String(body.customerId || '').trim();
    const orderId = String(body.orderId || '').trim();
    const amount = Math.round(Number(body.amount || 0) * 100);
    if (!customerId || !orderId) throw new HttpError(400, 'Customer and ticket are required');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99_999_999) throw new HttpError(400, 'Charge amount is invalid');
    const stateRows = await selectRows('pos_state', `store_id=eq.${encodeURIComponent(storeId())}&limit=1`, 'payload');
    const order = (stateRows?.[0]?.payload?.orders || []).find(item => String(item?.id) === orderId);
    if (!order) throw new HttpError(409, 'This ticket is not present in the latest shared store data');
    if (String(order.customerId || '') !== customerId) throw new HttpError(409, 'The ticket does not belong to the selected customer');
    if (order.paid === true || order.paymentStatus === 'paid') throw new HttpError(409, 'This ticket is already marked paid');
    const base = Math.max(0, Number(order.total || 0) - Number(order.discount || 0));
    const fee = Math.round(base * 0.03 * 100) / 100;
    const expectedAmount = Math.round((base + fee) * 100);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== amount) throw new HttpError(409, 'The charge amount no longer matches the latest ticket total');
    const idempotencyKey = String(body.idempotencyKey || randomId()).slice(0, 100);
    const priorAttempts = await selectRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`, '*');
    const prior = priorAttempts?.[0];
    if (prior?.status === 'succeeded') return json(200, { ok:true, alreadyProcessed:true, payment:{ id:prior.processor_id, status:'succeeded', paid:true, amount:Number(prior.amount_cents || 0), currency:prior.currency || 'usd', brand:prior.brand, last4:prior.last4 } });
    if (prior?.status === 'processing') throw new HttpError(409, 'This charge may still be processing. Check Clover before trying again.');
    const successfulForOrder = await selectRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&order_id=eq.${encodeURIComponent(orderId)}&type=eq.charge&status=eq.succeeded&limit=1`, 'processor_id');
    if (successfulForOrder?.length) throw new HttpError(409, 'This ticket already has a successful Clover charge');
    const vaultRows = await selectRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customerId)}&active=eq.true&limit=1`, '*');
    const vault = vaultRows?.[0];
    if (!vault?.clover_customer_id) throw new HttpError(409, 'This customer does not have a live Clover card on file');
    if (!prior) await insertRows('payment_transactions', [{
      store_id:storeId(), order_id:orderId, customer_id:customerId, type:'charge',
      processor:'clover', idempotency_key:idempotencyKey, amount_cents:amount,
      currency:'usd', status:'processing', initiated_by:session.sub,
    }]);
    else await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, { status:'processing', error_message:null });
    const externalRef = String(body.ticket || orderId).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 12) || undefined;
    try {
      const charge = await cloverRequest('/v1/charges', {
        method:'POST',
        headers:{ 'idempotency-key':idempotencyKey },
        body:JSON.stringify({
          amount,
          currency:'usd',
          source:vault.clover_customer_id,
          description:`Hattan ticket ${String(body.ticket || orderId).slice(0, 40)}`,
          external_reference_id:externalRef,
          receipt_email:String(body.email || '').trim() || undefined,
          ecomind:body.cardholderPresent ? 'ecom' : 'moto',
        }),
      }, event);
      const safe = safePaymentResponse(charge);
      if (!safe.paid) throw new HttpError(402, `Clover returned ${safe.status || 'an incomplete payment'}`);
      await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, {
        processor_id:safe.id, status:safe.status || 'succeeded', brand:safe.brand || vault.brand,
        last4:safe.last4 || vault.last4, error_message:null,
        processor_created_at:safe.created ? new Date(Number(safe.created)).toISOString() : null,
      });
      return json(200, { ok:true, payment:safe });
    } catch (error) {
      await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`, { status:'failed', error_message:String(error.message || 'Charge failed').slice(0,500) });
      throw error;
    }
  } catch (error) { return handleError(error); }
};
