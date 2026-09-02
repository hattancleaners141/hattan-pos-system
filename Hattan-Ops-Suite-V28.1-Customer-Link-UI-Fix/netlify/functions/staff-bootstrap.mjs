import { assertSameOrigin, createSession, handleError, hashPin, insertRows, json, methodNotAllowed, parseBody, randomId, selectRows, sessionCookie, staffSafe, storeId, HttpError } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const body = parseBody(event);
    const configuredCode = String(process.env.HATTAN_BOOTSTRAP_CODE || '');
    if (configuredCode.length < 12 || String(body.bootstrapCode || '') !== configuredCode) throw new HttpError(403, 'The one-time setup code is incorrect');
    const existing = await selectRows('staff_accounts', `store_id=eq.${encodeURIComponent(storeId())}&limit=1`, 'id');
    if (existing?.length) throw new HttpError(409, 'The first manager is already set up');
    const name = String(body.name || '').trim();
    if (name.length < 2) throw new HttpError(400, 'Enter the manager name');
    const pin = hashPin(body.pin);
    const id = randomId('staff_');
    const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();
    const [row] = await insertRows('staff_accounts', [{
      id, store_id:storeId(), display_name:name, initials, manager:true, active:true,
      pin_hash:pin.hash, pin_salt:pin.salt, pin_iterations:pin.iterations,
    }]);
    const token = createSession(row);
    return json(201, { ok:true, staff:staffSafe(row) }, { 'Set-Cookie':sessionCookie(token) });
  } catch (error) { return handleError(error); }
};
