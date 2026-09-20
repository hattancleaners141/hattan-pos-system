import { json, handleError, methodNotAllowed, selectRows, staffSafe, storeId } from './lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    const rows = await selectRows('staff_accounts', `store_id=eq.${encodeURIComponent(storeId())}&active=eq.true&order=display_name.asc`, 'id,display_name,initials,manager,active,store_id');
    return json(200, { ok:true, staff:(rows || []).map(staffSafe), needsBootstrap:!(rows || []).length });
  } catch (error) { return handleError(error); }
};
