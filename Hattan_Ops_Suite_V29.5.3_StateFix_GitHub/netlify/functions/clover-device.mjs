// /.netlify/functions/clover-device — Clover Flex payments from the POS (staff only).
// GET                                  → connection status (+ device list for managers)
// POST {action:'select', deviceId}     → manager picks which Clover device to use
// POST {action:'disconnect'}           → manager removes the connection
// POST {action:'begin', orderIds}      → reserves the tickets and returns the amount + a one-sale device session
// POST {action:'record', attemptId, paymentId} → verifies the payment with Clover, marks the reservation paid
// POST {action:'abort', attemptId, reason}     → releases the reservation (declined / cancelled)
// POST {action:'vaultBegin'}                   → device session for "save this card" (customer taps again, consents on the Flex)
// POST {action:'vault', customerId, token, …}  → saves the Flex card token as the customer's Clover card on file
import { assertSameOrigin, env, handleError, insertRows, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';
import { saveCardOnFile } from './lib/card-vault.mjs';
import { deleteAuth, deviceApi, deviceConfig, deviceConfigured, expectedCents, readAuth, saveAuth, validAuth } from './lib/clover-device.mjs';

const sid = () => encodeURIComponent(storeId());
// Cards saved from the Flex go to the same Clover account the batch charge uses — only when both are on the same environment.
const sameEnv = () => deviceConfig().environment === (env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox');
const clean = v => String(v || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);

async function txFor(attemptId) {
  return (await selectRows('payment_transactions', `store_id=eq.${sid()}&processor=eq.clover-flex&idempotency_key=like.${encodeURIComponent(`flex:${attemptId}:*`)}`, '*')) || [];
}

export const handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed('GET, POST');
  try {
    const session = requireSession(event);
    const manager = session.role === 'manager';
    const c = deviceConfig();
    if (event.httpMethod === 'GET') {
      const a = deviceConfigured() ? await readAuth().catch(() => null) : null;
      let devices = [], multiPay = null;
      if (a && manager && event.queryStringParameters?.devices) {
        try {
          const v = await validAuth();
          devices = ((await deviceApi(v, '/devices'))?.elements || []).map(d => ({ id: d.id, serial: d.serial || '', name: d.name || d.productName || d.deviceTypeName || 'Clover device', model: d.deviceTypeName || d.model || '' }));
          try { const g = await deviceApi(v, '/gateway'); multiPay = !!(g && g.supportsMultiPayToken); } catch (_) {}
        } catch (_) {}
      }
      return json(200, { ok: true, configured: deviceConfigured(), environment: c.environment, connected: !!a, merchantId: a?.merchant_id || '', device: a?.device_id ? { id: a.device_id, serial: a.device_serial, name: a.device_name } : null, connectedBy: a?.connected_by || '', devices, multiPay, canSaveCards: sameEnv() });
    }
    assertSameOrigin(event);
    const body = parseBody(event);
    if (!deviceConfigured()) throw new HttpError(503, 'The Clover Flex app is not set up in Netlify yet');

    if (body.action === 'select') {
      if (!manager) throw new HttpError(403, 'Manager access is required');
      const a = await validAuth();
      const d = ((await deviceApi(a, '/devices'))?.elements || []).find(x => x.id === String(body.deviceId || ''));
      if (!d) throw new HttpError(404, 'That Clover device was not found');
      await saveAuth({ device_id: d.id, device_serial: d.serial || '', device_name: d.name || d.productName || d.deviceTypeName || 'Clover device' });
      return json(200, { ok: true });
    }
    if (body.action === 'disconnect') {
      if (!manager) throw new HttpError(403, 'Manager access is required');
      await deleteAuth();
      return json(200, { ok: true });
    }

    if (body.action === 'begin') {
      const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 30);
      if (!ids.length) throw new HttpError(400, 'No tickets given');
      const a = await validAuth();
      if (!a.device_id) throw new HttpError(409, 'Choose which Clover device to use in Settings → Clover Flex');
      const store = (await selectRows('pos_state', `store_id=eq.${sid()}&limit=1`, 'payload'))?.[0]?.payload || {};
      const orders = ids.map(id => (store.orders || []).find(o => String(o?.id) === id));
      if (orders.some(o => !o)) throw new HttpError(409, 'A ticket is not saved to the store yet — wait a second and try again');
      if (orders.some(o => o.paid === true || o.paymentStatus === 'paid')) throw new HttpError(409, 'One of these tickets is already paid');
      // Clear our own stale reservations (an attempt that was never finished) older than 10 minutes.
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      for (const id of ids) await updateRows('payment_transactions', `store_id=eq.${sid()}&order_id=eq.${encodeURIComponent(id)}&processor=eq.clover-flex&status=eq.processing&created_at=lt.${encodeURIComponent(cutoff)}`, { status: 'failed', error_message: 'Flex attempt expired' });
      const lines = orders.map(o => ({ o, cents: expectedCents(o) }));
      const total = lines.reduce((s, l) => s + l.cents, 0);
      if (total < 1) throw new HttpError(409, 'Nothing is due on these tickets');
      const attemptId = clean(body.attemptId) || `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      try {
        await insertRows('payment_transactions', lines.map(l => ({
          store_id: storeId(), order_id: String(l.o.id), customer_id: l.o.customerId || null, type: 'charge', processor: 'clover-flex',
          idempotency_key: `flex:${attemptId}:${l.o.id}`, amount_cents: l.cents, currency: 'usd', status: 'processing', initiated_by: session.sub,
        })), 'return=minimal');
      } catch (e) {
        throw new HttpError(409, 'One of these tickets is already being charged (or was charged) — check Payments before trying again');
      }
      return json(200, {
        ok: true, attemptId, amountCents: total, lines: lines.map(l => ({ orderId: l.o.id, ticket: l.o.ticket || l.o.id, cents: l.cents })),
        device: { raid: c.raid, cloverServer: c.cloverServer, merchantId: a.merchant_id, deviceId: a.device_id, accessToken: a.access_token, friendlyId: `Hattan POS ${session.name || ''}`.trim().slice(0, 40), environment: c.environment },
      });
    }

    if (body.action === 'record') {
      const attemptId = clean(body.attemptId), paymentId = clean(body.paymentId);
      if (!attemptId || !paymentId) throw new HttpError(400, 'Missing payment details');
      const rows = await txFor(attemptId);
      if (!rows.length) throw new HttpError(404, 'This Flex payment attempt was not found');
      if (rows.every(r => r.status === 'succeeded' && r.processor_id === paymentId)) return json(200, { ok: true, alreadyRecorded: true, paymentId, brand: rows[0].brand, last4: rows[0].last4 });
      const expected = rows.reduce((s, r) => s + Number(r.amount_cents || 0), 0);
      const a = await validAuth();
      const p = await deviceApi(a, `/payments/${encodeURIComponent(paymentId)}?expand=cardTransaction`);
      const amount = Number(p?.amount || 0), result = String(p?.result || '');
      if (result !== 'SUCCESS') throw new HttpError(402, `Clover shows this payment as ${result || 'not completed'}`);
      if (amount < expected) throw new HttpError(409, `Clover charged ${(amount / 100).toFixed(2)} but ${(expected / 100).toFixed(2)} was due — check the Flex`);
      const brand = p?.cardTransaction?.cardType || '', last4 = p?.cardTransaction?.last4 || '';
      await updateRows('payment_transactions', `store_id=eq.${sid()}&processor=eq.clover-flex&idempotency_key=like.${encodeURIComponent(`flex:${attemptId}:*`)}`, {
        status: 'succeeded', processor_id: paymentId, brand, last4, error_message: null, processor_created_at: p?.createdTime ? new Date(Number(p.createdTime)).toISOString() : null,
      });
      return json(200, { ok: true, paymentId, amountCents: amount, tipCents: Number(p?.tipAmount || 0), brand, last4 });
    }

    if (body.action === 'abort') {
      const attemptId = clean(body.attemptId);
      if (!attemptId) throw new HttpError(400, 'Missing attempt');
      const rows = await txFor(attemptId);
      if (rows.some(r => r.status === 'succeeded')) return json(200, { ok: true, kept: true });
      await updateRows('payment_transactions', `store_id=eq.${sid()}&processor=eq.clover-flex&status=eq.processing&idempotency_key=like.${encodeURIComponent(`flex:${attemptId}:*`)}`, { status: 'failed', error_message: String(body.reason || 'Cancelled').slice(0, 300) });
      return json(200, { ok: true });
    }
    if (body.action === 'vaultBegin') {
      if (!sameEnv()) throw new HttpError(409, 'Saving cards from the Flex starts once the Flex uses the live Clover app');
      const a = await validAuth();
      if (!a.device_id) throw new HttpError(409, 'Choose which Clover device to use in Settings → Clover Flex');
      return json(200, { ok: true, device: { raid: c.raid, cloverServer: c.cloverServer, merchantId: a.merchant_id, deviceId: a.device_id, accessToken: a.access_token, friendlyId: `Hattan POS ${session.name || ''}`.trim().slice(0, 40), environment: c.environment } });
    }
    if (body.action === 'vault') {
      if (!sameEnv()) throw new HttpError(409, 'Saving cards from the Flex starts once the Flex uses the live Clover app');
      if (body.consent !== true) throw new HttpError(400, 'The customer has to agree on the Flex before the card is saved');
      const customerId = String(body.customerId || '').trim();
      const token = String(body.token || '').trim();
      const email = String(body.email || '').trim();
      if (!customerId) throw new HttpError(400, 'Customer is required');
      if (!/^[A-Za-z0-9_-]{6,120}$/.test(token)) throw new HttpError(400, 'The Flex did not return a valid card token');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Clover needs the customer\'s email to save a card on file');
      const store = (await selectRows('pos_state', `store_id=eq.${sid()}&limit=1`, 'payload'))?.[0]?.payload || {};
      const cust = (store.customers || []).find(x => String(x?.id) === customerId);
      if (!cust) throw new HttpError(409, 'This customer is not saved to the store yet — try again in a moment');
      const card = await saveCardOnFile(event, session, { customerId, token, email, name: String(body.name || cust.name || '').trim(), phone: cust.phone, fallback: { last4: String(body.last4 || '').replace(/\D/g, '').slice(-4), brand: String(body.brand || '').slice(0, 20) } });
      return json(201, { ok: true, card });
    }
    throw new HttpError(400, 'Unknown action');
  } catch (error) { return handleError(error); }
};
