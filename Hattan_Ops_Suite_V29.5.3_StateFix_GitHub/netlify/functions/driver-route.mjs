// GET  /.netlify/functions/driver-route               → today's stops for the signed-in driver
// POST { action:'claim', orderIds }                     → take an open app pickup
// POST { action:'start', orderIds }                     → mark deliveries "Out for delivery"
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, HttpError } from './lib/shared.mjs';
import { mutateStore, readStore } from './lib/app.mjs';
import { allowedOrders, routeFor } from './lib/delivery.mjs';

export const handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed('GET, POST');
  try {
    const session = requireSession(event);
    if (event.httpMethod === 'GET') {
      const { payload } = await readStore();
      return json(200, { ok: true, driver: { id: session.sub, name: session.name }, ...routeFor(payload, session.sub) });
    }
    assertSameOrigin(event);
    const body = parseBody(event);
    const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 30);
    if (!ids.length) throw new HttpError(400, 'No tickets given');
    if (body.action === 'claim') {
      await mutateStore(s => {
        const list = allowedOrders(s, session.sub, ids, 'pickup');
        list.forEach(o => { o.assignedDriverId = session.sub; o.assignedDriverName = session.name; o.assignedAt = new Date().toISOString(); });
      });
    } else if (body.action === 'start') {
      await mutateStore(s => {
        const list = allowedOrders(s, session.sub, ids, 'delivery');
        const now = new Date().toISOString();
        list.forEach(o => {
          if (o.status !== 'out_for_delivery') { o.status = 'out_for_delivery'; o.stageIndex = 4; o.outForDeliveryAt = now; }
          (o.activity = o.activity || []).unshift({ id: 'evt_' + Date.now().toString(36), type: 'out_for_delivery', label: `Out for delivery with ${session.name}`, at: now, by: session.name });
        });
      });
    } else throw new HttpError(400, 'Unknown action');
    const { payload } = await readStore();
    return json(200, { ok: true, driver: { id: session.sub, name: session.name }, ...routeFor(payload, session.sub) });
  } catch (error) { return handleError(error); }
};
