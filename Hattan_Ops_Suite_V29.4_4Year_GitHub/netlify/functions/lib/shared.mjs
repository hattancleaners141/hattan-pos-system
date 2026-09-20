import crypto from 'node:crypto';

const SESSION_COOKIE = 'hattan_session';
// A full counter shift. The session endpoint renews this securely on reload,
// so refreshing the browser does not unexpectedly return staff to sign-in.
const SESSION_SECONDS = 12 * 60 * 60;

export function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

export function storeId() {
  return env('HATTAN_STORE_ID', 'main');
}

export function json(statusCode, value, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
    body: JSON.stringify(value),
  };
}

export function methodNotAllowed(allowed = 'GET') {
  return json(405, { ok: false, error: 'Method not allowed' }, { Allow: allowed });
}

export function parseBody(event) {
  if (!event?.body) return {};
  try { return JSON.parse(event.body); }
  catch { throw new HttpError(400, 'Request body must be valid JSON'); }
}

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function handleError(error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(error);
  return json(status, {
    ok: false,
    error: status >= 500 ? 'The secure server could not complete that request.' : String(error?.message || 'Request failed'),
    ...(status < 500 && error?.details ? { details: error.details } : {}),
  });
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const one = Buffer.from(String(a));
  const two = Buffer.from(String(b));
  return one.length === two.length && crypto.timingSafeEqual(one, two);
}

export function hashPin(pin, salt = crypto.randomBytes(16).toString('base64url')) {
  const normalized = String(pin || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(normalized)) throw new HttpError(400, 'PIN must be exactly 4 digits');
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(normalized, salt, iterations, 32, 'sha256').toString('base64url');
  return { salt, hash, iterations };
}

export function verifyPin(pin, record) {
  const candidate = crypto.pbkdf2Sync(String(pin || ''), record.pin_salt, Number(record.pin_iterations || 210000), 32, 'sha256').toString('base64url');
  return safeEqual(candidate, record.pin_hash);
}

export function createSession(staff) {
  const secret = env('HATTAN_SESSION_SECRET');
  if (secret.length < 32) throw new HttpError(503, 'HATTAN_SESSION_SECRET must contain at least 32 characters');
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: staff.id,
    name: staff.display_name,
    role: staff.manager ? 'manager' : 'staff',
    storeId: staff.store_id || storeId(),
    iat: now,
    exp: now + SESSION_SECONDS,
  }));
  return `${payload}.${hmac(payload, secret)}`;
}

export function sessionCookie(token) {
  const secure = env('CONTEXT') === 'dev' ? '' : '; Secure';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = env('CONTEXT') === 'dev' ? '' : '; Secure';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(event, name) {
  const source = String(event?.headers?.cookie || event?.headers?.Cookie || '');
  const row = source.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : '';
}

export function readSession(event) {
  const token = cookieValue(event, SESSION_COOKIE);
  const secret = env('HATTAN_SESSION_SECRET');
  if (!token || !secret) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, hmac(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000) || data.storeId !== storeId()) return null;
    return data;
  } catch {
    return null;
  }
}

export function requireSession(event, manager = false) {
  const session = readSession(event);
  if (!session) throw new HttpError(401, 'Staff sign-in is required');
  if (manager && session.role !== 'manager') throw new HttpError(403, 'Manager access is required');
  return session;
}

export function createRealtimeJwt(session) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const claims = base64url(JSON.stringify({
      iss: 'hattan-ops',
      aud: 'authenticated',
      role: 'authenticated',
      hattan_staff_id: session.sub,
      store_id: session.storeId,
      iat: now,
      exp: now + 60 * 60,
    }));

    const privateJwk = realtimePrivateJwk();
    if (privateJwk) {
      const kid = env('SUPABASE_JWT_KID', privateJwk.kid);
      const header = base64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
      const unsigned = `${header}.${claims}`;
      const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
      const signature = crypto.sign('sha256', Buffer.from(unsigned), {
        key,
        dsaEncoding: 'ieee-p1363',
      });
      return `${unsigned}.${base64url(signature)}`;
    }

    // Temporary compatibility path for projects that have not yet migrated
    // from Supabase's legacy shared JWT secret.
    const legacySecret = env('SUPABASE_JWT_SECRET');
    if (!legacySecret) return '';
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const unsigned = `${header}.${claims}`;
    return `${unsigned}.${hmac(unsigned, legacySecret)}`;
  } catch (error) {
    // A Realtime configuration mistake must not lock staff out of the POS.
    // The browser will safely fall back to its authenticated five-second sync.
    console.error('Supabase Realtime signing configuration is invalid:', error?.message || error);
    return '';
  }
}

function realtimePrivateJwk() {
  const raw = env('SUPABASE_JWT_PRIVATE_JWK');
  if (!raw) return null;
  let key;
  try { key = JSON.parse(raw); }
  catch { throw new Error('SUPABASE_JWT_PRIVATE_JWK must be valid JSON'); }
  const kid = env('SUPABASE_JWT_KID', key?.kid);
  if (key?.kty !== 'EC' || key?.crv !== 'P-256' || !key?.d || !key?.x || !key?.y || !kid) {
    throw new Error('SUPABASE_JWT_PRIVATE_JWK must be a private P-256 key with a matching kid');
  }
  return { ...key, kid };
}

export function supabaseRealtimeConfigured() {
  if (!env('SUPABASE_URL') || !env('SUPABASE_PUBLISHABLE_KEY', env('SUPABASE_ANON_KEY'))) return false;
  if (env('SUPABASE_JWT_SECRET')) return true;
  try { return !!realtimePrivateJwk(); }
  catch { return false; }
}

export function supabaseRealtimeMode() {
  try {
    if (realtimePrivateJwk()) return 'es256';
  } catch { return 'invalid'; }
  if (env('SUPABASE_JWT_SECRET')) return 'legacy';
  return 'polling';
}

export function staffSafe(row) {
  return {
    id: row.id,
    name: row.display_name,
    displayName: row.display_name,
    initials: row.initials,
    manager: !!row.manager,
    role: row.manager ? 'Manager' : '',
    active: row.active !== false,
  };
}

export function requestIp(event) {
  return String(
    event?.headers?.['x-nf-client-connection-ip'] ||
    event?.headers?.['x-forwarded-for'] ||
    event?.headers?.['client-ip'] ||
    '127.0.0.1'
  ).split(',')[0].trim();
}

export function assertSameOrigin(event) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(event?.httpMethod || '').toUpperCase())) return;
  const origin = String(event?.headers?.origin || '');
  const host = String(event?.headers?.host || '');
  if (origin && host) {
    const originHost = new URL(origin).host;
    if (originHost !== host) throw new HttpError(403, 'Cross-site request blocked');
  }
}

export function supabaseConfigured() {
  return !!(env('SUPABASE_URL') && supabaseServerKey());
}

export function supabaseServerKey() {
  return env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY'));
}

export function supabaseRequestHeaders(key = supabaseServerKey()) {
  const headers = { apikey: key };
  // Modern sb_secret keys are opaque API keys and must not be sent as a
  // Bearer token. Legacy service_role keys are JWTs and still use both.
  if (key && !key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function supabaseRest(path, options = {}) {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = supabaseServerKey();
  if (!url || !key) throw new HttpError(503, 'Supabase server settings are incomplete');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseRequestHeaders(key),
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) {
    const message = data?.message || data?.hint || `Database request failed (${response.status})`;
    throw new HttpError(response.status >= 500 ? 503 : 400, message);
  }
  return data;
}

export async function selectRows(table, filters = '', select = '*') {
  const joiner = filters ? '&' : '';
  return supabaseRest(`${table}?${filters}${joiner}select=${encodeURIComponent(select)}`, { method: 'GET' });
}

export async function insertRows(table, rows, prefer = 'return=representation') {
  return supabaseRest(table, {
    method: 'POST',
    headers: { Prefer: prefer },
    body: JSON.stringify(rows),
  });
}

export async function updateRows(table, filters, values) {
  return supabaseRest(`${table}?${filters}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(values),
  });
}

export function cloverConfigured() {
  return !!(env('CLOVER_PUBLIC_TOKEN') && env('CLOVER_PRIVATE_TOKEN') && env('CLOVER_MERCHANT_ID'));
}

export function cloverBaseUrl() {
  return env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production'
    ? 'https://scl.clover.com'
    : 'https://scl-sandbox.dev.clover.com';
}

export async function cloverRequest(path, options = {}, event = null) {
  const token = env('CLOVER_PRIVATE_TOKEN');
  if (!token) throw new HttpError(503, 'Clover private token is not configured on the server');
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HattanOps/16.1',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(event ? { 'x-forwarded-for': requestIp(event) } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${cloverBaseUrl()}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) {
    const message = data?.message || data?.error?.message || data?.code || `Clover request failed (${response.status})`;
    const status = response.status === 401 || response.status >= 500 ? 503 : 400;
    throw new HttpError(status, message, {
      processorStatus:response.status,
      ...(data?.decline_code ? { declineCode:data.decline_code } : {}),
    });
  }
  return data;
}

export function safePaymentResponse(data) {
  return {
    id: data?.id || null,
    status: data?.status || null,
    paid: data?.paid === true || data?.status === 'succeeded',
    amount: Number(data?.amount || 0),
    currency: data?.currency || 'usd',
    brand: data?.source?.brand || null,
    last4: data?.source?.last4 || null,
    created: data?.created || null,
    authCode: data?.auth_code || null,
    reference: data?.ref_num || null,
  };
}

export function randomId(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}
