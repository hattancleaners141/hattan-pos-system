import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../v23-ai-intake-print.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');

test('V23 is loaded after V22',()=>{
  assert.ok(html.indexOf('v23-ai-intake-print.js') > html.indexOf('v22-customer-finance-spanish.js'));
});
test('typed intake uses Enter and separate ticket boundaries',()=>{
  assert.match(js,/v23AiEntryKeydown/);
  assert.match(js,/separate\\s\+ticket/);
  assert.match(js,/v23AdvanceTicket/);
});
test('natural dates include today tomorrow and next week weekdays',()=>{
  assert.match(js,/today/);
  assert.match(js,/tomorrow/);
  assert.match(js,/next\\s\+week/);
  assert.match(js,/thursday/);
});
test('batch printing sends exactly one receipt at a time',()=>{
  assert.match(js,/area\.innerHTML = receiptTicketHTML\(job\.order\)/);
  assert.doesNotMatch(js,/orders\.map\(receiptTicketHTML\)\.join/);
});
test('print receipt is direct without POS preview',()=>{
  assert.match(js,/posPrintReceipt = function v23PrintReceipt\(orderId\) \{ posDoPrint\(orderId\); \}/);
});

test('delivery receipt has large apartment, ticket and explicit account heroes',()=>{
  assert.match(js,/v23-delivery-unit/);
  assert.match(js,/v23-ticket-number/);
  assert.match(js,/v23-account-number/);
  assert.match(js,/<span>ACCOUNT<\/span>/);
});
test('separate ticket jobs wait 2.5 seconds for the thermal spooler',()=>{
  assert.match(js,/V23_PRINT_JOB_DELAY_MS = 2500/);
  assert.match(js,/setTimeout\(next, window\.V23_PRINT_JOB_DELAY_MS\)/);
});
