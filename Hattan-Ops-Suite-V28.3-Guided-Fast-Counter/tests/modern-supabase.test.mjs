import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  createRealtimeJwt,
  supabaseRequestHeaders,
  supabaseRealtimeConfigured,
  supabaseRealtimeMode,
} from '../netlify/functions/lib/shared.mjs';
import { handler as runtimeConfig } from '../netlify/functions/runtime-config.mjs';

test('modern Supabase secret uses only the apikey header', () => {
  assert.deepEqual(supabaseRequestHeaders('sb_secret_test'), { apikey:'sb_secret_test' });
});

test('legacy service_role JWT retains its Bearer header', () => {
  assert.deepEqual(supabaseRequestHeaders('legacy.jwt.value'), {
    apikey:'legacy.jwt.value',
    Authorization:'Bearer legacy.jwt.value',
  });
});

test('Realtime JWT is an ES256 token signed by the configured private JWK', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve:'P-256' });
  const privateJwk = privateKey.export({ format:'jwk' });
  privateJwk.kid = 'hattan-test-key';

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(privateJwk);
  process.env.SUPABASE_JWT_KID = privateJwk.kid;
  delete process.env.SUPABASE_JWT_SECRET;

  assert.equal(supabaseRealtimeConfigured(), true);
  assert.equal(supabaseRealtimeMode(), 'es256');

  const token = createRealtimeJwt({ sub:'staff_test', storeId:'main' });
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

  assert.deepEqual(header, { alg:'ES256', kid:'hattan-test-key', typ:'JWT' });
  assert.equal(payload.role, 'authenticated');
  assert.equal(payload.store_id, 'main');
  assert.equal(payload.hattan_staff_id, 'staff_test');
  assert.equal('sub' in payload, false);

  const verified = crypto.verify(
    'sha256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    { key:publicKey, dsaEncoding:'ieee-p1363' },
    Buffer.from(encodedSignature, 'base64url'),
  );
  assert.equal(verified, true);
});

test('browser runtime configuration never exposes server secrets', async () => {
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_must_not_leak';
  process.env.CLOVER_PRIVATE_TOKEN = 'clover_private_must_not_leak';
  process.env.HATTAN_SESSION_SECRET = 'session_secret_must_not_leak_123456789';
  process.env.OPENAI_API_KEY = 'openai_secret_must_not_leak';

  const response = await runtimeConfig({ httpMethod:'GET' });
  const serialized = response.body;
  assert.equal(response.statusCode, 200);
  assert.equal(serialized.includes('sb_secret_must_not_leak'), false);
  assert.equal(serialized.includes('clover_private_must_not_leak'), false);
  assert.equal(serialized.includes('session_secret_must_not_leak'), false);
  assert.equal(serialized.includes('openai_secret_must_not_leak'), false);
  assert.equal(JSON.parse(serialized).voice.configured, true);
  assert.equal(serialized.includes('"d"'), false);
});
