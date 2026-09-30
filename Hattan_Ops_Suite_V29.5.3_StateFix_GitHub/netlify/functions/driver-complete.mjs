// POST /.netlify/functions/driver-complete
// { kind:'delivery'|'pickup'|'attempt', orderIds, photos:[paths], scanned:[codes], lat, lng, accuracy,
//   method, recipient, note, bags, reason }
// Saves the proof record, updates the tickets in the shop's data, and tells the customer.
import { assertSameOrigin, handleError, insertRows, json, methodNotAllowed, parseBody, requireSession, storeId, HttpError } from './lib/shared.mjs';
import { mutateStore, readStore, siteUrl } from './lib/app.mjs';
import { allowedOrders, nyToday, routeFor, scanCodes } from './lib/delivery.mjs';
import { compose, deliver, receiptUrl, smsMode } from './lib/sms.mjs';

const clean = (s, n = 200) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const METHODS = ['Handed to customer', 'Left with doorman', 'Front desk / concierge', 'Mailroom / package room', 'Left at door'];

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const session = requireSession(event);
    const body = parseBody(event);
    const kind = ['delivery', 'pickup', 'attempt'].includes(body.kind) ? body.kind : null;
    if (!kind) throw new HttpError(400, 'Unknown stop type');
    const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String))].slice(0, 30);
    if (!ids.length) throw new HttpError(400, 'No tickets given');
    const photos = [...new Set((Array.isArray(body.photos) ? body.photos : []).map(String))].slice(0, 6);
    const prefixOk = p => /^\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\/(delivery|pickup|attempt)-\d+-[a-f0-9]{8}\.jpg$/.test(p) && ids.some(id => p.split('/')[1] === id.replace(/[^A-Za-z0-9_-]/g, ''));
    if (photos.some(p => !prefixOk(p))) throw new HttpError(400, 'A photo does not belong to this stop');
    if (kind !== 'attempt' && !photos.length) throw new HttpError(400, 'Take at least one photo first');
    const method = kind === 'delivery' ? (METHODS.includes(body.method) ? body.method : null) : null;
    if (kind === 'delivery' && !method) throw new HttpError(400, 'Choose how it was handed off');
    const reason = kind === 'attempt' ? clean(body.reason, 120) : '';
    if (kind === 'attempt' && !reason) throw new HttpError(400, 'Choose why it could not be delivered');
    const lat = Number(body.lat), lng = Number(body.lng), acc = Number(body.accuracy);
    const geo = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng, accuracy: Number.isFinite(acc) ? Math.round(acc) : null } : null;
    const scanned = [...new Set((Array.isArray(body.scanned) ? body.scanned : []).map(s => clean(s, 40).toUpperCase()))].slice(0, 60);

    // Every delivered ticket must have been scanned (or the driver explains why not).
    const { payload } = await readStore();
    const orders = allowedOrders(payload, session.sub, ids, kind === 'pickup' ? 'pickup' : 'delivery');
    const unscanned = kind === 'delivery' ? orders.filter(o => !scanCodes(o).some(c => scanned.includes(c))) : [];
    const override = clean(body.scanOverride, 120);
    if (unscanned.length && !override) throw new HttpError(400, `Scan ticket #${String(unscanned[0].ticket || unscanned[0].id).replace(/^HC-/, '')} first`);

    const at = new Date().toISOString();
    const proof = (await insertRows('delivery_proofs', [{
      store_id: storeId(), kind, order_ids: ids, driver_id: session.sub, driver_name: session.name, photos,
      lat: geo?.lat ?? null, lng: geo?.lng ?? null, accuracy: geo?.accuracy ?? null, captured_at: at,
      method, recipient: clean(body.recipient, 80) || null, note: clean(body.note, 300) || null, reason: reason || null,
      scanned, scan_override: unscanned.length ? override : null, bags: Number.isFinite(Number(body.bags)) ? Math.max(0, Math.min(50, Math.round(Number(body.bags)))) : null,
    }]))?.[0];

    const changed = await mutateStore(s => {
      const list = allowedOrders(s, session.sub, ids, kind === 'pickup' ? 'pickup' : 'delivery');
      for (const o of list) {
        const ev = { id: 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at, by: session.name };
        if (kind === 'delivery') {
          Object.assign(o, { status: 'delivered', stageIndex: 5, deliveredAt: at, deliveredBy: session.sub, deliveredByName: session.name, driverRouteReady: false, deliveryProofId: proof?.id || null, deliveryMethod: method, deliveryPhotoCount: photos.length, customerDeliveryUpdatedAt: at, deliveryScanStatus: 'delivered' });
          (o.activity = o.activity || []).unshift({ ...ev, type: 'delivered', label: `Delivered · ${method}${body.recipient ? ' (' + clean(body.recipient, 40) + ')' : ''} · ${photos.length} photo${photos.length === 1 ? '' : 's'}${geo ? ' · GPS' : ''}`, photoCount: photos.length });
        } else if (kind === 'pickup') {
          Object.assign(o, { status: 'picked_up', stageIndex: 1, pickedUpAt: at, pickedUpBy: session.sub, pickedUpByName: session.name, pickupProofId: proof?.id || null, pickupBags: proof?.bags ?? null, assignedDriverId: o.assignedDriverId || session.sub });
          (o.activity = o.activity || []).unshift({ ...ev, type: 'picked_up', label: `Picked up by ${session.name}${proof?.bags ? ' · ' + proof.bags + ' bag(s)' : ''} · photo` });
        } else {
          (o.deliveryAttempts = o.deliveryAttempts || []).unshift({ at, by: session.name, reason, proofId: proof?.id || null });
          // Back to the shop: off this route until staff re-send it.
          if (o.status === 'out_for_delivery') { o.status = 'ready'; o.stageIndex = 3; }
          o.driverRouteReady = false; o.deliveryScanStatus = 'attempted';
          (o.activity = o.activity || []).unshift({ ...ev, type: 'delivery_attempt', label: `Delivery attempt failed · ${reason}` });
        }
      }
      return list.map(o => ({ id: o.id, customerId: o.customerId }));
    });

    // Let the customer know (texts only go out when texting is switched on and they opted in).
    if (kind === 'delivery' && smsMode() !== 'off') {
      const store = (await readStore()).payload;
      const byCustomer = new Map();
      changed.forEach(o => { if (o.customerId) byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) || []), o.id]); });
      for (const [cid, oids] of byCustomer) {
        try {
          const customer = (store.customers || []).find(c => String(c.id) === String(cid));
          const orders = oids.map(id => store.orders.find(o => o.id === id)).filter(Boolean);
          if (!customer || !orders.length) continue;
          await deliver({ keys: oids.map(id => `delivered:${id}`), kind: 'delivered', customer, orderIds: oids, body: compose('delivered', { customer, orders, links: [receiptUrl(siteUrl(event), oids[0])], method }), sentBy: session.sub, event });
        } catch (e) { console.error('delivered text', e.message); }
      }
    }
    const fresh = (await readStore()).payload;
    return json(200, { ok: true, proofId: proof?.id, today: nyToday(), ...routeFor(fresh, session.sub) });
  } catch (error) { return handleError(error); }
};
