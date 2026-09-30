// POST /.netlify/functions/driver-photo { orderIds, kind:'delivery'|'pickup'|'attempt', image:'data:image/jpeg;base64,...' }
// Stores one proof photo in the private "delivery-proof" bucket and returns its path.
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, HttpError } from './lib/shared.mjs';
import { readStore } from './lib/app.mjs';
import { allowedOrders, photoPath, putPhoto } from './lib/delivery.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const session = requireSession(event);
    if (String(event.body || '').length > 5_500_000) throw new HttpError(413, 'Photo is too large');
    const body = parseBody(event);
    const kind = ['delivery', 'pickup', 'attempt'].includes(body.kind) ? body.kind : null;
    if (!kind) throw new HttpError(400, 'Unknown photo type');
    const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 30);
    const { payload } = await readStore();
    allowedOrders(payload, session.sub, ids, kind === 'pickup' ? 'pickup' : 'delivery');
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
    if (!m) throw new HttpError(400, 'Photo must be a JPEG');
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(400, 'That photo could not be read');
    const path = await putPhoto(photoPath(ids[0], kind), buf);
    return json(201, { ok: true, path });
  } catch (error) { return handleError(error); }
};
