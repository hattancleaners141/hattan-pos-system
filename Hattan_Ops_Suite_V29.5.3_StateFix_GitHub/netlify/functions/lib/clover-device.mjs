// Clover Flex (semi-integration / Cloud Pay Display) — shared server logic.
// The POS sends a sale to the Flex through Clover's cloud; the OAuth token for the Flex app is kept
// only in Supabase (table clover_device_auth) and handed to signed-in staff for one payment session.
import { env, selectRows, storeId, supabaseRest, HttpError } from './shared.mjs';

export function deviceEnv() {
  return env('CLOVER_DEVICE_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
}
export function deviceConfig() {
  const prod = deviceEnv() === 'production';
  return {
    environment: prod ? 'production' : 'sandbox',
    appId: env('CLOVER_APP_ID', prod ? '' : 'RS6K7C43HHV1T'),
    raid: env('CLOVER_RAID', prod ? '' : '6JFADKZSMBV04.RS6K7C43HHV1T'),
    secret: env('CLOVER_APP_SECRET'),
    web: prod ? 'https://www.clover.com' : 'https://sandbox.dev.clover.com',
    api: prod ? 'https://api.clover.com' : 'https://apisandbox.dev.clover.com',
    cloverServer: prod ? 'https://www.clover.com/' : 'https://sandbox.dev.clover.com/',
  };
}
export const deviceConfigured = () => { const c = deviceConfig(); return !!(c.appId && c.raid && c.secret); };

const table = 'clover_device_auth';
const sid = () => encodeURIComponent(storeId());

export async function readAuth() {
  const rows = await selectRows(table, `store_id=eq.${sid()}&limit=1`, '*');
  return rows?.[0] || null;
}
export async function saveAuth(values) {
  return supabaseRest(`${table}?on_conflict=store_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ store_id: storeId(), ...values, updated_at: new Date().toISOString() }]),
  });
}
export async function deleteAuth() {
  return supabaseRest(`${table}?store_id=eq.${sid()}`, { method: 'DELETE' });
}

async function oauthPost(path, body) {
  const c = deviceConfig();
  const res = await fetch(`${c.api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  if (!res.ok || !data?.access_token) throw new HttpError(502, `Clover sign-in failed (${res.status})${data?.message ? ': ' + data.message : ''}`);
  return data;
}
const tsIso = s => (s ? new Date(Number(s) * 1000).toISOString() : null);

export async function exchangeCode(code) {
  const c = deviceConfig();
  const t = await oauthPost('/oauth/v2/token', { client_id: c.appId, client_secret: c.secret, code });
  return { access_token: t.access_token, access_expires_at: tsIso(t.access_token_expiration), refresh_token: t.refresh_token || null, refresh_expires_at: tsIso(t.refresh_token_expiration) };
}

// A valid access token (refreshed when it is within 5 minutes of expiring).
export async function validAuth() {
  const a = await readAuth();
  if (!a) throw new HttpError(409, 'The Clover Flex is not connected yet — a manager can connect it in Settings');
  if (a.environment && a.environment !== deviceEnv()) throw new HttpError(409, 'The Clover Flex connection is for a different Clover environment — reconnect it in Settings');
  const exp = a.access_expires_at ? Date.parse(a.access_expires_at) : 0;
  if (exp && exp - Date.now() > 5 * 60 * 1000) return a;
  if (!a.refresh_token) { if (!exp) return a; throw new HttpError(409, 'The Clover Flex sign-in expired — reconnect it in Settings'); }
  const c = deviceConfig();
  const t = await oauthPost('/oauth/v2/refresh', { client_id: c.appId, refresh_token: a.refresh_token });
  const next = { access_token: t.access_token, access_expires_at: tsIso(t.access_token_expiration), refresh_token: t.refresh_token || a.refresh_token, refresh_expires_at: tsIso(t.refresh_token_expiration) || a.refresh_expires_at };
  await saveAuth(next);
  return { ...a, ...next };
}

export async function deviceApi(auth, path, options = {}) {
  const c = deviceConfig();
  const res = await fetch(`${c.api}/v3/merchants/${encodeURIComponent(auth.merchant_id)}${path}`, {
    ...options, headers: { Authorization: `Bearer ${auth.access_token}`, Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  if (!res.ok) throw new HttpError(res.status === 401 ? 409 : 502, res.status === 401 ? 'Clover refused the Flex sign-in — reconnect it in Settings' : `Clover request failed (${res.status})`);
  return data;
}

// What the card should be charged for these tickets — same rule as the card-on-file charge.
export function expectedCents(order) {
  const base = Math.max(0, Math.round((Number(order.total || 0) - Number(order.discount || 0) - Number(order.storeCreditApplied || 0)) * 100) / 100);
  const fee = order.pricing === 'card-price-v299' ? 0 : Math.round(base * 0.03 * 100) / 100;
  return Math.round((base + fee) * 100);
}
