import { cloverConfigured, cloverRequest, env, handleError, json, methodNotAllowed, requireSession, selectRows, supabaseConfigured, supabaseRealtimeConfigured, supabaseRealtimeMode } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    requireSession(event, true);
    const checks = {
      database:{ configured:supabaseConfigured(), connected:false },
      realtime:{ configured:supabaseRealtimeConfigured(), mode:supabaseRealtimeMode() },
      clover:{ configured:cloverConfigured(), connected:false, environment:env('CLOVER_ENVIRONMENT', 'sandbox') },
      voice:{ configured:!!env('OPENAI_API_KEY'), model:env('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe') },
    };
    if (checks.database.configured) {
      try { await selectRows('staff_accounts', 'limit=1', 'id'); checks.database.connected = true; }
      catch (error) { checks.database.error = error.message; }
    }
    if (checks.clover.configured) {
      try { await cloverRequest('/v1/charges?limit=1', { method:'GET' }, event); checks.clover.connected = true; }
      catch (error) { checks.clover.error = error.message; }
    }
    return json(200, { ok:true, checks });
  } catch (error) { return handleError(error); }
};
