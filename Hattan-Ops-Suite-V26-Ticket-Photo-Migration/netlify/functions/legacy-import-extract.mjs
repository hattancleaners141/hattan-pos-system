import {
  assertSameOrigin, env, handleError, HttpError, json, methodNotAllowed, parseBody, requireSession,
} from './lib/shared.mjs';

const nullableString={type:['string','null']}, nullableNumber={type:['number','null']}, nullableBoolean={type:['boolean','null']};
const importSchema={type:'object',additionalProperties:false,required:['customers','tickets','daily_revenue','warnings'],properties:{
  customers:{type:'array',items:{type:'object',additionalProperties:false,required:['customer_number','name','phone','email','address_line1','apartment','city','state','postal_code','balance','store_credit','memo','preferences','default_fulfillment'],properties:{customer_number:nullableString,name:nullableString,phone:nullableString,email:nullableString,address_line1:nullableString,apartment:nullableString,city:nullableString,state:nullableString,postal_code:nullableString,balance:nullableNumber,store_credit:nullableNumber,memo:nullableString,preferences:nullableString,default_fulfillment:nullableString}}},
  tickets:{type:'array',items:{type:'object',additionalProperties:false,required:['ticket_number','customer_number','customer_name','created_at','due_date','status','total','balance','service','items','notes','rack','paid'],properties:{ticket_number:nullableString,customer_number:nullableString,customer_name:nullableString,created_at:nullableString,due_date:nullableString,status:nullableString,total:nullableNumber,balance:nullableNumber,service:nullableString,items:nullableString,notes:nullableString,rack:nullableString,paid:nullableBoolean}}},
  daily_revenue:{type:'array',items:{type:'object',additionalProperties:false,required:['date','gross','net','cash','card','refunds'],properties:{date:nullableString,gross:nullableNumber,net:nullableNumber,cash:nullableNumber,card:nullableNumber,refunds:nullableNumber}}},
  warnings:{type:'array',items:{type:'string'}}
}};
function outputText(r){if(typeof r?.output_text==='string')return r.output_text;return(r?.output||[]).flatMap(i=>i?.content||[]).map(i=>i?.text||'').join('')}
function dataPart(body){
  const data=String(body.fileDataUrl||body.imageDataUrl||'');
  const mime=String(body.mimeType||'').toLowerCase();
  if(data){
    if(!/^data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+$/i.test(data))throw new HttpError(400,'Unreadable uploaded file');
    if(data.length>24_000_000)throw new HttpError(413,'Prepared file is too large. Split the report into smaller files.');
    if(mime==='application/pdf'||data.startsWith('data:application/pdf'))return{type:'input_file',file_data:data,filename:String(body.sourceName||'legacy.pdf').slice(0,160)};
    if(/^image\//.test(mime)||/^data:image\/(png|jpeg|jpg)/i.test(data))return{type:'input_image',image_url:data,detail:'high'};
    throw new HttpError(415,'This binary format should be uploaded as CSV/Excel/text, or converted to PDF/image first.');
  }
  const text=String(body.textContent||'').slice(0,180000);
  if(!text.trim())throw new HttpError(400,'No readable file content was supplied');
  if(/(?:\b(?:\d[ -]*?){13,19}\b)/.test(text))throw new HttpError(400,'Possible full payment-card numbers detected. For safety, remove card numbers and use the separate processor token-migration lane.');
  return{type:'input_text',text:`LEGACY FILE CONTENT\n${text}`};
}
export const handler=async event=>{
  if(event.httpMethod!=='POST')return methodNotAllowed('POST');
  try{
    assertSameOrigin(event);requireSession(event,true);const apiKey=env('OPENAI_API_KEY');if(!apiKey)throw new HttpError(503,'AI import is not enabled. Add OPENAI_API_KEY in Netlify. CSV/Excel/JSON deterministic imports still work without AI.');
    const body=parseBody(event),sourceName=String(body.sourceName||'legacy POS file').slice(0,160),part=dataPart(body);
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:env('OPENAI_IMPORT_MODEL','gpt-4.1-mini'),store:false,max_output_tokens:10000,
      input:[{role:'user',content:[{type:'input_text',text:`Extract only clearly supported legacy dry-cleaning POS data from ${sourceName}. Preserve every legible customer and ticket row, customer numbers, ticket numbers, dates, phone/email/address/apartment, A/R balances, store credits, notes/preferences, service/items, ticket status, paid/unpaid state, due dates, rack/conveyor/location, totals, and daily revenue when present. For CleanBase ticket screenshots, inspect the entire image including the customer/profile area behind or beside the ticket window so each ticket can be linked to the correct customer. Put all visible garment line details into items, including quantity, garment, color/material, unit price and alterations when legible. Do not guess obscured values. Use null for unreadable fields. Keep negative signs. Put ambiguities/truncated columns in warnings. NEVER return full payment card numbers, CVV/CVC, PINs, passwords, API keys, or authentication secrets; if encountered, omit them and add a warning.`},part]}],
      text:{format:{type:'json_schema',name:'hattan_v25_legacy_import',strict:true,schema:importSchema}}
    })});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new HttpError(response.status>=500?502:400,payload?.error?.message||'AI extractor could not read this file');const text=outputText(payload);if(!text)throw new HttpError(422,'No readable legacy data was found');let extracted;try{extracted=JSON.parse(text)}catch{throw new HttpError(502,'AI extractor returned an unreadable review draft')}
    return json(200,{ok:true,extracted,reviewRequired:true,sourceName});
  }catch(error){return handleError(error)}
};
