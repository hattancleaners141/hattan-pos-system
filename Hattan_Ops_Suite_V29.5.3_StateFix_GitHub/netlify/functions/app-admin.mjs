// Staff-only: customer app sign-ups that need a person to confirm who they are.
// GET  → pending requests (phone already belongs to a shop customer) + recent app accounts
// POST { action:'link', accountId, customerId } | { action:'createNew', accountId } | { action:'reject', accountId }
import crypto from 'node:crypto';
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, HttpError } from './lib/shared.mjs';
import { mutateStore, updateAccount, isPlaceholderEmail } from './lib/app.mjs';
import { compose, deliver, e164, smsMode } from './lib/sms.mjs';

const sid = () => encodeURIComponent(storeId());
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

export const handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed('GET, POST');
  try {
    const session = requireSession(event);
    if (event.httpMethod === 'GET') {
      const pending = await selectRows('app_accounts', `store_id=eq.${sid()}&status=eq.pending&order=created_at.asc&limit=100`, 'id,email,status,match_customer_id,match_note,signup,created_at');
      const recent = await selectRows('app_accounts', `store_id=eq.${sid()}&status=eq.linked&order=created_at.desc&limit=30`, 'id,email,customer_id,created_at,last_login_at');
      return json(200, { ok: true, pending: pending || [], recent: recent || [] });
    }
    assertSameOrigin(event);
    const body = parseBody(event);
    const rows = await selectRows('app_accounts', `store_id=eq.${sid()}&id=eq.${encodeURIComponent(String(body.accountId || ''))}&limit=1`, '*');
    const account = rows?.[0];
    if (!account) throw new HttpError(404, 'App account not found');
    const signup = account.signup || {};

    if (body.action === 'reject') {
      await updateAccount(account.id, { status: 'rejected', customer_id: null, match_note: `Not confirmed by ${session.name || 'staff'}` });
      return json(200, { ok: true });
    }
    if (body.action !== 'link' && body.action !== 'createNew') throw new HttpError(400, 'Unknown action');

    const customer = await mutateStore(store => {
      let c;
      if (body.action === 'link') {
        c = (store.customers || []).find(x => String(x.id) === String(body.customerId || ''));
        if (!c) throw new HttpError(409, 'Open the customer in the POS first so they are saved, then try again');
      } else {
        const n = Math.max(Number(store.nextCustomerNumber) || 10001, 10001);
        store.nextCustomerNumber = n + 1;
        const name = signup.name || account.email.split('@')[0];
        c = { id: 'cust_' + crypto.randomBytes(6).toString('base64url'), customerNumber: `C-${n}`, name, initials: initials(name), phone: signup.phone || '', email: '', memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), points: 0, storeCredit: 0, preferredChannel: 'pickup', addresses: [], paymentMethods: [], garmentPrefs: { starch: 'light', fold: 'hang', fragranceFree: false, notes: '' }, source: 'customer-app', createdAt: new Date().toISOString() };
        (store.customers = store.customers || []).push(c);
      }
      if (!c.email || isPlaceholderEmail(c.email)) c.email = account.email;
      c.appAccountId = account.id;
      if (signup.address?.street && !(c.addresses || []).length) c.addresses = [signup.address];
      if (signup.smsOn && e164(signup.phone || c.phone)) c.smsConsent = { on: true, phone: e164(signup.phone || c.phone), at: signup.at || new Date().toISOString(), by: 'Customer app (written)', method: 'app' };
      return c;
    });
    await updateAccount(account.id, { status: 'linked', customer_id: customer.id, match_note: `Confirmed by ${session.name || 'staff'}` });
    if (customer.smsConsent?.on && smsMode() !== 'off') {
      try { await deliver({ keys: [`optin:${customer.id}:${customer.smsConsent.phone}`], kind: 'optin', customer, body: compose('optin', {}), sentBy: session.sub, event }); } catch (e) { console.error(e.message); }
    }
    return json(200, { ok: true, customerId: customer.id });
  } catch (error) { return handleError(error); }
};
