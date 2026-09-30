// Hattan Cleaners customer app — shared server logic.
// Customers sign in with an emailed code. Their session only ever unlocks THEIR customer
// record and tickets; the app never receives the shared store data.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, storeId, selectRows, insertRows, updateRows, supabaseRest, HttpError } from './shared.mjs';
import { receiptUrl, siteUrl } from './sms.mjs';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sid = () => encodeURIComponent(storeId());
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const APP_COOKIE = 'hattan_app';
const APP_SESSION_DAYS = 60;

export const SHOP = {
  name: 'Hattan Cleaners', address: '141 3rd Avenue, New York, NY 10003', phone: '(212) 477-1740', tel: '+12124771740',
  hours: 'Mon–Fri 8am–6pm · Sat 9am–4pm · Sun closed',
};
export const TIME_WINDOWS = {
  weekday: ['8:00 – 10:00 AM', '10:00 AM – 12:00 PM', '12:00 – 2:00 PM', '2:00 – 4:00 PM', '4:00 – 6:00 PM'],
  saturday: ['9:00 – 11:00 AM', '11:00 AM – 1:00 PM', '1:00 – 4:00 PM'],
};
// Window end hour (24h) so today's past windows are hidden.
const WINDOW_END = { '8:00 – 10:00 AM': 10, '10:00 AM – 12:00 PM': 12, '12:00 – 2:00 PM': 14, '2:00 – 4:00 PM': 16, '4:00 – 6:00 PM': 18, '9:00 – 11:00 AM': 11, '11:00 AM – 1:00 PM': 13, '1:00 – 4:00 PM': 16 };
export const SERVICES = [
  { id: 'drycleaning', name: 'Dry Cleaning', desc: 'Suits, dresses, coats & delicates' },
  { id: 'washfold', name: 'Wash & Fold', desc: 'Everyday laundry, washed & folded' },
  { id: 'shirts', name: 'Shirt Laundry', desc: 'Pressed shirts, hung or boxed' },
  { id: 'household', name: 'Household Items', desc: 'Comforters, blankets & drapes' },
  { id: 'alterations', name: 'Tailoring & Alterations', desc: 'Repairs, hems & fit adjustments' },
];
export const TAGS = [
  { id: 'starch', label: 'Extra starch' }, { id: 'nohangers', label: 'Eco box, no hangers' },
  { id: 'fragrancefree', label: 'Fragrance-free detergent' }, { id: 'separate', label: 'Separate darks / lights' },
];
export const REWARDS = [
  { id: 'r1', title: '$5 off your next order', sub: 'Added to your store credit', cost: 250, value: 5 },
  { id: 'r2', title: 'Free shirt laundry', sub: 'Up to 5 shirts — $16.25 store credit', cost: 500, value: 16.25 },
  { id: 'r3', title: 'Free rush service', sub: '$10 store credit', cost: 750, value: 10 },
  { id: 'r4', title: 'Free wash & fold bag', sub: 'Up to 15 lb — $14.40 store credit', cost: 1200, value: 14.40 },
  { id: 'r5', title: 'Free comforter cleaning', sub: 'Any size — $55.95 store credit', cost: 2000, value: 55.95 },
];
export const TIERS = [{ id: 'bronze', name: 'Bronze', min: 0 }, { id: 'silver', name: 'Silver', min: 500 }, { id: 'gold', name: 'Gold', min: 1500 }];

// ---------------------------------------------------------------- sessions
function secret() {
  const s = env('HATTAN_SESSION_SECRET');
  if (!s) throw new HttpError(503, 'The app is not configured yet');
  return s;
}
const sign = v => crypto.createHmac('sha256', secret()).update('app:' + v).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function appCookie(accountId, epoch = 0) {
  const exp = Math.floor(Date.now() / 1000) + APP_SESSION_DAYS * 86400;
  const payload = Buffer.from(JSON.stringify({ aid: accountId, exp, st: storeId(), ep: Number(epoch || 0) })).toString('base64url');
  return `${APP_COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${APP_SESSION_DAYS * 86400}`;
}
export const clearAppCookie = () => `${APP_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function readAppCookie(event) {
  const raw = String(event?.headers?.cookie || event?.headers?.Cookie || '');
  const v = raw.split(';').map(s => s.trim()).find(s => s.startsWith(APP_COOKIE + '='));
  if (!v) return null;
  const [payload, sig] = v.slice(APP_COOKIE.length + 1).split('.');
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d.aid || d.exp < Date.now() / 1000 || d.st !== storeId()) return null;
    return d;
  } catch { return null; }
}
export async function requireAccount(event) {
  const s = readAppCookie(event);
  if (!s) throw new HttpError(401, 'Please sign in');
  const rows = await selectRows('app_accounts', `store_id=eq.${sid()}&id=eq.${encodeURIComponent(s.aid)}&limit=1`, '*');
  const a = rows?.[0];
  if (!a || a.status === 'deleted' || Number(a.session_epoch || 0) !== Number(s.ep || 0)) throw new HttpError(401, 'Please sign in');
  // Only a confirmed (linked) account may act on a customer record.
  if (a.status !== 'linked') a.customer_id = null;
  return a;
}
export async function updateAccount(id, values) {
  return updateRows('app_accounts', `store_id=eq.${sid()}&id=eq.${encodeURIComponent(id)}`, values);
}

// ---------------------------------------------------------------- email codes
export const normEmail = e => String(e || '').trim().toLowerCase();
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
export const isPlaceholderEmail = e => /^hattancleaners141\+c[^@]*@gmail\.com$/i.test(String(e || ''));
export const codeHash = (email, code) => crypto.createHmac('sha256', secret()).update(`code:${storeId()}:${email}:${code}`).digest('hex');
export const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

export async function sendLoginEmail(email, code) {
  const subject = `${code} is your Hattan Cleaners sign-in code`;
  const text = `Your Hattan Cleaners sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.\n\nHattan Cleaners · 141 3rd Avenue, New York, NY · (212) 477-1740`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#171a17">
<div style="font-family:Georgia,serif;font-size:20px;color:#123d2b;margin-bottom:16px">Hattan Cleaners</div>
<p style="margin:0 0 8px">Your sign-in code is</p>
<div style="font-size:34px;font-weight:700;letter-spacing:6px;color:#123d2b;margin:4px 0 16px">${code}</div>
<p style="margin:0 0 16px;color:#565f57">It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>
<p style="margin:0;color:#8a9089;font-size:12px">Hattan Cleaners · 141 3rd Avenue, New York, NY · (212) 477-1740</p></div>`;
  if (env('EMAIL_MODE') === 'log') { console.log(`[email:log] to=${email} code=${code}`); return { ok: true, logged: true }; }
  // Option 1: a Gmail (or other) mailbox with an app password — SMTP_USER / SMTP_PASS.
  if (env('SMTP_USER') && env('SMTP_PASS')) {
    const { default: nodemailer } = await import('nodemailer');
    const t = nodemailer.createTransport({ host: env('SMTP_HOST', 'smtp.gmail.com'), port: Number(env('SMTP_PORT', '465')), secure: env('SMTP_PORT', '465') === '465', auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') } });
    try { await t.sendMail({ from: env('EMAIL_FROM', `Hattan Cleaners <${env('SMTP_USER')}>`), to: email, subject, text, html }); }
    catch (e) { console.error('smtp send failed', e.message); throw new HttpError(502, 'We could not send the email. Please try again.'); }
    return { ok: true };
  }
  // Option 2: Resend (resend.com) — RESEND_API_KEY.
  const key = env('RESEND_API_KEY');
  if (!key) throw new HttpError(503, 'Email sign-in is not set up yet. Please call us at (212) 477-1740.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM', 'Hattan Cleaners <app@hattancleaners.com>'), to: [email], subject, text, html }),
  });
  if (!res.ok) { console.error('email send failed', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'We could not send the email. Please try again.'); }
  return { ok: true };
}

// ---------------------------------------------------------------- store read / write
export async function readStore() {
  const rows = await selectRows('pos_state', `store_id=eq.${sid()}&limit=1`, 'version,payload');
  return { version: Number(rows?.[0]?.version || 0), payload: rows?.[0]?.payload || {} };
}
// Safely change the shared store data. Uses the same versioned save as the POS, so a POS
// device that is mid-edit merges these changes instead of overwriting them.
export async function mutateStore(fn) {
  for (let i = 0; i < 6; i++) {
    const { version, payload } = await readStore();
    const draft = structuredClone(payload);
    const out = await fn(draft);
    if (out && out.__noWrite) return out.value;
    const res = await supabaseRest('rpc/hattan_sync_state', {
      method: 'POST',
      body: JSON.stringify({ p_store_id: storeId(), p_base_version: version, p_payload: draft, p_staff_id: 'customer-app', p_client_id: 'customer-app' }),
    });
    if (!res?.conflict) return out;
    await sleep(120 * (i + 1));
  }
  throw new HttpError(503, 'The shop system is busy. Please try again.');
}
export const noWrite = value => ({ __noWrite: true, value });

// ---------------------------------------------------------------- legacy (CleanBase) directory
// Netlify bundles functions as CommonJS, where import.meta.url is empty — fall back safely.
const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch (_) { return typeof __dirname !== 'undefined' ? __dirname : process.cwd(); } })();
let dirCache = null;
export function legacyDirectory() {
  if (dirCache) return dirCache;
  const rel = 'legacy-v296/customer-directory.json';
  const roots = [process.cwd(), path.join(process.cwd(), 'Hattan_Ops_Suite_V29.5.3_StateFix_GitHub'), process.env.LAMBDA_TASK_ROOT || '', path.join(process.env.LAMBDA_TASK_ROOT || '', 'Hattan_Ops_Suite_V29.5.3_StateFix_GitHub'), path.resolve(here, '..', '..', '..'), path.resolve(here, '..', '..', '..', '..')];
  for (const root of roots.filter(Boolean)) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const f = d.meta?.fields || d.fields || ['legacyId', 'customerNumber', 'last', 'first', 'street', 'apt', 'city', 'state', 'zip', 'phone'];
      const ix = Object.fromEntries(f.map((k, i) => [k, i]));
      dirCache = (d.rows || []).map(a => ({ legacyId: a[ix.legacyId], num: String(a[ix.customerNumber] ?? ''), last: a[ix.last] || '', first: a[ix.first] || '', phone: String(a[ix.phone] || '').replace(/\D/g, '').slice(-10) }));
      return dirCache;
    } catch (_) { /* next */ }
  }
  dirCache = [];
  return dirCache;
}
export const digits10 = p => String(p || '').replace(/\D/g, '').slice(-10);

// ---------------------------------------------------------------- views
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'HC';
export const tierFor = pts => { let t = TIERS[0]; for (const x of TIERS) if (pts >= x.min) t = x; return t; };
const nextTierFor = pts => TIERS.find(t => t.min > pts) || null;
export function addressView(a) {
  return { id: a.id, label: a.label || 'Home', street: a.street || a.line1 || '', apartment: a.apartment || a.apt || '', city: a.city || 'New York', state: a.state || 'NY', zip: a.postalCode || a.zip || '', notes: a.notes || a.instructions || '' };
}
export function customerView(c) {
  const pts = Math.max(0, Math.round(Number(c.points || 0)));
  const name = String(c.name || '').trim();
  return {
    id: c.id, name, firstName: name.split(/\s+/)[0] || '', initials: c.initials || initials(name), email: isPlaceholderEmail(c.email) ? '' : (c.email || ''),
    phone: c.phone || '', customerNumber: c.customerNumber || '', memberSince: c.memberSince || '',
    points: pts, storeCredit: r2(c.storeCredit || 0), tier: tierFor(pts), nextTier: nextTierFor(pts),
    addresses: (c.addresses || []).map(addressView),
    garmentPrefs: { starch: 'light', fold: 'hang', fragranceFree: false, notes: '', ...(c.garmentPrefs || {}) },
    smsOn: !!c.smsConsent?.on,
  };
}
const cardPriced = o => o.pricing === 'card-price-v299';
export const baseDue = o => Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
export const cardFee = o => (cardPriced(o) ? 0 : r2(baseDue(o) * 0.03));
function lineAmount(l) {
  let cash = Number(l.unitPrice || 0) * Number(l.qty || 0);
  if (l.pricingVersion === 'flat-upcharge-v17') cash += Number(l.materialUpcharge || 0);
  cash = r2(cash);
  return l.cardPrice ? r2(cash / 0.97) : cash;
}
const STAGES = {
  counter: ['dropped_off', 'in_cleaning', 'ready', 'picked_up'],
  delivery: ['scheduled', 'picked_up', 'in_cleaning', 'ready', 'out_for_delivery', 'delivered'],
};
export function orderView(o, store, base, paidTx) {
  const garments = store.garmentCatalog || [];
  const channel = o.channel === 'delivery' ? 'delivery' : 'counter';
  const stages = STAGES[channel];
  let status = String(o.status || (channel === 'delivery' ? 'scheduled' : 'dropped_off'));
  if (status === 'quality_check') status = 'in_cleaning';
  const stageIndex = Math.max(0, stages.indexOf(status));
  const paid = !!(o.paid || o.paymentStatus === 'paid' || paidTx);
  const due = paid ? 0 : baseDue(o);
  const ratio = Number(o.total) > 0 && o.cashPrice != null ? Number(o.cashPrice) / Number(o.total) : 0.97;
  const lines = (o.lineItems || o.itemsDetail || []).map(l => {
    const g = garments.find(x => x.id === l.garmentId);
    const label = l.serviceType === 'alterations' && l.garmentNote ? String(l.garmentNote).split(' · ').slice(0, 2).join(' · ') : (g?.name || l.name || 'Item');
    return { label, qty: l.serviceType === 'washfold' ? `${Number(l.qty)} lb` : String(Number(l.qty) || 1), amount: lineAmount(l) };
  });
  const done = status === (channel === 'delivery' ? 'delivered' : 'picked_up');
  return {
    id: o.id, ticket: String(o.ticket || '').replace(/^HC-/, '') || String(o.id).replace(/^HC-/, ''), channel, status, stageIndex, stages, done,
    items: o.items || o.services?.join(', ') || 'Order', services: o.services || [], lines,
    total: r2(o.total), discount: r2(o.discount), storeCreditApplied: r2(o.storeCreditApplied),
    paid, paidAt: o.paidAt || paidTx?.created_at || null,
    paymentMethod: String(o.paymentMethod || (paidTx ? `Card •${paidTx.last4 || ''}` : '')).replace(/Clover card on file/i, 'Card on file'),
    amountDue: due ? r2(due + cardFee(o)) : 0, amountDueCash: due ? r2(cardPriced(o) ? due * ratio : due) : 0,
    cardPriced: cardPriced(o), priced: Number(o.total || 0) > 0,
    canPay: !paid && due > 0 && !o.legacy && o.status !== 'voided' && Number(o.total || 0) > 0,
    dueDate: o.dueDate || '', createdAt: o.createdAt || '', readyAt: o.readyAt || '',
    pickupDate: o.pickupDate || '', window: o.window || '', address: o.address && typeof o.address === 'object' ? addressView(o.address) : null,
    notes: o.notes || '', rush: !!(o.rush || (o.tags || []).includes('rush')), rack: o.rack || '',
    canCancel: channel === 'delivery' && status === 'scheduled' && !!o.appRequested,
    receiptUrl: o.legacy ? '' : receiptUrl(base, o.id),
    legacy: !!o.legacy,
  };
}
export async function paidTransactions(orderIds) {
  if (!orderIds.length) return new Map();
  const list = orderIds.map(i => `"${String(i).replace(/["\\]/g, '')}"`).join(',');
  const rows = await selectRows('payment_transactions', `store_id=eq.${sid()}&order_id=in.${encodeURIComponent('(' + list + ')')}&type=eq.charge&status=eq.succeeded`, 'order_id,last4,brand,amount_cents,created_at');
  return new Map((rows || []).map(r => [r.order_id, r]));
}
export async function vaultCard(customerId) {
  const rows = await selectRows('payment_vault', `store_id=eq.${sid()}&customer_id=eq.${encodeURIComponent(customerId)}&active=eq.true&limit=1`, '*');
  return rows?.[0] || null;
}
export { siteUrl };
