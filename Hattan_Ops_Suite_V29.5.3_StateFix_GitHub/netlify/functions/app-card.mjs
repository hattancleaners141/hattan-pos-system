// POST   /.netlify/functions/app-card { token, consent:true } — customer saves / replaces their card
// DELETE /.netlify/functions/app-card                           — customer removes their card
// Card numbers go straight from Clover's hosted fields to Clover; only a token reaches us.
import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';
import { mutateStore, readStore, requireAccount } from './lib/app.mjs';
import { compose, deliver } from './lib/sms.mjs';

const sid = () => encodeURIComponent(storeId());
function sourceMetadata(data) {
  const rows = Array.isArray(data?.sources?.data) ? data.sources.data : [];
  const source = rows.find(item => item && typeof item === 'object') || data?.source || null;
  const sourceId = typeof rows[0] === 'string' ? rows[0] : (source?.id || null);
  return { sourceId, brand: source?.brand || null, last4: source?.last4 || null, expMonth: source?.exp_month || null, expYear: source?.exp_year || null };
}
async function revokeSource(current, event) {
  if (!current?.clover_customer_id || !current?.clover_source_id) return;
  try { await cloverRequest(`/v1/customers/${encodeURIComponent(current.clover_customer_id)}/sources/${encodeURIComponent(current.clover_source_id)}`, { method: 'DELETE' }, event); }
  catch (error) { if (Number(error?.details?.processorStatus) !== 404) throw error; }
}
async function setPosCard(customerId, card) {
  await mutateStore(s => {
    const c = (s.customers || []).find(x => String(x.id) === String(customerId));
    if (!c) return;
    c.paymentMethods = (c.paymentMethods || []).filter(p => p.processor !== 'clover');
    if (card) c.paymentMethods.unshift(card);
  });
}

export const handler = async (event) => {
  if (!['POST', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed('POST, DELETE');
  try {
    assertSameOrigin(event);
    const account = await requireAccount(event);
    if (!account.customer_id) throw new HttpError(409, 'Finish setting up your account first');
    const customerId = account.customer_id;
    const existing = await selectRows('payment_vault', `store_id=eq.${sid()}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`, '*');
    const current = existing?.[0];

    if (event.httpMethod === 'DELETE') {
      if (!current?.active) return json(200, { ok: true, removed: false });
      await updateRows('payment_vault', `store_id=eq.${sid()}&customer_id=eq.${encodeURIComponent(customerId)}`, { active: false, updated_at: new Date().toISOString() });
      await revokeSource(current, event);
      await setPosCard(customerId, null);
      return json(200, { ok: true, removed: true });
    }

    const body = parseBody(event);
    if (body.consent !== true) throw new HttpError(400, 'Please confirm you authorize charges to this card');
    const token = String(body.token || '').trim();
    if (!/^clv_[A-Za-z0-9]+$/.test(token)) throw new HttpError(400, 'The card could not be verified. Please re-enter it.');
    const { payload } = await readStore();
    const c = (payload.customers || []).find(x => String(x.id) === String(customerId));
    if (!c) throw new HttpError(409, 'Your account is not ready yet');
    if (current?.clover_customer_id && !current?.clover_source_id) throw new HttpError(409, 'Please call us to update your card');
    if (current?.clover_customer_id) {
      await updateRows('payment_vault', `store_id=eq.${sid()}&customer_id=eq.${encodeURIComponent(customerId)}`, { active: false, updated_at: new Date().toISOString() });
      await revokeSource(current, event);
      await setPosCard(customerId, null); // old card is gone at Clover even if the new one fails
    }
    const name = String(c.name || '').trim(), parts = name.split(/\s+/).filter(Boolean);
    const result = await cloverRequest(current?.clover_customer_id ? `/v1/customers/${encodeURIComponent(current.clover_customer_id)}` : '/v1/customers', {
      method: current?.clover_customer_id ? 'PUT' : 'POST',
      body: JSON.stringify({ email: account.email, name, firstName: parts[0] || undefined, lastName: parts.slice(1).join(' ') || undefined, phone: String(c.phone || '') || undefined, source: token, ecomind: 'ecom' }),
    }, event);
    const m = sourceMetadata(result);
    const cloverCustomerId = result?.id || current?.clover_customer_id;
    if (!cloverCustomerId) throw new HttpError(502, 'The card could not be saved. Please try again.');
    const row = {
      store_id: storeId(), customer_id: customerId, clover_customer_id: cloverCustomerId, clover_source_id: m.sourceId || current?.clover_source_id,
      brand: m.brand || current?.brand, last4: m.last4 || current?.last4, exp_month: m.expMonth || current?.exp_month, exp_year: m.expYear || current?.exp_year,
      active: true, consent_at: new Date().toISOString(), consent_by: `app:${account.id}`, updated_at: new Date().toISOString(),
    };
    await insertRows('payment_vault', [current?.id ? { id: current.id, ...row } : row], current?.id ? 'resolution=merge-duplicates,return=representation' : 'return=representation');
    const card = { id: `clover_${cloverCustomerId}`, brand: row.brand || 'Card', last4: row.last4 || '', default: true, processor: 'clover' };
    await setPosCard(customerId, card);
    try { if (c.smsConsent?.on && card.last4) await deliver({ keys: [`cardSaved:${customerId}:${card.last4}`], kind: 'cardSaved', customer: c, body: compose('cardSaved', { customer: c, card }), sentBy: 'customer-app', event }); } catch (e) { console.error('card saved text', e.message); }
    return json(201, { ok: true, card: { brand: card.brand, last4: card.last4 } });
  } catch (error) { return handleError(error); }
};
