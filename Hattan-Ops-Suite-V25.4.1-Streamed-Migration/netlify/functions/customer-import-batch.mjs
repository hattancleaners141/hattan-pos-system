import { assertSameOrigin, handleError, HttpError, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, supabaseRest } from './lib/shared.mjs';

const clean = (value, max = 500) => value === null || value === undefined ? null : String(value).trim().slice(0, max) || null;
const money = value => value === null || value === undefined || value === '' ? null : Number(value);

function normalize(row, sourceFile) {
  const customerNumber = clean(row?.customer_number, 80);
  if (!customerNumber) return null;
  return {
    customer_number:customerNumber,
    name:clean(row.name, 250), phone:clean(row.phone, 80), email:clean(row.email, 250),
    address_line1:clean(row.address_line1, 500), apartment:clean(row.apartment, 100),
    city:clean(row.city, 120), state:clean(row.state, 80), postal_code:clean(row.postal_code, 30),
    balance:money(row.balance), store_credit:money(row.store_credit), memo:clean(row.memo, 5000),
    preferences:clean(row.preferences, 3000), default_fulfillment:clean(row.default_fulfillment, 40),
    last_visit:clean(row.last_visit, 80), join_date:clean(row.join_date, 80), route:clean(row.route, 120),
    customer_type:clean(row.customer_type, 80), source_file:clean(sourceFile, 250),
    legacy_payload:row.legacy_payload && typeof row.legacy_payload === 'object' ? row.legacy_payload : {},
  };
}

export const handler = async event => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    const session = requireSession(event, true);
    assertSameOrigin(event);
    if (String(event.body || '').length > 1_500_000) throw new HttpError(413, 'Import batch is too large');
    const body = parseBody(event), fileHash = clean(body.fileHash, 128), fileName = clean(body.fileName, 250);
    const batchIndex = Math.max(0, Number(body.batchIndex || 0)), totalRows = Math.max(0, Number(body.totalRows || 0));
    if (!/^[a-f0-9]{64}$/i.test(fileHash || '')) throw new HttpError(400, 'A valid SHA-256 file fingerprint is required');
    if (!fileName) throw new HttpError(400, 'File name is required');
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500) throw new HttpError(400, 'Each batch must contain 1 to 500 customers');

    const prior = await selectRows('migration_imports', `store_id=eq.${encodeURIComponent(storeId())}&file_hash=eq.${encodeURIComponent(fileHash)}&limit=1`, 'status,processed_rows,total_rows');
    if (prior?.[0]?.status === 'completed') return json(200, { ok:true, alreadyImported:true, processedRows:Number(prior[0].processed_rows || 0), totalRows:Number(prior[0].total_rows || 0) });

    const rows = body.rows.map(row => normalize(row, fileName)).filter(Boolean);
    if (!rows.length) throw new HttpError(400, 'This batch contains no valid customer numbers');
    const result = await supabaseRest('rpc/hattan_upsert_legacy_customers', {
      method:'POST', body:JSON.stringify({ p_store_id:storeId(), p_rows:rows }),
    });
    const processedRows = Math.min(totalRows || Number.MAX_SAFE_INTEGER, batchIndex * 500 + rows.length);
    const completed = body.finalBatch === true || (totalRows > 0 && processedRows >= totalRows);
    await supabaseRest('migration_imports?on_conflict=store_id,file_hash', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body:JSON.stringify({
        store_id:storeId(), file_hash:fileHash, file_name:fileName,
        status:completed ? 'completed' : 'processing', total_rows:totalRows,
        processed_rows:processedRows, inserted_rows:0,
        updated_rows:Math.max(0, Number(result?.affected || rows.length)),
        imported_by:session.sub, completed_at:completed ? new Date().toISOString() : null,
      }),
    });
    return json(200, { ok:true, batchIndex, accepted:rows.length, affected:Number(result?.affected || rows.length), processedRows, totalRows, completed });
  } catch (error) { return handleError(error); }
};
