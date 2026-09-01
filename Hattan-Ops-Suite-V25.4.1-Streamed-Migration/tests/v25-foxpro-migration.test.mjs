import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../v25-migration-center.js', import.meta.url), 'utf8');

test('V25.3 retains the binary DBF reader and larger DBF limit', () => {
  assert.match(js, /25\.3\.0-cleaner-report-migration/);
  assert.match(js, /function parseDbf\(/);
  assert.match(js, /128\*1024\*1024/);
  assert.match(js, /file\.arrayBuffer\(\)/);
});

test('known Hattan customer and conveyor schemas have deterministic mappings', () => {
  assert.match(js, /function mapHattanCustomerDbf\(/);
  assert.match(js, /function mapHattanConveyorDbf\(/);
  assert.match(js, /r\.WLDEL===true/);
  assert.match(js, /ticket_number:ticket/);
  assert.match(js, /rack/);
});

test('protected and payment-like DBF fields are quarantined', () => {
  assert.match(js, /Protected legacy name\/address\/phone fields were not imported or sent to AI/);
  assert.match(js, /sensitive payment-like legacy fields were quarantined and excluded/);
  assert.doesNotMatch(js, /name:String\(r\.CU03C/);
});

test('Visual Cleaner CSV reports disguised as txt are parsed locally in full', () => {
  assert.match(js, /25\.3\.0-cleaner-report-migration/);
  assert.match(js, /recognized a delimited report despite/);
  assert.match(js, /'number','id'/);
  assert.match(js, /lastvisit/);
  assert.match(js, /joindate/);
});
