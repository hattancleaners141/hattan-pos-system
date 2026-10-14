// POST /.netlify/functions/clover-sync {chargeId?} — manager "Check Clover now": runs the same
// void/refund check as the 15-minute schedule and returns what Clover reported for each charge.
import { assertSameOrigin, cloverConfigured, handleError, json, methodNotAllowed, parseBody, requireSession, HttpError } from './lib/shared.mjs';
import { syncCloverReversals } from './lib/clover-sync.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    requireSession(event, true);
    if (!cloverConfigured()) throw new HttpError(503, 'Clover is not set up');
    const body = parseBody(event);
    const chargeId = String(body.chargeId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    const r = await syncCloverReversals({ days: Math.min(90, Math.max(1, Number(body.days) || 30)), chargeId });
    return json(200, { ok: true, ...r });
  } catch (error) { return handleError(error); }
};
