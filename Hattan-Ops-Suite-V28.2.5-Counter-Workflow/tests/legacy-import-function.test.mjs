import assert from 'node:assert/strict';
import test from 'node:test';

import { handler } from '../netlify/functions/legacy-import-extract.mjs';
import { createSession } from '../netlify/functions/lib/shared.mjs';

test('legacy screenshot extraction is manager-only, structured and not retained', async () => {
  process.env.HATTAN_SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  process.env.HATTAN_STORE_ID = 'main';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const token = createSession({ id:'manager_test', display_name:'Manager', manager:true, store_id:'main' });
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok:true,
      status:200,
      json:async () => ({ output_text:JSON.stringify({ customers:[], tickets:[], daily_revenue:[], warnings:['review'] }) }),
    };
  };
  try {
    const response = await handler({
      httpMethod:'POST',
      headers:{ cookie:`hattan_session=${token}` },
      body:JSON.stringify({ sourceName:'legacy.png', imageDataUrl:'data:image/png;base64,AAAA' }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).reviewRequired, true);
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.text.format.type, 'json_schema');
    assert.equal(requestBody.text.format.strict, true);
    assert.equal(requestBody.text.format.schema.additionalProperties, false);
    assert.match(requestBody.input[0].content[0].text, /Do not guess/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('legacy screenshot extraction rejects staff sessions', async () => {
  process.env.HATTAN_SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  process.env.HATTAN_STORE_ID = 'main';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const token = createSession({ id:'staff_test', display_name:'Staff', manager:false, store_id:'main' });
  const response = await handler({
    httpMethod:'POST',
    headers:{ cookie:`hattan_session=${token}` },
    body:JSON.stringify({ sourceName:'legacy.png', imageDataUrl:'data:image/png;base64,AAAA' }),
  });
  assert.equal(response.statusCode, 403);
});
