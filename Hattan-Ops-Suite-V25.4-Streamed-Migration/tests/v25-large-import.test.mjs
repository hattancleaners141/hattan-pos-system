import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../v25-large-import.js', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../netlify/functions/customer-import-batch.mjs', import.meta.url), 'utf8');
const search = fs.readFileSync(new URL('../netlify/functions/customer-search.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('V25.4 streams large customer files in bounded batches', () => {
  assert.match(client, /25\.4\.0/);
  assert.match(client, /start\+=500/);
  assert.match(client, /customer-import-batch/);
  assert.match(batch, /body\.rows\.length > 500/);
  assert.match(batch, /1_500_000/);
});

test('normalized customers upsert by store and legacy customer number', () => {
  assert.match(schema, /create table if not exists public\.legacy_customers/);
  assert.match(schema, /unique \(store_id, legacy_customer_number\)/);
  assert.match(schema, /on conflict \(store_id, legacy_customer_number\) do update/);
  assert.match(schema, /coalesce\(excluded\.name,current\.name\)/);
  assert.match(schema, /create table if not exists public\.migration_imports/);
});

test('large imported customers are searched remotely and cached on demand', () => {
  assert.match(client, /customer-search\?q=/);
  assert.match(client, /normalizedLegacy/);
  assert.match(search, /limit=30/);
  assert.match(search, /requireSession\(event\)/);
  assert.match(html, /v25-large-import\.js/);
});

test('large import and customer search endpoints require authenticated sessions', () => {
  assert.match(batch, /requireSession\(event, true\)/);
  assert.match(batch, /assertSameOrigin\(event\)/);
  assert.match(search, /requireSession\(event\)/);
});
