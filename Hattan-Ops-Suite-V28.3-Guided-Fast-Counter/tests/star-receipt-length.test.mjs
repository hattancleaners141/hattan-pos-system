import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../v8-operations-upgrade.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../v8-operations-upgrade.js', import.meta.url), 'utf8');

test('receipt print media removes the full-screen page height', () => {
  assert.match(css, /@page\{size:auto;margin:0\}/);
  assert.match(css, /html,body\{width:72mm!important;height:auto!important;min-height:0!important/);
  assert.match(css, /#print-area\{[^}]*width:72mm!important[^}]*height:auto!important[^}]*min-height:0!important/);
  assert.doesNotMatch(css, /@page\{size:80mm auto/);
  assert.match(index, /@media print \{[\s\S]*height:auto !important;[\s\S]*min-height:0 !important;/);
});

test('all live Star print actions use the receipt print helper', () => {
  assert.match(workflow, /function v8PrintReceiptArea\(delay = 120\)/);
  const directPrintCalls = workflow.match(/window\.print\(\)/g) || [];
  assert.equal(directPrintCalls.length, 1, 'only the centralized helper may call window.print()');
  assert.match(workflow, /v8PrintDeliveryBatch[\s\S]*v8PrintReceiptArea\(\);/);
  assert.match(workflow, /function v8PrintOrders[\s\S]*v8PrintReceiptArea\(\);/);
  assert.match(workflow, /function v11PrintHardwareTest[\s\S]*v8PrintReceiptArea\(\);/);
});
