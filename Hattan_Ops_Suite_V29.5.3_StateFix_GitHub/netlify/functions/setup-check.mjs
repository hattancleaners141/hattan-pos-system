// GET /.netlify/functions/setup-check — one page that shows what is set up and what is still
// missing for the customer app, driver app, card payments and texting. Signed-in staff only.
import { env, readSession, selectRows, supabaseConfigured, supabaseRequestHeaders, cloverConfigured, storeId } from './lib/shared.mjs';

const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
async function table(name) { try { await selectRows(name, 'limit=1', '*'); return true; } catch (_) { return false; } }
async function bucket() {
  try { const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/bucket/delivery-proof`, { headers: supabaseRequestHeaders() }); return r.ok; } catch (_) { return false; }
}
const page = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup check · Hattan</title>
<style>body{margin:0;background:#f6f4ee;color:#171a17;font:16px/1.5 -apple-system,system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:24px 16px 48px}h1{font-family:Georgia,serif;font-weight:400;margin:0 0 4px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.4px;color:#565f57;margin:26px 0 8px}
.row{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e3e2d8;border-radius:12px;padding:12px 14px;margin-bottom:8px}.ok{color:#1f6f43;font-weight:800}.no{color:#b42318;font-weight:800}.opt{color:#b54708;font-weight:800}.fix{font-size:13.5px;color:#565f57;margin-top:2px}code{background:#f0eee8;padding:1px 6px;border-radius:6px;font-size:13px}a{color:#0e5c37}</style></head><body><main>${body}</main></body></html>` });

export const handler = async (event) => {
  if (!readSession(event)) return page(401, `<h1>Setup check</h1><p>Sign in to the POS first (<a href="/">open the POS</a>), then reload this page.</p>`);
  const db = supabaseConfigured();
  const [appAcc, codes, proofs, bkt, sms] = db ? await Promise.all([table('app_accounts'), table('app_login_codes'), table('delivery_proofs'), bucket(), table('sms_log')]) : [false, false, false, false, false];
  let epoch = false; if (appAcc) { try { await selectRows('app_accounts', 'limit=1', 'session_epoch'); epoch = true; } catch (_) {} }
  const email = !!((env('SMTP_USER') && env('SMTP_PASS')) || env('RESEND_API_KEY'));
  const item = (ok, name, fix, optional) => `<div class="row"><div class="${ok ? 'ok' : optional ? 'opt' : 'no'}">${ok ? '✓' : optional ? '–' : '✕'}</div><div><strong>${E(name)}</strong>${ok ? '' : `<div class="fix">${fix}</div>`}</div></div>`;
  const sqlFix = 'Supabase → SQL Editor → New query → paste <code>supabase/SETUP-customer-and-driver-apps.sql</code> from GitHub → Run.';
  const body = `<h1>Setup check</h1><p class="fix">Store <code>${E(storeId())}</code> · reload after each fix.</p>
  <h2>Basics</h2>
  ${item(db, 'Database connected', 'Supabase settings are missing in Netlify.')}
  ${item(!!env('HATTAN_SESSION_SECRET'), 'Sign-in secret', 'Add <code>HATTAN_SESSION_SECRET</code> in Netlify.')}
  <h2>Driver app — /driver</h2>
  ${item(proofs, 'Proof-of-delivery table', sqlFix)}
  ${item(bkt, 'Private photo storage', sqlFix)}
  <h2>Customer app — /app</h2>
  ${item(appAcc && codes && epoch, 'Customer app tables', sqlFix)}
  ${item(email, 'Email for sign-in codes', 'Netlify → Environment variables: <code>SMTP_USER</code> = hattancleaners141@gmail.com and <code>SMTP_PASS</code> = a Google <em>app password</em> (Google Account → Security → App passwords). Then Deploys → Trigger deploy.')}
  ${item(cloverConfigured(), 'Clover card payments', 'Clover tokens are missing in Netlify.')}
  ${item(!!(env('APP_REVIEW_EMAIL') && env('APP_REVIEW_CODE')), 'App Store reviewer sign-in', 'Only needed when submitting to the App Store: <code>APP_REVIEW_EMAIL</code> and a 6-digit <code>APP_REVIEW_CODE</code>.', true)}
  <h2>Texting (after the Twilio campaign is approved)</h2>
  ${item(sms, 'Texting tables', 'Comes with the texting release — not needed yet.', true)}
  ${item(!!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_MESSAGING_SERVICE_SID')), 'Twilio settings', 'Add after approval.', true)}
  <h2>Try it</h2>
  <div class="row"><div>📱</div><div><a href="/app/">Customer app</a> · <a href="/driver/">Driver app</a> · <a href="/r/sample">Sample receipt</a></div></div>`;
  return page(200, body);
};
