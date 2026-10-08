// /.netlify/functions/card-link — the customer-facing "save your card" page (/card/<token>).
// GET  ?t=<token>                         → who the link is for + Clover public settings for the secure form
// POST {t, token, consent:true, email?}   → saves the Clover card token as the customer's card on file
// Card numbers go straight from Clover's hosted fields to Clover; only Clover's token reaches us.
import { assertSameOrigin, env, handleError, json, methodNotAllowed, parseBody, HttpError, cloverConfigured } from './lib/shared.mjs';
import { saveCardOnFile } from './lib/card-vault.mjs';
import { mutateStore, readStore } from './lib/app.mjs';
import { compose, deliver, firstName, SHOP } from './lib/sms.mjs';
import { readCardLink } from './lib/card-link.mjs';
import { staffAlert } from './lib/alerts.mjs';

const placeholderEmail = c => `hattancleaners141+c${String(c.customerNumber || c.id).replace(/[^A-Za-z0-9]/g, '')}@gmail.com`;
const isPlaceholder = e => /^hattancleaners141\+c[^@]+@gmail\.com$/i.test(String(e || ''));

async function customerFor(t) {
  const { customerId, sig } = readCardLink(t);
  const { payload } = await readStore();
  const c = (payload.customers || []).find(x => String(x?.id) === customerId);
  if (!c) throw new HttpError(404, 'This link is not valid');
  return { c, sig };
}

export const handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed('GET, POST');
  try {
    const environment = env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    if (event.httpMethod === 'GET') {
      const { c, sig } = await customerFor(event.queryStringParameters?.t);
      const card = (c.paymentMethods || []).find(p => p.processor === 'clover');
      return json(200, {
        ok: true, shop: SHOP, firstName: firstName(c), used: c.cardLinkUsed === sig,
        card: !!card,
        hasEmail: !!(c.email && !isPlaceholder(c.email)),
        clover: cloverConfigured() ? { publicToken: env('CLOVER_PUBLIC_TOKEN'), merchantId: env('CLOVER_MERCHANT_ID'), environment, sdkUrl: environment === 'production' ? 'https://checkout.clover.com/sdk.js' : 'https://checkout.sandbox.dev.clover.com/sdk.js' } : null,
      });
    }

    assertSameOrigin(event);
    const body = parseBody(event);
    const { c, sig } = await customerFor(body.t);
    if (c.cardLinkUsed === sig) throw new HttpError(409, `This link was already used. Call us at ${SHOP.phone} to change your card.`);
    if (body.consent !== true) throw new HttpError(400, 'Please confirm you authorize charges to this card');
    const token = String(body.token || '').trim();
    if (!/^clv_[A-Za-z0-9]+$/.test(token)) throw new HttpError(400, 'The card could not be verified. Please re-enter it.');
    let email = String(body.email || '').trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Please check your email address');
    const cloverEmail = email || (c.email && !isPlaceholder(c.email) ? c.email : (c.cloverEmail || placeholderEmail(c)));

    const card = await saveCardOnFile(event, { sub: 'customer-text-link' }, { customerId: String(c.id), token, email: cloverEmail, name: String(c.name || '').trim(), phone: c.phone });
    const at = new Date().toISOString();
    await mutateStore(s => {
      const x = (s.customers || []).find(y => String(y.id) === String(c.id));
      if (!x) return;
      x.paymentMethods = (x.paymentMethods || []).filter(p => p.processor !== 'clover');
      x.paymentMethods.unshift(card);
      x.cardLinkUsed = sig;
      x.cardSavedVia = { method: 'text-link', at };
      if (isPlaceholder(cloverEmail)) x.cloverEmail = cloverEmail;
      else if (!x.email) x.email = cloverEmail;
    });
    // Confirmation text ("card ending 1234 is saved") — only goes out if they opted in to texts.
    try {
      const { payload } = await readStore();
      const fresh = (payload.customers || []).find(y => String(y.id) === String(c.id)) || c;
      const enabled = payload?.interfaceSettings?.sms?.enabled?.cardSaved !== false;
      if (enabled && card.last4) await deliver({ keys: [`cardSaved:${c.id}:${card.last4}`], kind: 'cardSaved', customer: fresh, body: compose('cardSaved', { customer: fresh, card }), sentBy: 'customer-text-link', event });
    } catch (_) { /* the card is saved either way */ }
    try { await staffAlert({ type: 'card', title: 'Card saved from text link', text: `${card.brand || 'Card'} ending ${card.last4 || '----'} is now on file. Batch charges will include this customer.`, customerId: c.id, customerName: c.name }); } catch (_) {}
    return json(201, { ok: true, card: { brand: card.brand, last4: card.last4 } });
  } catch (error) { return handleError(error); }
};
