import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../v19-customer-controls.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../v19-customer-controls.css', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

test('V19 assets remain loaded after the V18 stability layer and are not cached', () => {
  assert.match(index, /<title>Hattan Cleaners — Ops Suite V(?:19 Customer Controls|20 Bilingual Session|21 Single Tag \+ Customer Trail)<\/title>/);
  assert.ok(index.indexOf('v19-customer-controls.js') > index.indexOf('v18-stability.js'));
  assert.ok(index.indexOf('v19-customer-controls.css') > index.indexOf('v18-stability.css'));
  assert.match(headers, /\/v19-customer-controls\.js[\s\S]*Cache-Control: no-cache/);
  assert.match(headers, /\/v19-customer-controls\.css[\s\S]*Cache-Control: no-cache/);
});

test('Tag Assign is limited to the three garment services and uses White, not Black', () => {
  assert.match(script, /new Set\(\['dryclean', 'shirts', 'alterations'\]\)/);
  assert.match(script, /Wash & Fold tickets do not use physical garment tags/);
  assert.match(script, /toLowerCase\(\) === 'black'/);
  assert.match(script, /name:'White', hex:'#ffffff'/);
});

test('new-ticket finance panel shows balances, reports and explicit credit consent', () => {
  assert.match(script, /Customer owes us/);
  assert.match(script, /Store credit/);
  assert.match(script, /Generate Report/);
  assert.match(script, /Text Report/);
  assert.match(script, /Email Report/);
  assert.match(script, /Use store credit on this visit\?/);
  assert.match(script, /Staff must choose Yes; it is never applied automatically/);
  assert.match(script, /externalBase \* 0\.03/);
});

test('store-credit ticket payments preserve an auditable mixed-tender breakdown', () => {
  assert.match(script, /source:'pickup_payment'/);
  assert.match(script, /'ticket_payment'/);
  assert.match(script, /paymentBreakdown = \{ storeCredit:/);
  assert.match(script, /storeCreditEntryId/);
  assert.match(script, /saveState\(\)/);
});

test('Wash and Fold production choices include bold Chinese beneath exact English labels', () => {
  assert.match(script, /lowdry:\{ label:'Low dry', zh:'低温烘干' \}/);
  assert.match(script, /nosoftener:\{ label:'No softener', zh:'不使用柔顺剂' \}/);
  assert.match(script, /delicate:\{ label:'Delicate cycle', zh:'轻柔洗涤' \}/);
  assert.match(script, /separate:\{ label:'Separate darks & whites', zh:'深色与白色分开' \}/);
  assert.match(script, /printChineseInstructions = true/);
  assert.match(styles, /\.v19-option-zh,\.v17-instruction-zh[\s\S]*font-weight:1000!important/);
});

test('delivery-default customers require a confirmed one-time Pickup override', () => {
  assert.match(script, /Customer Usually Receives Delivery/);
  assert.match(script, /Yes — Pickup This Ticket Only/);
  assert.match(script, /deliveryOverrideConfirmed = true/);
  assert.match(script, /order\?\.deliveryOverrideConfirmed && order\.fulfillment === 'pickup'/);
  assert.match(script, /future parser additions/);
});

test('thermal tickets print prominent apartment and RUSH markers at the top', () => {
  assert.match(script, /v19-top-rush/);
  assert.match(script, /v19-top-unit/);
  assert.match(script, /replace\(\/\\s\*\\\*\+\\s\*\$\//);
  assert.match(styles, /\.v19-top-rush\{[\s\S]*font-size:32px!important/);
  assert.match(styles, /\.v19-top-unit\{[\s\S]*font-size:41px!important/);
});
