// Staff: GET /.netlify/functions/delivery-proofs?orderId=HC-123  (or no orderId → today's and recent proofs)
import { handleError, json, methodNotAllowed, requireSession, selectRows, storeId } from './lib/shared.mjs';
import { proofsFor, signedUrls } from './lib/delivery.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    requireSession(event);
    const orderId = String(event.queryStringParameters?.orderId || '');
    let rows;
    if (orderId) rows = await proofsFor([orderId], { seconds: 1800 });
    else {
      rows = await selectRows('delivery_proofs', `store_id=eq.${encodeURIComponent(storeId())}&order=captured_at.desc&limit=30`, '*');
      for (const r of rows || []) r.photoUrls = await signedUrls(r.photos, 1800);
    }
    return json(200, { ok: true, proofs: (rows || []).map(r => ({ id: r.id, kind: r.kind, orderIds: r.order_ids, driver: r.driver_name, at: r.captured_at, method: r.method, recipient: r.recipient, note: r.note, reason: r.reason, bags: r.bags, scanned: r.scanned, scanOverride: r.scan_override, gps: r.lat != null ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy } : null, photos: r.photoUrls || [] })) });
  } catch (error) { return handleError(error); }
};
