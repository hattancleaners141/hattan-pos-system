import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, randomId, requireSession, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const session = requireSession(event, true);
    const body = parseBody(event);
    const orderId = String(body.orderId || '').trim();
    const requestId = String(body.requestId || randomId('refund_')).slice(0,100);
    let chargeId = String(body.chargeId || '').trim();
    const amountCents = body.amount == null ? null : Math.round(Number(body.amount) * 100);
    if (!chargeId && orderId) {
      const rows = await selectRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&order_id=eq.${encodeURIComponent(orderId)}&type=eq.charge&status=eq.succeeded&order=created_at.desc&limit=1`, 'processor_id');
      chargeId = rows?.[0]?.processor_id || '';
    }
    if (!chargeId) throw new HttpError(409, 'No successful Clover charge is attached to this ticket');
    if (amountCents !== null && (!Number.isSafeInteger(amountCents) || amountCents < 1)) throw new HttpError(400, 'Refund amount is invalid');
    const priorRows = await selectRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(requestId)}&limit=1`, '*');
    const prior = priorRows?.[0];
    if (prior?.status === 'succeeded') return json(200, { ok:true, alreadyProcessed:true, refund:{ id:prior.processor_id, status:'succeeded', amount:Number(prior.amount_cents || 0), chargeId:prior.parent_processor_id } });
    if (['processing','review'].includes(prior?.status)) throw new HttpError(409, 'This refund may already have reached Clover. Check the Clover dashboard before any new attempt.');
    if (!prior) await insertRows('payment_transactions', [{
      store_id:storeId(), order_id:orderId || null, customer_id:String(body.customerId || '') || null,
      type:'refund', processor:'clover', parent_processor_id:chargeId, idempotency_key:requestId,
      amount_cents:Number(amountCents || 0), currency:'usd', status:'processing', initiated_by:session.sub,
    }]);
    else await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(requestId)}`, { status:'processing', error_message:null });
    try {
      const refund = await cloverRequest('/v1/refunds', {
        method:'POST',
        body:JSON.stringify({ charge:chargeId, ...(amountCents !== null ? { amount:amountCents } : {}), reason:'requested_by_customer' }),
      }, event);
      const status = String(refund?.status || '');
      if (status && status !== 'succeeded') throw new HttpError(402, `Clover refund status: ${status}`);
      await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(requestId)}`, {
        processor_id:refund?.id || null, amount_cents:Number(refund?.amount || amountCents || 0),
        currency:String(refund?.currency || 'usd'), status:status || 'succeeded', error_message:null,
      });
      return json(200, { ok:true, refund:{ id:refund?.id || null, status:status || 'succeeded', amount:Number(refund?.amount || amountCents || 0), chargeId } });
    } catch (error) {
      const status = !error?.status || Number(error.status) >= 500 ? 'review' : 'failed';
      await updateRows('payment_transactions', `store_id=eq.${encodeURIComponent(storeId())}&idempotency_key=eq.${encodeURIComponent(requestId)}`, { status, error_message:String(error.message || 'Refund failed').slice(0,500) });
      throw error;
    }
  } catch (error) { return handleError(error); }
};
