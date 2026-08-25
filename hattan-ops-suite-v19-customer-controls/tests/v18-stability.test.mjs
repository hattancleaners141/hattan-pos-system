import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../v18-stability.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../v18-stability.css', import.meta.url), 'utf8');
const shared = await readFile(new URL('../netlify/functions/lib/shared.mjs', import.meta.url), 'utf8');
const session = await readFile(new URL('../netlify/functions/session.mjs', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../netlify/functions/runtime-config.mjs', import.meta.url), 'utf8');

test('reload masks all stale or prototype staff until the secure session is known', () => {
  assert.match(index, /classList\.add\('v17-booting','v18-booting'\)/);
  assert.match(index, /html\.v18-booting body > :not\(#v17-boot-screen\)\{visibility:hidden!important\}/);
  assert.match(index, /v18-stability\.css/);
  assert.match(index, /v18-stability\.js/);
  assert.match(script, /let v18BootPending = true/);
  assert.match(script, /if \(v18BootPending\)/);
  assert.doesNotMatch(script, /setTimeout\(\(\) => document\.documentElement\.classList\.remove\('v18-booting'/);
});

test('authenticated reload renews a shift-sized secure session cookie', () => {
  assert.match(shared, /const SESSION_SECONDS = 12 \* 60 \* 60/);
  assert.match(session, /const renewed = createSession\(staff\)/);
  assert.match(session, /'Set-Cookie':sessionCookie\(renewed\)/);
});

test('same-day due dates become RUSH in draft, editing and printed ticket paths', () => {
  assert.match(script, /function v18IsToday\(value\)/);
  assert.match(script, /const rush = !!requestedRush \|\| v18IsToday\(dueDate\)/);
  assert.match(script, /draft\.rush = !!draft\.rush \|\| v18IsToday\(draft\.dueDate\)/);
  assert.match(script, /order\.rush = true/);
  assert.match(script, /RUSH — SAME DAY/);
});

test('due-date layout reserves a full row and Tomorrow cannot be clipped', () => {
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/);
  assert.match(styles, /grid-column:1\/-1!important/);
  assert.match(styles, /\.v14-rush-btn,\.v14-tomorrow-btn/);
  assert.match(styles, /text-overflow:clip!important/);
});

test('navigation labels cannot show an editing caret while form fields still can', () => {
  assert.match(styles, /html,body,body \*\{caret-color:transparent!important\}/);
  assert.match(styles, /input,textarea,select,\[contenteditable="true"\]\{caret-color:auto!important/);
  assert.match(script, /event\.key === 'F7'/);
  assert.match(script, /selection\.removeAllRanges\(\)/);
});

test('Windows uses recorded audio with a saved microphone and safe server configuration', () => {
  assert.match(script, /if \(v18IsWindows\(\)\) return v17ToggleServerVoice\(\)/);
  assert.match(script, /localStorage\.setItem\(V18_MIC_STORAGE, deviceId\)/);
  assert.match(script, /MediaRecorder/);
  assert.match(script, /peak < 0\.004/);
  assert.match(runtime, /configured: !!env\('OPENAI_API_KEY'\)/);
  assert.match(runtime, /model: env\('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe'\)/);
  assert.doesNotMatch(runtime, /apiKey:\s*env\('OPENAI_API_KEY'/);
});
