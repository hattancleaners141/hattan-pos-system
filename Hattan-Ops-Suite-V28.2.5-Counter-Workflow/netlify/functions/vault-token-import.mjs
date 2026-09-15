import { assertSameOrigin, handleError, HttpError, json, methodNotAllowed, parseBody, requireSession, insertRows } from './lib/shared.mjs';

const PANISH=/^(?:\d[ -]*?){13,19}$/;
function safe(v,n=180){ return String(v ?? '').trim().slice(0,n); }
export const handler=async event=>{
  if(event.httpMethod!=='POST') return methodNotAllowed('POST');
  try{
    assertSameOrigin(event);
    const session=requireSession(event,true);
    const body=parseBody(event), rows=Array.isArray(body.rows)?body.rows:[];
    if(!rows.length||rows.length>500) throw new HttpError(400,'Send 1 to 500 token rows at a time');
    const now=new Date().toISOString();
    const clean=rows.map((r,i)=>{
      const token=safe(r.clover_source_id||r.new_payment_token,300), customerId=safe(r.customer_id,120), cloverCustomer=safe(r.clover_customer_id||r.new_processor_customer_id,180);
      if(!customerId||!token||!cloverCustomer) throw new HttpError(400,`Row ${i+1}: customer_id, processor customer ID and payment token are required`);
      if(PANISH.test(token.replace(/[^0-9 -]/g,'')) && /^\d/.test(token)) throw new HttpError(400,`Row ${i+1}: possible raw card number rejected`);
      const last4=safe(r.last4,4); if(last4&&!/^\d{4}$/.test(last4)) throw new HttpError(400,`Row ${i+1}: last4 must be four digits`);
      return {store_id:session.storeId,customer_id:customerId,clover_customer_id:cloverCustomer,clover_source_id:token,brand:safe(r.brand,30)||null,last4:last4||null,exp_month:safe(r.exp_month,2)||null,exp_year:safe(r.exp_year,4)||null,active:true,consent_at:safe(r.consent_at,40)||now,consent_by:session.staffId||'migration',updated_at:now};
    });
    await insertRows('payment_vault',clean,'resolution=merge-duplicates,return=minimal');
    return json(200,{ok:true,imported:clean.length});
  }catch(error){ return handleError(error); }
};
