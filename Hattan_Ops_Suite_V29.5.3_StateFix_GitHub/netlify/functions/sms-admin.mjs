// GET /.netlify/functions/sms-admin — texting status, recent messages and opt-outs for the Texts screen.
import { env, handleError, json, methodNotAllowed, requireSession, selectRows, storeId, supabaseConfigured } from './lib/shared.mjs';
import { smsMode, testNumbers, twilioConfigured } from './lib/sms.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    requireSession(event);
    const status = {
      mode: smsMode(),
      twilioConfigured: twilioConfigured(),
      testNumbers: testNumbers().map(p => '•••' + p.slice(-4)),
      messagingService: env('TWILIO_MESSAGING_SERVICE_SID') ? '…' + env('TWILIO_MESSAGING_SERVICE_SID').slice(-4) : '',
      missing: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID', 'SMS_MODE'].filter(k => !env(k)),
    };
    if (!supabaseConfigured()) return json(200, { ok: true, status, log: [], optOuts: [] });
    let log = [], optOuts = [], tablesReady = true;
    try {
      log = await selectRows('sms_log', `store_id=eq.${encodeURIComponent(storeId())}&status=neq.merged&status=neq.claimed&order=created_at.desc&limit=150`,
        'id,created_at,direction,kind,customer_id,order_ids,to_phone,body,status,error_message');
      optOuts = await selectRows('sms_optouts', `store_id=eq.${encodeURIComponent(storeId())}&opted_out=eq.true&order=updated_at.desc&limit=500`, 'phone,updated_at,source');
    } catch (e) { tablesReady = false; }
    const lastFail = (log || []).find(m => m.direction === 'out' && (m.status === 'failed' || m.status === 'undelivered'));
    if (lastFail) status.lastError = { at: lastFail.created_at, error: lastFail.error_message || lastFail.status };
    return json(200, { ok: true, status: { ...status, tablesReady }, log: log || [], optOuts: optOuts || [] });
  } catch (error) { return handleError(error); }
};
