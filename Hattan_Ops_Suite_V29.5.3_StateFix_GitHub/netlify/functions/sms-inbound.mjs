// Twilio webhook: incoming customer texts (STOP / START / replies) and delivery-status updates.
// Twilio itself sends the STOP / HELP auto-replies; this records them so the POS never texts
// an opted-out number and staff can see customer replies on the Texts screen.
import { env, supabaseRest, storeId } from './lib/shared.mjs';
import { e164, logInsert, setOptOut, siteUrl, twilioSignatureValid } from './lib/sms.mjs';

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
    await logInsert({ direction: 'in', kind, to_phone: from, body: text.slice(0, 1000), status: 'received', twilio_sid: params.MessageSid || null });
  } catch (e) { console.error('sms-inbound', e); }
  return twiml();
};
