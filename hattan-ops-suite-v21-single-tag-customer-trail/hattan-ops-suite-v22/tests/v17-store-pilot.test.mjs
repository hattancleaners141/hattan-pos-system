import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../v17-store-pilot.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../v17-store-pilot.css', import.meta.url), 'utf8');

test('secure startup is masked until the shared session finishes loading', () => {
  assert.match(index, /document\.documentElement\.classList\.add\([^\n]*'v17-booting'/);
  assert.match(index, /id="v17-boot-screen"/);
  assert.match(script, /const v17BaseBoot = v16Boot/);
  assert.match(script, /classList\.remove\('v17-booting'\)/);
});

test('thermal ticket is more legible without reintroducing blank paper feed', () => {
  assert.match(styles, /\.v11-item-detail\{font-size:11\.5px!important/);
  assert.match(styles, /\.v11-notes\{font-size:11px!important/);
  assert.doesNotMatch(styles, /\.v8-print-ticket[^}]*height:\s*(?:100vh|\d+(?:mm|in))/);
  assert.match(script, /class="v17-top-alert">RUSH/);
  assert.match(script, /class="v17-top-unit">APT/);
});

test('rush defaults to editable 4 PM and Tomorrow remains a full button', () => {
  assert.match(script, /rushReadyTime:'16:00'/);
  assert.match(script, /Customer ready time \(editable\)/);
  assert.match(styles, /\.v14-rush-btn,\.v14-tomorrow-btn\{width:100%/);
});

test('new material pricing is one flat line upcharge', () => {
  assert.match(script, /pricingVersion = 'flat-upcharge-v17'/);
  assert.match(script, /return v17Round\(base \+ Number\(line\.materialUpcharge \|\| 0\)\)/);
  assert.match(script, /added once per ticket line, not multiplied by garment quantity/);
});

test('tag assignment includes garment services and excludes wash and fold', () => {
  assert.match(script, /new Set\(\['dryclean', 'shirts', 'alterations'\]\)/);
  assert.doesNotMatch(script, /new Set\(\[[^\]]*'washfold'/);
  assert.match(script, /if \(V12_TAG_COLORS\[index\]\.name === 'Black'\)/);
  assert.match(script, /name:'White', hex:'#ffffff'/);
});

test('Windows voice intake preflights the microphone and keeps typed fallback', () => {
  assert.match(script, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(script, /Reliable Windows recording/);
  assert.match(script, /v16Api\('voice-transcribe'/);
  assert.match(script, /45000/);
  assert.match(script, /Windows Settings → Privacy &amp; security → Microphone/);
  assert.match(script, /Typed intake always remains available/);
});

test('legacy import is review-first and preserves balances and partial payments', () => {
  assert.match(script, /Review Complete — Apply Import/);
  assert.match(script, /A backup downloads automatically before Apply/);
  assert.match(script, /function v17RemoveImportRecord\(collection, index\)/);
  assert.match(script, /amountCharged:amountPaid, amountPaid/);
  assert.match(script, /v17ImportDate\(record\.created_at\)/);
  assert.match(script, /if \(value === null \|\| value === undefined \|\| String\(value\)\.trim\(\) === ''\) return null/);
});

test('customer delivery default controls newly created and printed tickets', () => {
  assert.match(script, /const fulfillment = customer && v17CustomerDefault\(customer\) === 'delivery' && !draft\.deliveryOverrideConfirmed \? 'delivery' : draft\.fulfillment/);
  assert.match(script, /const customerDefault = v17CustomerDefault\(customer\) === 'delivery'/);
});

test('live new-customer card entry is routed through Clover-hosted fields only', () => {
  assert.match(script, /document\.getElementById\('nc-card-fields'\)\?\.remove\(\)/);
  assert.match(script, /Card details go only into Clover-hosted fields/);
  assert.match(script, /ncDraft\.saveCard = false/);
});

test('Chinese printing has a global switch and negative legacy balances become credit', () => {
  assert.match(script, /state\.workflowSettings\?\.printChineseInstructions && row\.enabled && row\.zh/);
  assert.match(script, /if \(balance < 0\) customer\.storeCredit = Math\.max/);
});
