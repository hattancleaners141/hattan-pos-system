// Save a Clover card-on-file (Ecommerce customer + source) for a POS customer.
// Used by the counter card form (clover-cards) and by the Clover Flex "save this card" step (clover-device).
import { cloverRequest, insertRows, selectRows, storeId, updateRows, HttpError } from './shared.mjs';

export function sourceMetadata(data) {
  const rows = Array.isArray(data?.sources?.data) ? data.sources.data : [];
  const source = rows.find(item => item && typeof item === 'object') || data?.source || null;
  const sourceId = typeof rows[0] === 'string' ? rows[0] : (source?.id || null);
  return { sourceId, brand:source?.brand || null, last4:source?.last4 || null, expMonth:source?.exp_month || null, expYear:source?.exp_year || null };
}

export async function revokeSource(current, event) {
  if (!current?.clover_customer_id || !current?.clover_source_id) return;
  try {
    await cloverRequest(`/v1/customers/${encodeURIComponent(current.clover_customer_id)}/sources/${encodeURIComponent(current.clover_source_id)}`, { method:'DELETE' }, event);
  } catch (error) {
    // Retrying after a timeout is safe when Clover confirms that this source is
    // already gone. Any other response remains a visible setup error.
    if (Number(error?.details?.processorStatus) !== 404) throw error;
  }
}

export async function currentVault(customerId) {
  const existing = await selectRows('payment_vault', `store_id=eq.${encodeURIComponent(storeId())}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`, '*');
  return existing?.[0] || null;
}

export async function saveCardOnFile(event, session, { customerId, token, email, name = '', phone, fallback = {} }) {
  const current = await currentVault(customerId);
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
        phone:String(phone || '').trim() || undefined,
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
    return { id:`clover_${cloverCustomerId}`, brand:metadata.brand || fallback.brand || current?.brand || 'Clover card', last4:metadata.last4 || fallback.last4 || current?.last4 || '', default:true, processor:'clover' };
}
