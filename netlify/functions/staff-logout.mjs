import { assertSameOrigin, clearSessionCookie, json, methodNotAllowed } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  assertSameOrigin(event);
  return json(200, { ok:true }, { 'Set-Cookie':clearSessionCookie() });
};
