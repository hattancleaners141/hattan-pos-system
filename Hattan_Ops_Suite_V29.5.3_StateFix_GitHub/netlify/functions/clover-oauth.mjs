// GET /.netlify/functions/clover-oauth?start=1      → a manager starts connecting the Clover Flex (goes to Clover sign-in)
// GET /.netlify/functions/clover-oauth?code=…&merchant_id=…  → Clover sends the manager back here; the token is saved server-side
import crypto from 'node:crypto';
import { env, readSession } from './lib/shared.mjs';
import { deviceApi, deviceConfig, deviceConfigured, deviceEnv, exchangeCode, saveAuth } from './lib/clover-device.mjs';

const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const siteUrl = event => (env('PUBLIC_SITE_URL') || `https://${event.headers?.host || 'hattan-ops-suite.netlify.app'}`).replace(/\/$/, '');
const page = (title, body, ok) => ({
  statusCode: ok ? 200 : 400,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title)}</title>
  <style>body{font-family:-apple-system,system-ui,sans-serif;background:#f6f4ee;color:#1b1f1c;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
  .c{background:#fff;border-radius:16px;padding:28px;max-width:460px;box-shadow:0 4px 20px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 10px;color:${ok ? '#123d2b' : '#b42318'}}p{line-height:1.5}a{display:inline-block;margin-top:10px;background:#123d2b;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}</style></head>
  <body><div class="c"><h1>${E(title)}</h1>${body}<a href="/">Back to the POS</a></div></body></html>`,
});

// The staff cookie is SameSite=Strict, so it is not sent when Clover redirects back. A short-lived
// signed "connect ticket" cookie (Lax) proves this browser started the connection as a manager.
const TICKET = 'hattan_clover_connect';
const sign = v => crypto.createHmac('sha256', env('HATTAN_SESSION_SECRET')).update(`clover-connect:${v}`).digest('base64url');
function readTicket(event) {
  const raw = String(event.headers?.cookie || event.headers?.Cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(TICKET + '='));
  if (!raw) return null;
  const [p, sig] = raw.slice(TICKET.length + 1).split('.');
  if (!p || !sig || sign(p) !== sig) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return d.exp > Date.now() / 1000 ? d : null; } catch (_) { return null; }
}
const secure = () => (env('CONTEXT') === 'dev' ? '' : '; Secure');

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'GET only' };
  const q = event.queryStringParameters || {};
  if (!deviceConfigured()) return page('Clover Flex not set up yet', '<p>The Clover app settings (CLOVER_APP_SECRET) are missing in Netlify. Add them, redeploy, then try again.</p>', false);
  const c = deviceConfig();
  const redirect = `${siteUrl(event)}/.netlify/functions/clover-oauth`;
  if (q.start) {
    const session = readSession(event);
    if (session?.role !== 'manager') return page('Manager sign-in needed', '<p>Sign in to the Hattan POS as a manager on this computer first, then use <strong>Settings → Clover Flex → Connect</strong>.</p>', false);
    const p = Buffer.from(JSON.stringify({ sub: session.sub, name: session.name, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    return { statusCode: 302, headers: { Location: `${c.web}/oauth/v2/authorize?client_id=${encodeURIComponent(c.appId)}&redirect_uri=${encodeURIComponent(redirect)}`, 'Set-Cookie': `${TICKET}=${p}.${sign(p)}; Path=/.netlify/functions/clover-oauth; HttpOnly; SameSite=Lax; Max-Age=900${secure()}`, 'Cache-Control': 'no-store' }, body: '' };
  }
  if (!q.code || !q.merchant_id) return page('Nothing to connect', '<p>Start from <strong>Settings → Clover Flex → Connect</strong> in the POS.</p>', false);
  const session = readTicket(event);
  if (!session) return page('Start from the POS', '<p>For safety, connecting the Flex has to be started by a manager in the POS: <strong>Settings → Clover Flex → Connect</strong> (within 15 minutes).</p>', false);
  try {
    const tokens = await exchangeCode(String(q.code));
    const auth = { environment: deviceEnv(), merchant_id: String(q.merchant_id), ...tokens, connected_by: session.name || session.sub };
    // Pick the Flex automatically when there is just one Clover device.
    let devices = [];
    try { devices = ((await deviceApi(auth, '/devices'))?.elements || []); } catch (_) {}
    const flex = devices.filter(d => /flex/i.test(`${d.deviceTypeName || ''} ${d.productName || ''} ${d.model || ''}`));
    const pick = flex.length === 1 ? flex[0] : devices.length === 1 ? devices[0] : null;
    if (pick) Object.assign(auth, { device_id: pick.id, device_serial: pick.serial || '', device_name: pick.name || pick.productName || pick.deviceTypeName || 'Clover device' });
    await saveAuth(auth);
    return page('Clover Flex connected', `<p>Hattan POS can now send totals to your Clover ${E(c.environment === 'production' ? '' : '(test) ')}device.</p>${pick ? `<p>Device: <strong>${E(auth.device_name)}</strong> · ${E(auth.device_serial)}</p>` : `<p>${devices.length ? 'Choose which device to use in <strong>Settings → Clover Flex</strong>.' : 'No Clover device was found on this account yet.'}</p>`}<p>Make sure <strong>Cloud Pay Display</strong> is installed and open on the Flex.</p>`, true);
  } catch (e) {
    return page('Could not connect the Clover Flex', `<p>${E(e.message || 'Clover sign-in failed')}</p><p>Try again from Settings. If it keeps failing, check the Clover app settings in Netlify.</p>`, false);
  }
};
