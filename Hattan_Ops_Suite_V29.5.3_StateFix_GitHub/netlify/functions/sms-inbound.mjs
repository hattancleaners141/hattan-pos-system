// Twilio webhook: incoming customer texts (STOP / START / replies) and delivery-status updates.
// Twilio itself sends the STOP / HELP auto-replies; this records them so the POS never texts
// an opted-out number and staff can see customer replies on the Texts screen.
import { env, supabaseRest, storeId } from './lib/shared.mjs';
import { compose, deliver, e164, logInsert, setOptOut, siteUrl, twilioSignatureValid } from './lib/sms.mjs';
import { mutateStore, readStore } from './lib/app.mjs';
import { staffAlert } from './lib/alerts.mjs';

const AGAIN_WORDS = ['AGAIN', 'REDO', 'RECLEAN', 'AGIAN', 'AGAINPLEASE', 'TRYAGAIN'];
const PACK_WORDS = ['PACK', 'PACKIT', 'PACKITPLEASE', 'PACKPLEASE', 'PACKED'];

// Customer answered a Do Over text: record it on the ticket(s) and thank them.
async function doOverAnswer(from, answer, event) {
  let hit = null;
  await mutateStore(s => {
    const cust = (s.customers || []).filter(c => e164(c.smsConsent?.phone || c.phone) === from);
    const ids = new Set(cust.map(c => String(c.id)));
    const open = (s.orders || []).filter(o => ids.has(String(o.customerId)) && o.doOver && o.doOver.status === 'asked');
    if (!open.length) return { __noWrite: true, value: null };
    const latest = open.reduce((a, b) => (Date.parse(a.doOver.at) >= Date.parse(b.doOver.at) ? a : b)).doOver.at;
    const now = new Date().toISOString();
    const orders = open.filter(o => o.doOver.at === latest);
    orders.forEach(o => { o.doOver.status = answer; o.doOver.answeredAt = now; });
    hit = { customer: cust.find(c => String(c.id) === String(orders[0].customerId)), orders: orders.map(o => ({ ...o })) };
  });
  if (hit?.customer) {
    try { await deliver({ keys: [`doOverReply:${hit.orders.map(o => o.id).join('+')}:${answer}`], kind: 'doOverReply', customer: hit.customer, orderIds: hit.orders.map(o => o.id), body: compose('doOverReply', { customer: hit.customer, orders: hit.orders, answer }), sentBy: 'customer-reply', event }); } catch (e) { console.error('doOver reply', e); }
  }
  return hit;
}

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
const START_WORDS = ['START', 'UNSTOP', 'YES', 'OPTIN'];
const twiml = () => ({ statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>' });

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const params = Object.fromEntries(new URLSearchParams(raw));
  const sig = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'];
  const urls = [event.rawUrl, `${siteUrl(event)}/.netlify/functions/sms-inbound`].filter(Boolean);
  if (!urls.some(u => twilioSignatureValid(u, params, sig))) return { statusCode: 403, body: 'Invalid signature' };
  if (params.AccountSid && params.AccountSid !== env('TWILIO_ACCOUNT_SID')) return { statusCode: 403, body: 'Wrong account' };

  try {
    // Delivery status callback for a message we sent.
    if (params.MessageStatus && params.MessageSid && !params.Body) {
      await supabaseRest(`sms_log?store_id=eq.${encodeURIComponent(storeId())}&twilio_sid=eq.${encodeURIComponent(params.MessageSid)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: params.MessageStatus, ...(params.ErrorCode ? { error_message: `Twilio error ${params.ErrorCode}` } : {}) }),
      });
      return twiml();
    }
    const from = e164(params.From);
    const text = String(params.Body || '').trim();
    const word = text.toUpperCase().replace(/[^A-Z]/g, '');
    let kind = 'reply';
    if (params.OptOutType === 'STOP' || STOP_WORDS.includes(word)) { kind = 'optout'; if (from) await setOptOut(from, true, 'reply-stop'); }
    else if (params.OptOutType === 'START' || START_WORDS.includes(word)) { kind = 'optin-keyword'; if (from) await setOptOut(from, false, 'reply-start'); }
    else if (params.OptOutType === 'HELP' || ['HELP', 'INFO'].includes(word)) kind = 'help';
    else if (from && (AGAIN_WORDS.includes(word) || PACK_WORDS.includes(word))) {
      const answer = AGAIN_WORDS.includes(word) ? 'again' : 'pack';
      try { if (await doOverAnswer(from, answer, event)) kind = answer === 'again' ? 'doover-again' : 'doover-pack'; } catch (e) { console.error('doOver answer', e); }
    }
    await logInsert({ direction: 'in', kind, to_phone: from, body: text.slice(0, 1000), status: 'received', twilio_sid: params.MessageSid || null });
    // Tell the shop (POS bell + email). Find who it is by phone number.
    try {
      const { payload } = await readStore();
      const c = (payload.customers || []).find(x => e164(x.smsConsent?.phone || x.phone) === from);
      const title = { reply: 'Customer texted back', 'doover-again': 'Do Over: customer said AGAIN (re-clean)', 'doover-pack': 'Do Over: customer said PACK it', optout: 'Customer replied STOP (texts off)', 'optin-keyword': 'Customer turned texts back on', help: 'Customer texted HELP' }[kind] || 'Customer text';
      await staffAlert({ type: kind.startsWith('doover') ? 'doover' : kind === 'reply' ? 'reply' : 'texts', title, text: `"${text.slice(0, 300)}" — from ${from ? '•••' + from.slice(-4) : 'unknown number'}`, customerId: c?.id || '', customerName: c?.name || '' });
    } catch (e) { console.error('inbound alert', e); }
  } catch (e) { console.error('sms-inbound', e); }
  return twiml();
};
