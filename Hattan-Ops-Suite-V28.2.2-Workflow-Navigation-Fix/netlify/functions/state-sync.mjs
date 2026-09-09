import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requireSession, selectRows, storeId, supabaseRest, HttpError } from './lib/shared.mjs';

const SHARED_KEYS = new Set([
  'customers', 'staff', 'orders', 'clockLog', 'pendingSync', 'nextTicket',
  'campaigns', 'automatedTexts', 'rackSettings', 'printSettings',
  'customerMemos', 'interfaceSettings', 'garmentCatalog', 'materials',
  'nextConveyorNumber', 'deliveryBatches', 'nextDeliveryBatch',
  'nextCustomerNumber', 'hardwareProfile', 'v14InstructionOrder',
]);

function stripSecrets(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.slice(0, 20000).map(item => stripSecrets(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(pin|pinHash|pinSalt|pinIterations|processorToken|privateToken|cardNumber|cvv|cvc|securityCode)$/i.test(key)) continue;
    if (/dataUrl/i.test(key)) continue;
    safe[key] = stripSecrets(item, depth + 1);
  }
  return safe;
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new HttpError(400, 'Shared state must be an object');
  const safe = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (SHARED_KEYS.has(key)) safe[key] = stripSecrets(value);
  }
  return safe;
}

export const handler = async (event) => {
  if (!['GET', 'PUT'].includes(event.httpMethod)) return methodNotAllowed('GET, PUT');
  try {
    const session = requireSession(event);
    if (event.httpMethod === 'GET') {
      const rows = await selectRows('pos_state', `store_id=eq.${encodeURIComponent(storeId())}&limit=1`, 'store_id,version,payload,updated_at,updated_by,updated_client');
      const row = rows?.[0];
      if (!row) return json(200, { ok:true, exists:false, version:0, snapshot:null });
      return json(200, { ok:true, exists:true, version:Number(row.version || 0), snapshot:row.payload || {}, updatedAt:row.updated_at, updatedBy:row.updated_by, updatedClient:row.updated_client });
    }
    assertSameOrigin(event);
    if (String(event.body || '').length > 5_000_000) throw new HttpError(413, 'Shared state is too large to save');
    const body = parseBody(event);
    const payload = sanitizeSnapshot(body.snapshot);
    const result = await supabaseRest('rpc/hattan_sync_state', {
      method:'POST',
      body:JSON.stringify({
        p_store_id:storeId(),
        p_base_version:Math.max(0, Number(body.baseVersion || 0)),
        p_payload:payload,
        p_staff_id:session.sub,
        p_client_id:String(body.clientId || '').slice(0, 100),
      }),
    });
    if (result?.conflict) return json(409, { ok:false, conflict:true, version:Number(result.version || 0), snapshot:result.payload || {}, updatedAt:result.updated_at, updatedBy:result.updated_by, updatedClient:result.updated_client });
    return json(200, { ok:true, version:Number(result?.version || 0), updatedAt:result?.updated_at, updatedBy:session.name });
  } catch (error) { return handleError(error); }
};
