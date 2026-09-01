import { handleError, json, methodNotAllowed, requireSession, selectRows, storeId } from './lib/shared.mjs';

function posCustomer(row) {
  const line1 = [row.address_line1, row.apartment ? `Apt ${row.apartment}` : ''].filter(Boolean).join(', ');
  const line2 = [row.city,row.state,row.postal_code].filter(Boolean).join(' ');
  const name = row.name || `Legacy Customer ${row.legacy_customer_number}`;
  return {
    id:`legacy_${row.legacy_customer_number}`, customerNumber:row.legacy_customer_number,
    legacyCustomerNumber:row.legacy_customer_number, name,
    initials:name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'CU',
    phone:row.phone || '', email:row.email || '', memberSince:row.join_date || 'Legacy import',
    lastVisit:row.last_visit || '', points:0, storeCredit:Number(row.store_credit || 0),
    openingBalance:Number(row.balance || 0), preferredChannel:/deliver/i.test(row.default_fulfillment || '')?'delivery':'pickup',
    defaultFulfillment:/deliver/i.test(row.default_fulfillment || '')?'delivery':'pickup',
    addresses:line1||line2?[{id:'legacy_home',label:'Home',street:row.address_line1||'',apartment:row.apartment||'',city:row.city||'',state:row.state||'',postalCode:row.postal_code||'',line1,line2,building:row.address_line1||'Legacy address'}]:[],
    paymentMethods:[], garmentPrefs:{starch:'light',fold:'hang',fragranceFree:false,notes:row.preferences||''},
    legacyMemo:row.memo || '', legacyRoute:row.route || '', legacyCustomerType:row.customer_type || '', normalizedLegacy:true,
  };
}

export const handler = async event => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    requireSession(event);
    const raw = String(event.queryStringParameters?.q || '').trim().slice(0,80);
    if (raw.length < 2) return json(200,{ok:true,customers:[]});
    const q = raw.replace(/[%*,()]/g,' ').replace(/\s+/g,' ').trim();
    const pattern = `*${q}*`, filter = encodeURIComponent(pattern);
    const rows = await selectRows('legacy_customers', `store_id=eq.${encodeURIComponent(storeId())}&or=(legacy_customer_number.ilike.${filter},name.ilike.${filter},phone.ilike.${filter},address_line1.ilike.${filter},postal_code.ilike.${filter})&order=updated_at.desc&limit=30`, 'legacy_customer_number,name,phone,email,address_line1,apartment,city,state,postal_code,balance,store_credit,memo,preferences,default_fulfillment,last_visit,join_date,route,customer_type');
    return json(200,{ok:true,customers:(rows||[]).map(posCustomer)});
  } catch (error) { return handleError(error); }
};
