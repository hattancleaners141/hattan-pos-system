import { createRealtimeJwt, json, methodNotAllowed, readSession } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  const session = readSession(event);
  if (!session) return json(200, { ok:true, authenticated:false });
  return json(200, { ok:true, authenticated:true, staff:{ id:session.sub, name:session.name, manager:session.role === 'manager', role:session.role }, realtimeToken:createRealtimeJwt(session) });
};
