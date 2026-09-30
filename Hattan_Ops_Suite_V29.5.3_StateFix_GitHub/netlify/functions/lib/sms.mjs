// Hattan Cleaners text messaging (V29.11) — shared server logic.
// Messages are composed HERE from the latest shared store data, never from text sent by the
// browser (except manager-written store notices), so every text carries the shop name,
// STOP language, and only goes to customers who opted in.
import crypto from 'node:crypto';
import { env, storeId, selectRows, supabaseRest, HttpError } from './shared.mjs';

export const SHOP = {
  name: 'Hattan Cleaners',
  address: '141 3rd Ave',
  phone: '212-477-1740',
};
const STOP = 'Reply STOP to opt out.';

export const KINDS = ['optin', 'dropoff', 'ready', 'pickup', 'delivered', 'charged', 'declined', 'cardSaved', 'reminder', 'notice'];
// Kinds the shop can switch off in Texts → Automatic texts. (optin confirmation is always sent.)
export const DEFAULT_ENABLED = { dropoff: true, ready: true, pickup: true, delivered: true, charged: true, declined: true, cardSaved: true, reminder: true };

export function smsMode() {
  const m = env('SMS_MODE', 'off').toLowerCase();
  return ['off', 'test', 'live'].includes(m) ? m : 'off';
}
export function twilioConfigured() {
  return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_MESSAGING_SERVICE_SID'));
}
export function testNumbers() {
  return env('SMS_TEST_NUMBERS').split(/[,\s]+/).map(e164).filter(Boolean);
}

export function e164(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && /^[2-9]/.test(d)) return '+1' + d;
  if (d.length === 11 && d[0] === '1' && /^[2-9]/.test(d[1])) return '+' + d;
  return '';
}

// ---- store data -------------------------------------------------------------------------
export async function loadStore() {
  const rows = await selectRows('pos_state', `store_id=eq.${encodeURIComponent(storeId())}&limit=1`, 'payload');
  return rows?.[0]?.payload || {};
}
export function smsSettings(store) {
  const s = (store.interfaceSettings && store.interfaceSettings.sms) || {};
  return { enabled: { ...DEFAULT_ENABLED, ...(s.enabled || {}) } };
}

// ---- receipt links (signed, no database lookup table needed) ------------------------------
function receiptSecret() {
  const s = env('HATTAN_SESSION_SECRET');
  if (!s) throw new HttpError(503, 'Receipt links are not configured');
  return s;
}
export function receiptToken(orderId) {
  const id = Buffer.from(String(orderId)).toString('base64url');
  const sig = crypto.createHmac('sha256', receiptSecret()).update(`receipt:${storeId()}:${orderId}`).digest('base64url').slice(0, 16);
  return `${id}.${sig}`;
}
export function orderIdFromToken(token) {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig) return null;
  let orderId;
  try { orderId = Buffer.from(id, 'base64url').toString('utf8'); } catch { return null; }
  const want = receiptToken(orderId).split('.')[1];
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? orderId : null;
}
export function siteUrl(event) {
  const configured = env('PUBLIC_SITE_URL') || env('URL');
  if (configured) return configured.replace(/\/$/, '');
  const host = event?.headers?.host;
  return host ? `https://${host}` : 'https://hattan-ops-suite.netlify.app';
}
export const receiptUrl = (base, orderId) => `${base}/r/${receiptToken(orderId)}`;

// ---- helpers for message text (plain ASCII keeps each text to the cheaper GSM encoding) ----
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const usd = n => '$' + r2(n).toFixed(2);
export function firstName(c) {
  const raw = String(c?.firstName || c?.name || '').trim();
  if (!raw || /[#\d@]/.test(raw)) return '';
  const part = raw.includes(',') ? raw.split(',')[1].trim().split(/\s+/)[0] : raw.split(/\s+/)[0];
  if (!part || part.length < 2) return '';
  return part[0].toUpperCase() + part.slice(1).toLowerCase();
}
export function ascii(s) {
  return String(s || '')
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ')
    .replace(/[^\x0A\x20-\x7E]/g, '').replace(/[ \t]+/g, ' ').trim();
}
const ticketNo = o => String(o.ticket || o.id || '').replace(/^HC-/, '');
const ticketList = orders => orders.length === 1 ? `order #${ticketNo(orders[0])}` : `orders ${orders.map(o => '#' + ticketNo(o)).join(', ')}`;
function itemCount(o) {
  const lines = o.lineItems || o.itemsDetail || [];
  const n = lines.reduce((s, l) => s + (l.serviceType === 'washfold' ? 1 : Math.max(1, Math.round(Number(l.qty) || 1))), 0);
  return n || Number(o.pieces || 0) || 0;
}
function dueLabel(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return '';
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${wd} ${+m[2]}/${+m[3]}`;
}
export const baseDue = o => Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
const cardPriced = o => o.pricing === 'card-price-v299';
function amountDueText(o) {
  if (o.paid || o.paymentStatus === 'paid') return '';
  const card = baseDue(o) + (cardPriced(o) ? 0 : r2(baseDue(o) * 0.03));
  if (card <= 0) return '';
  if (!cardPriced(o)) return ` Amount due: ${usd(baseDue(o))} cash.`;
  const ratio = Number(o.total) > 0 && o.cashPrice != null ? Number(o.cashPrice) / Number(o.total) : 0.97;
  return ` Amount due: ${usd(card)} (${usd(card * ratio)} cash).`;
}

// ---- compose ------------------------------------------------------------------------------
export function compose(kind, ctx) {
  const { customer, orders = [], links = [], charge, card, text, readySince } = ctx;
  const fn = firstName(customer);
  const hi = fn ? `, ${fn}` : '';
  const link = links.length === 1 ? ` Receipt: ${links[0]}` : '';
  let msg;
  switch (kind) {
    case 'optin':
      msg = `You're signed up for order updates by text. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
      return `${SHOP.name}: ${msg}`;
    case 'dropoff': {
      const due = orders.length === 1 ? dueLabel(orders[0].dueDate) : '';
      const n = orders.reduce((s, o) => s + itemCount(o), 0);
      msg = `Thanks for dropping off${hi}! ${ticketList(orders)[0].toUpperCase()}${ticketList(orders).slice(1)}${n ? ` (${n} item${n === 1 ? '' : 's'})` : ''} ${due ? `will be ready ${due}.` : `is in. We'll text you when it's ready.`}`;
      if (charge) msg += ` Charged ${usd(charge.amount)} to card ending ${charge.last4}.`;
      msg += link;
      break;
    }
    case 'ready': {
      const del = orders.every(o => o.fulfillment === 'delivery');
      msg = del
        ? `Hi${fn ? ' ' + fn : ''}, your ${ticketList(orders)} ${orders.length === 1 ? 'is' : 'are'} ready and will be delivered soon.`
        : `Hi${fn ? ' ' + fn : ''}, your ${ticketList(orders)} ${orders.length === 1 ? 'is' : 'are'} ready for pickup at ${SHOP.address}.${orders.length === 1 ? amountDueText(orders[0]) : ''}`;
      msg += link;
      break;
    }
    case 'pickup':
      msg = `Thanks for picking up ${ticketList(orders)}${hi}! See you next time.${link}`;
      break;
    case 'delivered': {
      const how = ctx.method ? ` (${String(ctx.method).toLowerCase()})` : '';
      const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
      msg = `Your ${ticketList(orders)} ${orders.length === 1 ? 'was' : 'were'} delivered${how} at ${t}. Thank you${hi}!${links.length === 1 ? ` Delivery photo & receipt: ${links[0]}` : ''}`;
      break;
    }
    case 'charged':
      msg = `Your card ending ${charge.last4} was charged ${usd(charge.amount)} for ${ticketList(orders)}.${link}`;
      break;
    case 'declined':
      msg = `We couldn't charge your card${charge?.last4 ? ' ending ' + charge.last4 : ''} for ${ticketList(orders)}${charge?.amount ? ` (${usd(charge.amount)})` : ''}. Please call ${SHOP.phone} or pay at pickup.`;
      break;
    case 'cardSaved':
      msg = `Your ${card.brand ? card.brand + ' ' : ''}card ending ${card.last4} is saved on file for your orders. To change or remove it, call ${SHOP.phone} or ask at the counter.`;
      break;
    case 'reminder':
      msg = `Reminder${hi}: your ${ticketList(orders)} ${orders.length === 1 ? 'has' : 'have'} been ready since ${readySince}. Please pick up at ${SHOP.address}. Questions? ${SHOP.phone}.`;
      break;
    case 'notice':
      msg = String(text || '');
      break;
    default:
      throw new HttpError(400, 'Unknown text type');
  }
  return ascii(`${SHOP.name}: ${msg} ${STOP}`);
}

// ---- consent / opt-out --------------------------------------------------------------------
export async function optRow(phone) {
  const rows = await selectRows('sms_optouts', `store_id=eq.${encodeURIComponent(storeId())}&phone=eq.${encodeURIComponent(phone)}&limit=1`, '*');
  return rows?.[0] || null;
}
// A customer can be texted when staff recorded their yes (or they texted START), and they
// have not replied STOP since.
export async function consentFor(customer) {
  const phone = e164(customer?.smsConsent?.phone || customer?.phone);
  if (!phone) return { ok: false, phone: '', reason: 'No valid mobile number' };
  const row = await optRow(phone);
  if (row?.opted_out) return { ok: false, phone, reason: 'Customer replied STOP', optedOut: true };
  const consented = !!(customer?.smsConsent?.on && e164(customer.smsConsent.phone || customer.phone) === phone);
  if (!consented && !(row && row.opted_out === false)) return { ok: false, phone, reason: 'No text consent on file' };
  return { ok: true, phone };
}
export async function setOptOut(phone, optedOut, source) {
  return supabaseRest('sms_optouts?on_conflict=store_id,phone', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ store_id: storeId(), phone, opted_out: !!optedOut, source: String(source || '').slice(0, 40), updated_at: new Date().toISOString() }]),
  });
}

// ---- log / dedupe -------------------------------------------------------------------------
// Claim a dedupe key. Returns the new row, or null if this text was already sent/claimed.
export async function claim(key, fields) {
  const rows = await supabaseRest('sms_log?on_conflict=store_id,dedupe_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify([{ store_id: storeId(), dedupe_key: key, direction: 'out', status: 'claimed', ...fields }]),
  });
  return rows?.[0] || null;
}
export async function logUpdate(id, values) {
  return supabaseRest(`sms_log?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(values) });
}
export async function logInsert(row) {
  return supabaseRest('sms_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ store_id: storeId(), ...row }]) });
}

// ---- Twilio -------------------------------------------------------------------------------
export async function twilioSend(to, body, event) {
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN');
  const form = new URLSearchParams({ To: to, Body: body, MessagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID') });
  const base = siteUrl(event);
  if (/^https:/.test(base)) form.set('StatusCallback', `${base}/.netlify/functions/sms-inbound`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) return { ok: false, code: data?.code, error: data?.message || `Twilio error ${res.status}` };
  return { ok: true, sid: data.sid, status: data.status };
}

// Twilio request signature check (X-Twilio-Signature).
export function twilioSignatureValid(url, params, signature) {
  const token = env('TWILIO_AUTH_TOKEN');
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const want = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(want), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- the one send path every text goes through ---------------------------------------------
// keys: dedupe keys (first is the message's own row; others are marked "merged").
export async function deliver({ keys, kind, customer, orderIds = [], body, sentBy, event }) {
  const mode = smsMode();
  if (mode === 'off') return { ok: true, skipped: 'Texting is off (SMS_MODE)' };
  if (!twilioConfigured()) return { ok: true, skipped: 'Twilio is not set up yet' };
  const consent = await consentFor(customer);
  if (!consent.ok) return { ok: true, skipped: consent.reason, optedOut: !!consent.optedOut };
  if (mode === 'test' && !testNumbers().includes(consent.phone)) return { ok: true, skipped: 'Test mode: number not on the test list' };
  const base = { kind, customer_id: String(customer.id || ''), order_ids: orderIds.join(','), to_phone: consent.phone, sent_by: sentBy || null };
  const first = await claim(keys[0], { ...base, body });
  if (!first) return { ok: true, skipped: 'Already sent', duplicate: true };
  for (const k of keys.slice(1)) { try { const r = await claim(k, { ...base, body: null }); if (r) await logUpdate(r.id, { status: 'merged' }); } catch (_) { /* best effort */ } }
  const sent = await twilioSend(consent.phone, body, event);
  if (!sent.ok) {
    await logUpdate(first.id, { status: 'failed', error_message: String(sent.error || '').slice(0, 300) });
    // 21610 = the number replied STOP to this sender.
    if (Number(sent.code) === 21610) { try { await setOptOut(consent.phone, true, 'twilio-21610'); } catch (_) {} return { ok: false, optedOut: true, error: 'Customer has opted out' }; }
    return { ok: false, error: sent.error };
  }
  await logUpdate(first.id, { status: sent.status || 'queued', twilio_sid: sent.sid });
  return { ok: true, sent: true, sid: sent.sid, to: consent.phone.slice(-4) };
}
