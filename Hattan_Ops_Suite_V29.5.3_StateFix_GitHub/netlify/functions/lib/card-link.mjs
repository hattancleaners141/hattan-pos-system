// Signed "save your card" links texted to customers: /card/<token>
// token = base64url(customerId) . expiry (base36 seconds) . signature
// Signed with HATTAN_SESSION_SECRET so links can't be guessed or edited to reach another customer.
import crypto from 'node:crypto';
import { env, storeId, HttpError } from './shared.mjs';

export const CARD_LINK_DAYS = 7;

function secret() {
  const s = env('HATTAN_SESSION_SECRET');
  if (!s) throw new HttpError(503, 'Card links are not configured');
  return s;
}
const sign = (id, exp) => crypto.createHmac('sha256', secret()).update(`cardlink:${storeId()}:${id}:${exp}`).digest('base64url').slice(0, 22);

export function cardLinkToken(customerId, days = CARD_LINK_DAYS) {
  const exp = Math.floor(Date.now() / 1000 + days * 86400).toString(36);
  const id = Buffer.from(String(customerId)).toString('base64url');
  return `${id}.${exp}.${sign(String(customerId), exp)}`;
}

// Returns { customerId, sig } or throws a customer-friendly error.
export function readCardLink(token) {
  const [id, exp, sig] = String(token || '').split('.');
  if (!id || !exp || !sig) throw new HttpError(404, 'This link is not valid');
  let customerId;
  try { customerId = Buffer.from(id, 'base64url').toString('utf8'); } catch { throw new HttpError(404, 'This link is not valid'); }
  const want = sign(customerId, exp);
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(404, 'This link is not valid');
  if (parseInt(exp, 36) * 1000 < Date.now()) throw new HttpError(410, 'This link has expired');
  return { customerId, sig };
}

export const cardLinkUrl = (base, customerId) => `${base}/card/${cardLinkToken(customerId)}`;
