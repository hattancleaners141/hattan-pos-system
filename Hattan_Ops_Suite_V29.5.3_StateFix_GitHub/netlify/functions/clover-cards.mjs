import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, storeId, updateRows, HttpError } from './lib/shared.mjs';
import { currentVault, revokeSource, saveCardOnFile } from './lib/card-vault.mjs';

export const handler = async (event) => {
  if (!['POST', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed('POST, DELETE');
  try {
    assertSameOrigin(event);
    const session = requireSession(event, event.httpMethod === 'DELETE');
    const body = parseBody(event);
    const customerId = String(body.customerId || '').trim();
    if (!customerId) throw new HttpError(400, 'Customer account is required');
    const current = await currentVault(customerId);

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
    const card = await saveCardOnFile(event, session, { customerId, token, email, name, phone: body.phone });
    return json(201, { ok:true, card });
  } catch (error) { return handleError(error); }
};
