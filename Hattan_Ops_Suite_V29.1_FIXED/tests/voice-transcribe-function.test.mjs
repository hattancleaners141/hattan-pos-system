import assert from 'node:assert/strict';
import test from 'node:test';

import { handler } from '../netlify/functions/voice-transcribe.mjs';
import { createSession } from '../netlify/functions/lib/shared.mjs';

test('authenticated staff can use bounded server transcription', async () => {
  process.env.HATTAN_SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  process.env.HATTAN_STORE_ID = 'main';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const token = createSession({ id:'staff_test', display_name:'Staff', manager:false, store_id:'main' });
  const originalFetch = global.fetch;
  let submitted;
  global.fetch = async (_url, options) => {
    submitted = options.body;
    return { ok:true, status:200, json:async () => ({ text:'three pants and ten pounds wash and fold' }) };
  };
  try {
    const bytes = Buffer.alloc(900, 1).toString('base64');
    const response = await handler({
      httpMethod:'POST', headers:{ cookie:`hattan_session=${token}` },
      body:JSON.stringify({ audioDataUrl:`data:audio/webm;codecs=opus;base64,${bytes}` }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).transcript, 'three pants and ten pounds wash and fold');
    assert.equal(submitted.get('model'), 'gpt-transcribe');
    assert.equal(submitted.get('language'), 'en');
    assert.match(submitted.get('prompt'), /separate ticket/);
    assert.equal(submitted.get('file').type, 'audio/webm');
  } finally { global.fetch = originalFetch; }
});

test('server transcription requires a signed-in staff session', async () => {
  const response = await handler({ httpMethod:'POST', headers:{}, body:JSON.stringify({ audioDataUrl:'data:audio/webm;base64,AAAA' }) });
  assert.equal(response.statusCode, 401);
});
