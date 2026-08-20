import { env, json, cloverConfigured, supabaseConfigured, supabaseRealtimeConfigured, supabaseRealtimeMode } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { ok:false, error:'Method not allowed' }, { Allow:'GET' });
  const environment = env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  return json(200, {
    ok: true,
    version: '16.1',
    mode: ['local', 'shared', 'live'].includes(env('HATTAN_MODE').toLowerCase()) ? env('HATTAN_MODE').toLowerCase() : 'local',
    storeId: env('HATTAN_STORE_ID', 'main'),
    sync: {
      configured: supabaseConfigured(),
      url: env('SUPABASE_URL'),
      publishableKey: env('SUPABASE_PUBLISHABLE_KEY', env('SUPABASE_ANON_KEY')),
      realtimeReady: supabaseRealtimeConfigured(),
      realtimeMode: supabaseRealtimeMode(),
    },
    clover: {
      configured: cloverConfigured(),
      publicToken: env('CLOVER_PUBLIC_TOKEN'),
      merchantId: env('CLOVER_MERCHANT_ID'),
      environment,
      sdkUrl: environment === 'production' ? 'https://checkout.clover.com/sdk.js' : 'https://checkout.sandbox.dev.clover.com/sdk.js',
      privateTokenOnServer: !!env('CLOVER_PRIVATE_TOKEN'),
    },
  });
};
