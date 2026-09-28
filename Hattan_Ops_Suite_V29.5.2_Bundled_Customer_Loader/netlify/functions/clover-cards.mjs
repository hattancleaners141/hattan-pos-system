import { assertSameOrigin, cloverRequest, handleError, insertRows, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, updateRows, HttpError } from './lib/shared.mjs';

function sourceMetadata(data) {
  const rows = Array.isArray(data?.sources?.data) ? data.sources.data : [];
  const source = rows.find(item => item && typeof item === 'object') || data?.source || null;
  const sourceId = typeof rows[0] === 'string' ? rows[0] : (source?.id || null);
  return { sourceId, brand:source?.brand || null, last4:source?.last4 || null, expMonth:source?.exp_month || null, expYear:source?.exp_year || null };
}

async function revokeSource(current, event) {
  if (!current?.clover_customer_id || !current?.clover_source_id) return;
  try {
    await cloverRequest(`/v1/customers/${encodeURIComponent(current.clover_customer_id)}/sources/${encodeURIComponent(current.clover_source_id)}`, { method:'DELETE' }, event);
  } catch (error) {
    // Retrying after a timeout is safe when Clover confirms that this source is
    // already gone. Any other response remains a visible setup error.
    if (Number(error?.details?.processorStatus) !== 404) throw error;
  }
}

export const handler = async (event) => {
  if (!['POST', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed('POST, DELETE');
  try {
    assertSameOrigin(event);
    const session = requireSession(event, event.httpMethod === 'DELETE');
    const body = parseBody(event);
    const customerId = String(body.customerId || '').trim();
    if (!customerId) throw new HttpError(400, 'Customer account is required');
    const existing = await selectRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`, '*');
    const current = existing?.[0];

    if (event.httpMethod === 'DELETE') {
      if (!current?.clover_customer_id || !current?.clover_source_id) throw new HttpError(404, 'No removable Clover card is attached to this customer');
      await updateRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customerId)}`, {
        active:false,
        updated_at:new Date().toISOString(),
      });
      await revokeSource(current, event);
      return json(200, { ok:true, removed:true });
    }

    if (body.consent !== true) throw new HttpError(400, 'Cardholder consent is required before saving a card');
    const token = String(body.token || '').trim();
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();
    if (!/^clv_[A-Za-z0-9]+$/.test(token)) throw new HttpError(400, 'Clover did not return a valid card token');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Clover requires a customer email address to save a card on file');
    if (current?.clover_customer_id && !current?.clover_source_id) throw new HttpError(409, 'The existing Clover source reference is incomplete. Remove it in Clover before adding a replacement.');
    if (current?.clover_customer_id) {
      // Clover requires the previous card-on-file source to be revoked before a
      // replacement token is added. Disable local charging first so a partial
      // processor failure cannot leave the POS charging a stale credential.
      await updateRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customerId)}`, {
        active:false,
        updated_at:new Date().toISOString(),
      });
      await revokeSource(current, event);
    }
    const path = current?.clover_customer_id ? `/v1/customers/${encodeURIComponent(current.clover_customer_id)}` : '/v1/customers';
    const method = current?.clover_customer_id ? 'PUT' : 'POST';
    const nameParts = name.split(/\s+/).filter(Boolean);
    const result = await cloverRequest(path, {
      method,
      body:JSON.stringify({
        email,
        name,
        firstName:nameParts[0] || undefined,
        lastName:nameParts.slice(1).join(' ') || undefined,
        phone:String(body.phone || '').trim() || undefined,
        source:token,
        ecomind:'ecom',
      }),
    }, event);
    const metadata = sourceMetadata(result);
    const cloverCustomerId = result?.id || current?.clover_customer_id;
    if (!cloverCustomerId) throw new HttpError(502, 'Clover saved the card but did not return a customer ID');
    if (current?.id) {
      await insertRows('payment_vault', [{
        id:current.id, store_id:storeId(), customer_id:customerId, clover_customer_id:cloverCustomerId,
        clover_source_id:metadata.sourceId || current.clover_source_id, brand:metadata.brand || current.brand,
        last4:metadata.last4 || current.last4, exp_month:metadata.expMonth || current.exp_month,
        exp_year:metadata.expYear || current.exp_year, active:true, consent_at:new Date().toISOString(),
        consent_by:session.sub, updated_at:new Date().toISOString(),
      }], 'resolution=merge-duplicates,return=representation');
    } else {
      await insertRows('payment_vault', [{
        store_id:storeId(), customer_id:customerId, clover_customer_id:cloverCustomerId,
        clover_source_id:metadata.sourceId, brand:metadata.brand, last4:metadata.last4,
        exp_month:metadata.expMonth, exp_year:metadata.expYear, active:true,
        consent_at:new Date().toISOString(), consent_by:session.sub,
      }]);
    }
    return json(201, { ok:true, card:{ id:`clover_${cloverCustomerId}`, brand:metadata.brand || current?.brand || 'Clover card', last4:metadata.last4 || current?.last4 || '', default:true, processor:'clover' } });
  } catch (error) { return handleError(error); }
};
