import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../v14-workflow.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../v14-workflow.css', import.meta.url), 'utf8');

test('staff selection and Change PIN are separate buttons', () => {
  assert.match(script, /<div class="v14-staff-person/);
  assert.match(script, /class="v14-staff-select"/);
  assert.match(script, /<div class="v14-staff-actions"><button type="button" class="v14-link-btn"/);
  assert.doesNotMatch(script, /<button class="v14-staff-person/);
  assert.doesNotMatch(script, /class="v14-link-btn" role="button"/);
});

test('Change PIN occupies its own full-width row below the employee identity', () => {
  assert.match(styles, /\.v14-staff-person\s*\{[^}]*display:grid;[^}]*grid-template-rows:/s);
  assert.match(styles, /\.v14-staff-actions\s*\{[^}]*border-top:/s);
  assert.match(styles, /\.v14-link-btn\s*\{[^}]*width:100%;[^}]*min-height:38px;/s);
  assert.match(styles, /\.v14-staff-identity\s*\{[^}]*min-width:0;/s);
});
