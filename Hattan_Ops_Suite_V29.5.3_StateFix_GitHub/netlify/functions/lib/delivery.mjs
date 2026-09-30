// Hattan Cleaners driver app — shared server logic (routes, proof photos, completion).
import crypto from 'node:crypto';
import { env, selectRows, storeId, supabaseRequestHeaders, supabaseServerKey, HttpError } from './shared.mjs';

export const BUCKET = 'delivery-proof';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const nyDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };

// ---------------------------------------------------------------- storage (private bucket)
function storageBase() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  if (!url || !supabaseServerKey()) throw new HttpError(503, 'Photo storage is not configured');
  return `${url}/storage/v1`;
}
export async function putPhoto(path, buffer) {
  const res = await fetch(`${storageBase()}/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...supabaseRequestHeaders(), 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'Cache-Control': 'private, max-age=31536000' },
    body: buffer,
  });
  if (!res.ok) { console.error('photo upload failed', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'Photo upload failed — try again'); }
  return path;
}
export async function signedUrls(paths, seconds = 3600) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return [];
  const res = await fetch(`${storageBase()}/object/sign/${BUCKET}`, {
    method: 'POST', headers: { ...supabaseRequestHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: seconds, paths: list }),
  });
  if (!res.ok) { console.error('sign failed', res.status); return []; }
  const data = await res.json().catch(() => []);
  const base = env('SUPABASE_URL').replace(/\/$/, '') + '/storage/v1';
  return (data || []).map(x => (x.signedURL ? base + x.signedURL : null)).filter(Boolean);
}
export const photoPath = (orderId, kind) => `${nyToday()}/${String(orderId).replace(/[^A-Za-z0-9_-]/g, '')}/${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;

// ---------------------------------------------------------------- stops
export function addressFor(o, c) {
  if (o.address && typeof o.address === 'object') return o.address;
  const list = c?.addresses || [];
  return list.find(a => a.id === o.address || a.id === o.addressId) || list[0] || null;
}
export const addressText = a => a ? [a.street || a.line1 || a.building, a.apartment && !String(a.line1 || '').includes(a.apartment) ? `Apt ${a.apartment}` : '', a.postalCode || a.zip].filter(Boolean).join(', ') : '';
const isDelivery = o => o && (o.channel === 'delivery' || o.fulfillment === 'delivery');
export function scanCodes(o) {
  const digits = v => String(v || '').replace(/\D/g, '');
  const set = new Set([o.id, o.ticket, o.barcode, o.tagNumber, ...(o.tagNumbers || []), ...((o.subTickets || []).map(s => s.id))].filter(Boolean).map(v => String(v).toUpperCase().replace(/\s/g, '')));
  if (digits(o.ticket)) set.add('#' + digits(o.ticket).replace(/^0+/, ''));
  return [...set];
}
const baseDue = o => Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
function orderLine(o) {
  const paid = !!(o.paid || o.paymentStatus === 'paid');
  const due = paid ? 0 : r2(baseDue(o) + (o.pricing === 'card-price-v299' ? 0 : baseDue(o) * 0.03));
  return { id: o.id, ticket: String(o.ticket || o.id).replace(/^HC-/, ''), items: o.items || '', pieces: (o.lineItems || o.itemsDetail || []).reduce((s, l) => s + (l.serviceType === 'washfold' ? 1 : Math.max(1, Math.round(Number(l.qty) || 1))), 0), codes: scanCodes(o), paid, amountDue: due, status: o.status, rush: !!(o.rush || (o.tags || []).includes('rush')), notes: o.notes || '', services: o.services || [], window: o.window || '', pickupDate: o.pickupDate || '' };
}
// Everything this driver should see today.
export function routeFor(store, driverId) {
  const today = nyToday();
  const customers = new Map((store.customers || []).map(c => [String(c.id), c]));
  const deliveries = [], pickups = [], openPickups = [], done = [];
  for (const o of store.orders || []) {
    if (!isDelivery(o) || o.status === 'voided') continue;
    const mine = String(o.assignedDriverId || '') === String(driverId);
    if (o.status === 'delivered' || (o.status === 'picked_up' && o.pickedUpBy)) {
      const at = o.deliveredAt || o.pickedUpAt;
      if ((o.deliveredBy === driverId || o.pickedUpBy === driverId) && nyDay(at) === today) done.push(o);
      continue;
    }
    if (o.status === 'scheduled') {
      if (mine) pickups.push(o);
      else if (!o.assignedDriverId && (!o.pickupDate || o.pickupDate <= today)) openPickups.push(o);
      continue;
    }
    if (mine && o.driverRouteReady) deliveries.push(o);
  }
  const group = (list, kind) => {
    const stops = new Map();
    for (const o of list) {
      const c = customers.get(String(o.customerId)) || null;
      const a = addressFor(o, c);
      const key = `${kind}|${o.customerId || o.id}|${(a?.street || '').toLowerCase()}|${(a?.apartment || '').toLowerCase()}`;
      if (!stops.has(key)) {
        const card = (c?.paymentMethods || []).find(p => p.processor === 'clover');
        stops.set(key, {
          id: crypto.createHash('sha1').update(key).digest('hex').slice(0, 12), kind,
          customer: c ? { id: c.id, name: c.name || 'Customer', phone: c.phone || '', smsOn: !!c.smsConsent?.on, cardOnFile: card ? `${card.brand || 'Card'} •${card.last4 || ''}` : '' } : { name: o.customerName || 'Customer', phone: '' },
          address: a ? { street: a.street || a.line1 || '', apartment: a.apartment || '', zip: a.postalCode || a.zip || '', city: a.city || 'New York', state: a.state || 'NY', notes: a.notes || a.instructions || '', text: addressText(a) } : null,
          window: o.window || '', pickupDate: o.pickupDate || '', orders: [], prefs: c?.garmentPrefs || null,
        });
      }
      stops.get(key).orders.push(orderLine(o));
    }
    return [...stops.values()];
  };
  return {
    today,
    stops: [...group(pickups, 'pickup'), ...group(deliveries, 'delivery')],
    openPickups: group(openPickups, 'pickup'),
    done: done.slice(0, 50).map(o => ({ id: o.id, ticket: String(o.ticket || o.id).replace(/^HC-/, ''), kind: o.status === 'delivered' ? 'delivery' : 'pickup', at: o.deliveredAt || o.pickedUpAt, name: customers.get(String(o.customerId))?.name || '' })),
  };
}
// Orders this driver may act on right now (assigned to them, or an open pickup).
export function allowedOrders(store, driverId, ids, kind) {
  const set = new Set(ids.map(String));
  const today = nyToday();
  const out = (store.orders || []).filter(o => set.has(String(o.id)) && isDelivery(o) && o.status !== 'voided' && (
    kind === 'pickup'
      ? o.status === 'scheduled' && (String(o.assignedDriverId || '') === String(driverId) || (!o.assignedDriverId && (!o.pickupDate || o.pickupDate <= today)))
      : String(o.assignedDriverId || '') === String(driverId) && o.driverRouteReady && o.status !== 'delivered'
  ));
  if (out.length !== set.size) throw new HttpError(409, 'One of these tickets is no longer on your route. Pull down to refresh.');
  return out;
}

// Proof records for tickets, newest first, with short-lived photo links.
export async function proofsFor(orderIds, { kinds = ['delivery', 'pickup', 'attempt'], seconds = 3600, limit = 10 } = {}) {
  const out = [];
  for (const id of [...new Set(orderIds.map(String))].slice(0, 10)) {
    const rows = await selectRows('delivery_proofs', `store_id=eq.${encodeURIComponent(storeId())}&order_ids=cs.${encodeURIComponent('{"' + id.replace(/["\\{},]/g, '') + '"}')}&order=captured_at.desc&limit=${limit}`, '*');
    for (const r of rows || []) if (kinds.includes(r.kind) && !out.some(x => x.id === r.id)) out.push(r);
  }
  for (const r of out) r.photoUrls = await signedUrls(r.photos, seconds);
  return out.sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));
}
export const proofPublic = r => ({ id: r.id, kind: r.kind, at: r.captured_at, method: r.method, recipient: r.recipient, driver: String(r.driver_name || '').split(' ')[0], photos: r.photoUrls || [], gps: r.lat != null ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy } : null, reason: r.reason, bags: r.bags });
