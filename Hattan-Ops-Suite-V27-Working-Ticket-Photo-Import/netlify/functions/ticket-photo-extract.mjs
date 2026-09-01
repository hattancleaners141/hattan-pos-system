import { assertSameOrigin, env, json, methodNotAllowed, parseBody, requireSession } from './lib/shared.mjs';

const nullableString={type:['string','null']};
const nullableNumber={type:['number','null']};
const nullableBoolean={type:['boolean','null']};
const schema={type:'object',additionalProperties:false,required:['customers','tickets','daily_revenue','warnings'],properties:{
  customers:{type:'array',items:{type:'object',additionalProperties:false,required:['customer_number','name','phone','email','address_line1','apartment','city','state','postal_code','balance','store_credit','memo','preferences','default_fulfillment'],properties:{customer_number:nullableString,name:nullableString,phone:nullableString,email:nullableString,address_line1:nullableString,apartment:nullableString,city:nullableString,state:nullableString,postal_code:nullableString,balance:nullableNumber,store_credit:nullableNumber,memo:nullableString,preferences:nullableString,default_fulfillment:nullableString}}},
  tickets:{type:'array',items:{type:'object',additionalProperties:false,required:['ticket_number','customer_number','customer_name','created_at','due_date','status','total','balance','service','items','notes','rack','paid'],properties:{ticket_number:nullableString,customer_number:nullableString,customer_name:nullableString,created_at:nullableString,due_date:nullableString,status:nullableString,total:nullableNumber,balance:nullableNumber,service:nullableString,items:nullableString,notes:nullableString,rack:nullableString,paid:nullableBoolean}}},
  daily_revenue:{type:'array',items:{type:'object',additionalProperties:false,required:['date','gross','net','cash','card','refunds'],properties:{date:nullableString,gross:nullableNumber,net:nullableNumber,cash:nullableNumber,card:nullableNumber,refunds:nullableNumber}}},
  warnings:{type:'array',items:{type:'string'}}
}};

function outputText(r){
  if(typeof r?.output_text==='string') return r.output_text;
  return (r?.output||[]).flatMap(i=>i?.content||[]).map(i=>i?.text||'').join('');
}

export const handler=async event=>{
  if(event.httpMethod!=='POST') return methodNotAllowed('POST');
  try{
    assertSameOrigin(event);
    requireSession(event,true);
    const apiKey=env('OPENAI_API_KEY');
    if(!apiKey) return json(503,{ok:false,setupRequired:true,error:'Ticket-photo reading is not configured on this Netlify site yet.'});
    const body=parseBody(event);
    const sourceName=String(body.sourceName||'CleanBase ticket photo').slice(0,220);
    const imageDataUrl=String(body.imageDataUrl||'');
    if(!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUrl)) return json(400,{ok:false,error:'The uploaded file is not a readable JPG/PNG image.'});
    if(imageDataUrl.length>17_000_000) return json(413,{ok:false,error:'This ticket photo is too large. Resize it below about 12 MB and retry.'});

    const model=env('OPENAI_IMPORT_MODEL','gpt-4.1-mini');
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,store:false,max_output_tokens:5000,
        input:[{role:'user',content:[
          {type:'input_text',text:`Read this CleanBase dry-cleaning POS ticket screenshot (${sourceName}). Extract ONLY what is visibly supported. The centered ticket window is the primary source. The customer panel behind it may contain the customer name, phone, street/address and apartment; use those only when legible. Preserve the ticket number exactly including hyphens. Extract drop-in/created date, due date, status/out date if useful, rack/location, quantity/service/item details, colors/materials, displayed unit or extended prices, discounts in the item/notes text when present, grand total, balance and paid state. For multiple garment lines, combine them into one concise items string without inventing details. If Balance is 0.00, paid=true. If Balance is greater than 0, paid=false. If a value is unreadable use null. Do not infer a customer number unless it is explicitly visible. Do not create daily revenue from an individual ticket screenshot. Never include payment card numbers, CVV, PINs, passwords or secrets. Add a warning for important ambiguity. Return one ticket when a ticket window is clearly visible.`},
          {type:'input_image',image_url:imageDataUrl,detail:'high'}
        ]}],
        text:{format:{type:'json_schema',name:'hattan_cleanbase_ticket_photo',strict:true,schema}}
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const message=payload?.error?.message||`OpenAI returned HTTP ${response.status}`;
      console.error('ticket-photo-extract',response.status,message);
      return json(502,{ok:false,error:`Ticket-photo reader could not process this image: ${message}`});
    }
    const text=outputText(payload);
    if(!text) return json(422,{ok:false,error:'No readable ticket data was found in this image.'});
    let extracted;
    try{extracted=JSON.parse(text)}catch{ return json(502,{ok:false,error:'Ticket-photo reader returned an unreadable result. Retry this image.'}); }
    if(!(extracted.tickets||[]).length) return json(422,{ok:false,error:'No ticket window could be read from this image.',details:extracted.warnings||[]});
    return json(200,{ok:true,extracted,reviewRequired:true,sourceName,model});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error(error);
    return json(status,{ok:false,error:String(error?.message||'Ticket-photo reader failed')});
  }
};
