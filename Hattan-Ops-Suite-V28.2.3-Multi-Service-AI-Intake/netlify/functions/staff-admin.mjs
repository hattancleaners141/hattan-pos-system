import { assertSameOrigin, handleError, hashPin, insertRows, json, methodNotAllowed, parseBody, randomId, requireSession, selectRows, staffSafe, storeId, updateRows, verifyPin, HttpError } from './lib/shared.mjs';

export const handler = async (event) => {
  if (!['POST', 'PATCH'].includes(event.httpMethod)) return methodNotAllowed('POST, PATCH');
  try {
    assertSameOrigin(event);
    const session = requireSession(event, event.httpMethod === 'POST');
    const body = parseBody(event);
    if (event.httpMethod === 'POST') {
      const name = String(body.name || '').trim();
      if (name.length < 2) throw new HttpError(400, 'Enter the staff member name');
      const pin = hashPin(body.pin);
      const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();
      const [row] = await insertRows('staff_accounts', [{
        id:randomId('staff_'), store_id:storeId(), display_name:name, initials,
        manager:!!body.manager, active:true, pin_hash:pin.hash, pin_salt:pin.salt, pin_iterations:pin.iterations,
      }]);
      return json(201, { ok:true, staff:staffSafe(row) });
    }
    const staffId = String(body.staffId || session.sub);
    if (staffId !== session.sub && session.role !== 'manager') throw new HttpError(403, 'You may only change your own PIN');
    const rows = await selectRows('staff_accounts', `store_id=eq.${encodeURIComponent(storeId())}&id=eq.${encodeURIComponent(staffId)}&active=eq.true&limit=1`, '*');
    const staff = rows?.[0];
    if (!staff) throw new HttpError(404, 'Staff member not found');
    if (staffId === session.sub && !verifyPin(body.currentPin, staff)) throw new HttpError(401, 'Current PIN is incorrect');
    const pin = hashPin(body.newPin);
    const [updated] = await updateRows('staff_accounts', `store_id=eq.${encodeURIComponent(storeId())}&id=eq.${encodeURIComponent(staffId)}`, { pin_hash:pin.hash, pin_salt:pin.salt, pin_iterations:pin.iterations, updated_at:new Date().toISOString() });
    return json(200, { ok:true, staff:staffSafe(updated) });
  } catch (error) { return handleError(error); }
};
