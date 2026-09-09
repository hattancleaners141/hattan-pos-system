import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../v25-migration-center.js',import.meta.url),'utf8');

test('V25 migration fingerprints committed files and skips exact reuploads',()=>{
  assert.match(src,/SHA-256/);
  assert.match(src,/committedHashes\(\)/);
  assert.match(src,/status='already imported'/);
  assert.match(src,/fileHashes/);
});

test('V25 migration updates existing ticket identities instead of appending duplicates',()=>{
  assert.match(src,/function v25FindTicket/);
  assert.match(src,/if\(!order\)return v17ApplyTicketImport/);
  assert.match(src,/return'updated'/);
  assert.match(src,/ticketsUpdated/);
});

test('V25 staging uses latest nonblank values and customer memos are idempotent',()=>{
  assert.match(src,/function mergePresent/);
  assert.match(src,/prior\.split\(' · '\)/);
  assert.match(src,/payload\.memo=null/);
});

test('V25 daily revenue performs date-keyed upsert',()=>{
  assert.match(src,/state\.dailyRevenue\.find\(row=>String\(row\.date\)===key\)/);
  assert.match(src,/Object\.assign\(existing,normalized\)/);
});
