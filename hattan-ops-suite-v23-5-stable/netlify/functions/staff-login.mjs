import { assertSameOrigin, createRealtimeJwt, createSession, handleError, insertRows, json, methodNotAllowed, parseBody, requestIp, selectRows, sessionCookie, staffSafe, storeId, verifyPin, HttpError } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const body = parseBody(event);
    const staffId = String(body.staffId || '');
    const ip = requestIp(event);
    if (!staffId || !/^\d{4}$/.test(String(body.pin || ''))) throw new HttpError(400, 'Choose a staff member and enter the 4-digit PIN');
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const attempts = await selectRows('login_attempts', `store_id=eq.${encodeURIComponent(storeId())}&staff_id=eq.${encodeURIComponent(staffId)}&ip_address=eq.${encodeURIComponent(ip)}&succeeded=eq.false&attempted_at=gte.${encodeURIComponent(since)}`, 'id');
    if ((attempts || []).length >= 5) throw new HttpError(429, 'Too many incorrect attempts. Wait 15 minutes or ask a manager.');
    const rows = await selectRows('staff_accounts', `store_id=eq.${encodeURIComponent(storeId())}&id=eq.${encodeURIComponent(staffId)}&active=eq.true&limit=1`, '*');
    const staff = rows?.[0];
    const valid = !!staff && verifyPin(body.pin, staff);
    await insertRows('login_attempts', [{ store_id:storeId(), staff_id:staffId, ip_address:ip, succeeded:valid }], 'return=minimal');
    if (!valid) throw new HttpError(401, 'Incorrect PIN');
    if (body.verifyOnly === true) return json(200, { ok:true, verified:true, staff:staffSafe(staff) });
    const sessionData = { sub:staff.id, name:staff.display_name, role:staff.manager ? 'manager' : 'staff', storeId:staff.store_id };
    const token = createSession(staff);
    return json(200, { ok:true, staff:staffSafe(staff), realtimeToken:createRealtimeJwt(sessionData) }, { 'Set-Cookie':sessionCookie(token) });
  } catch (error) { return handleError(error); }
};
