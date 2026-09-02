import { createRealtimeJwt, createSession, json, methodNotAllowed, readSession, sessionCookie } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  const session = readSession(event);
  if (!session) return json(200, { ok:true, authenticated:false });
  const staff = {
    id:session.sub,
    display_name:session.name,
    manager:session.role === 'manager',
    role:session.role,
    store_id:session.storeId,
  };
  const renewed = createSession(staff);
  return json(200, {
    ok:true,
    authenticated:true,
    staff:{ id:staff.id, name:staff.display_name, manager:staff.manager, role:staff.role },
    realtimeToken:createRealtimeJwt(session),
  }, { 'Set-Cookie':sessionCookie(renewed) });
};
