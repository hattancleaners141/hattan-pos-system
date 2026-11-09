// /.netlify/functions/state-sync — how POS devices load and save the shop's data (V47).
//
// Shop settings (prices, racks, texting switches, staff alerts …) are one small versioned value in
// pos_state.payload. Tickets and customers are individual rows in pos_records, each with its own
// revision number, so a save only sends what changed and the shop can grow for years.
//
// GET  ?mode=initial[&after=REV&upto=REV] → settings + one page of: every customer, every open ticket,
//                                          and finished tickets changed in the last RECENT_DAYS
// GET  ?since=REV                          → settings + one page of records changed after REV
// GET  ?customer=ID                        → all of one customer's tickets (older history on demand)
// GET  (no parameters)                     → settings only
// PUT  { records:[{kind,id,baseRev,data}], snapshot?, baseVersion?, clientId }
//                                          → saves changed records (and settings, if sent)
// POST { op:'reserve', name:'ticket'|'customer', count, atLeast } → { first } — a block of numbers
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, supabaseRest, HttpError } from './lib/shared.mjs';
import { PAGE_SIZE, RECENT_DAYS, RECORD_SELECT, RETIRED_PAYLOAD_KEYS, ensureMigrated, isoDaysAgo, ordersForCustomers, putRecords, readSettings, reserveNumbers, stripSecrets } from './lib/records.mjs';
import { staffAlert } from './lib/alerts.mjs';

const SHARED_KEYS = new Set([
  'staff', 'clockLog', 'pendingSync', 'campaigns', 'automatedTexts', 'rackSettings', 'printSettings',
  'customerMemos', 'interfaceSettings', 'garmentCatalog', 'materials', 'nextConveyorNumber',
  'deliveryBatches', 'nextDeliveryBatch', 'hardwareProfile', 'v14InstructionOrder',
  'workflowSettings', 'instructionTranslations', 'legacyImports', 'dailyRevenue',
  'recentCustomerViews', 'legacyRevenueHistory', 'migrationAudit',
  'tailorHandoffs', // V44: tailor iPad → counter checkout
  'staffAlerts', // V38: customer replies + cards saved from text links (written by the server)
]);
const KINDS = new Set(['order', 'customer']);
const NUMBER_NAMES = new Set(['ticket', 'customer']);
const sid = () => encodeURIComponent(storeId());

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new HttpError(400, 'Shared state must be an object');
  const safe = {};
  for (const [key, value] of Object.entries(snapshot)) if (SHARED_KEYS.has(key)) safe[key] = stripSecrets(value);
  return safe;
}
function settingsReply(s) {
  return { exists: s.exists, version: s.version, snapshot: s.exists ? s.payload : null, recordsRev: s.recordsRev, updatedAt: s.row?.updated_at, updatedBy: s.row?.updated_by, updatedClient: s.row?.updated_client };
}
async function page(filter, after) {
  const rows = await selectRows('pos_records', `store_id=eq.${sid()}&rev=gt.${after}${filter}&order=rev.asc&limit=${PAGE_SIZE}`, RECORD_SELECT);
  const records = rows || [];
  return { records, next: records.length === PAGE_SIZE ? Number(records[records.length - 1].rev) : null };
}
const nonNegInt = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };

export const handler = async (event) => {
  if (!['GET', 'PUT', 'POST'].includes(event.httpMethod)) return methodNotAllowed('GET, PUT, POST');
  try {
    const session = requireSession(event);
    await ensureMigrated();

    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const settings = await readSettings();
      const base = { ok: true, ...settingsReply(settings) };
      if (q.customer) {
        const rows = await ordersForCustomers([String(q.customer)], { limit: 5000 });
        return json(200, { ...base, records: rows.map(r => ({ kind: r.kind, id: r.id, rev: Number(r.rev), data: r.data, deleted: !!r.deleted })) });
      }
      if (q.mode === 'initial') {
        // `upto` is fixed when loading starts; anything saved during loading arrives in the
        // next ?since=upto catch-up, so nothing is missed.
        const upto = q.upto ? nonNegInt(q.upto) : settings.recordsRev;
        const filter = `&rev=lte.${upto}&deleted=eq.false&or=${encodeURIComponent(`(kind.eq.customer,open.eq.true,updated_at.gt.${isoDaysAgo(RECENT_DAYS)})`)}`;
        const p = await page(filter, nonNegInt(q.after));
        return json(200, { ...base, upto, ...p });
      }
      if (q.since !== undefined) {
        const p = await page('', nonNegInt(q.since));
        return json(200, { ...base, ...p });
      }
      return json(200, base);
    }

    assertSameOrigin(event);
    if (String(event.body || '').length > 5_500_000) throw new HttpError(413, 'Too much to save at once');
    const body = parseBody(event);
    const clientId = String(body.clientId || '').slice(0, 100);

    if (event.httpMethod === 'POST') {
      if (body.op !== 'reserve') throw new HttpError(400, 'Unknown request');
      const name = String(body.name || '');
      if (!NUMBER_NAMES.has(name)) throw new HttpError(400, 'Unknown number type');
      const count = Math.max(1, Math.min(200, Math.round(Number(body.count) || 1)));
      const atLeast = Math.max(1, Math.min(9_000_000_000, Math.round(Number(body.atLeast) || 1)));
      const first = await reserveNumbers(name, count, atLeast);
      return json(200, { ok: true, name, first, count });
    }

    // PUT — records first (each one is checked on its own), then settings.
    const records = (Array.isArray(body.records) ? body.records : []).slice(0, 2000).map(r => ({
      kind: String(r?.kind || ''), id: String(r?.id || '').slice(0, 200), baseRev: nonNegInt(r?.baseRev), data: stripSecrets(r?.data),
    })).filter(r => KINDS.has(r.kind) && r.id && r.data && typeof r.data === 'object' && !Array.isArray(r.data) && String(r.data.id || '') === r.id);
    const result = { ok: true };
    if (records.length) {
      result.records = await putRecords(records, session.sub, clientId);
      if (result.records.renamed.length) {
        const list = result.records.renamed.map(r => r.ticket ? `#${r.ticket}` : r.from).join(', ');
        try { await staffAlert({ type: 'sync', title: 'Two devices used the same ticket number', text: `Ticket ${list} was written on two devices at once. Both tickets were kept — the second is now ${result.records.renamed.map(r => r.to).join(', ')}. Check the garment tags.` }); } catch (_) {}
      }
    }
    if (body.snapshot) {
      const payload = sanitizeSnapshot(body.snapshot);
      RETIRED_PAYLOAD_KEYS.forEach(k => delete payload[k]);
      const r = await supabaseRest('rpc/hattan_sync_state', {
        method: 'POST',
        body: JSON.stringify({ p_store_id: storeId(), p_base_version: nonNegInt(body.baseVersion), p_payload: payload, p_staff_id: session.sub, p_client_id: clientId }),
      });
      if (r?.conflict) {
        const now = await readSettings();
        result.settings = { conflict: true, ...settingsReply(now) };
      } else {
        result.settings = { conflict: false, version: Number(r?.version || 0), updatedAt: r?.updated_at };
        result.version = result.settings.version;
      }
    }
    return json(200, result);
  } catch (error) { return handleError(error); }
};
