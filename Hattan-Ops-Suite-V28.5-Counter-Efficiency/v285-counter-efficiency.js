/* HATTAN OPS V28.5 — COUNTER EFFICIENCY, COLOR INTAKE & RELEVANT SEARCH */
const V28_5_VERSION='V28.5 Counter Efficiency';

function v285Plain(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function v285Digits(value){return String(value||'').replace(/\D/g,'')}
function v285CustomerFields(customer){
  const orders=state.orders.filter(order=>order.customerId===customer.id),addresses=(customer.addresses||[]).flatMap(address=>[address.street,address.line1,address.line2,address.apartment,address.unit,address.city,address.state,address.postalCode]);
  return {name:v285Plain(customer.name),phone:v285Digits(customer.phone),customerNumber:v285Plain(customer.customerNumber),email:v285Plain(customer.email),addresses:addresses.map(v285Plain).filter(Boolean),orders:orders.flatMap(order=>[order.id,order.ticket,order.barcode,order.tagNumber,...(order.tagNumbers||[])]).map(v285Plain).filter(Boolean)};
}
function v285PrefixWords(text,token){return v285Plain(text).split(/\s+/).some(word=>word.startsWith(token))}
function v285CustomerScore(customer,query){
  const q=v285Plain(query),tokens=q.split(/\s+/).filter(Boolean),digits=v285Digits(query),fields=v285CustomerFields(customer),nameWords=fields.name.split(/\s+/),all=[fields.name,fields.customerNumber,fields.email,...fields.addresses,...fields.orders];
  if(!q)return Infinity;
  if(digits&&!/[a-z]/.test(q))return fields.phone===digits?0:fields.phone.startsWith(digits)?2:(digits.length>=4&&fields.phone.includes(digits)?6:Infinity);
  if(/^[a-z]{1,2}$/.test(q)&&!nameWords.some(word=>word.startsWith(q)))return Infinity;
  const tokenPrefix=token=>nameWords.some(word=>word.startsWith(token))||all.some(field=>v285PrefixWords(field,token));
  if(tokens.length>1&&!tokens.every(token=>tokenPrefix(token)))return Infinity;
  if(fields.name===q||fields.customerNumber===q||digits&&(fields.phone===digits))return 0;
  if(nameWords.some(word=>word===q))return 1;
  if(nameWords.some(word=>word.startsWith(q)))return 2;
  if(digits&&fields.phone.startsWith(digits))return 2;
  if(fields.customerNumber.startsWith(q)||fields.addresses.some(field=>v285PrefixWords(field,q))||fields.orders.some(field=>v285PrefixWords(field,q)))return 3;
  if(tokens.length>1)return 4;
  if(q.length>=3&&(fields.name.includes(q)||fields.email.includes(q)||fields.addresses.some(field=>field.includes(q))||fields.orders.some(field=>field.includes(q))||digits&&fields.phone.includes(digits)))return 6;
  return Infinity;
}
v8CustomerSearchResults=function v285CustomerSearchResults(query){
  const q=String(query||'').trim();if(!q)return[];
  return state.customers.map((customer,index)=>({customer,index,score:v285CustomerScore(customer,q)})).filter(row=>Number.isFinite(row.score)).sort((a,b)=>a.score-b.score||a.customer.name.localeCompare(b.customer.name)||a.index-b.index).slice(0,12).map(row=>row.customer);
};

/* Laundered-shirt color is stored just like dry-cleaning color. */
const v285BaseFreshCounterDraft=freshCounterDraft;
freshCounterDraft=function v285FreshCounterDraft(){const draft=v285BaseFreshCounterDraft();draft.shirts.colorId='';draft.alteration.colorId='';return draft};
v8FreshCounterDraft=freshCounterDraft;

v9ShirtLine=function v285ShirtLine(){
  const shirts=counterDraft.shirts||{},garment=garmentById(shirts.packaging==='box'?'g_lshirt_box':'g_lshirt');if(!garment)return null;
  return {garmentId:garment.id,materialId:'standard',colorId:shirts.colorId||'none',qty:v9PositiveNumber(shirts.qty),unitPrice:garment.basePrice,buttonType:'standard',garmentNote:`${shirts.packaging==='box'?'Boxed':'On hanger'} · Starch: ${shirts.starch||'None'}`,serviceType:'shirts'};
};
window.v285SetShirtColor=function(colorId){counterDraft.shirts.colorId=colorId;counterDraft.shirts.touched=true;renderPosContent()};

const v285BaseParseShirts=v10ParseShirts;
v10ParseShirts=function v285ParseShirts(text){
  const base=v285BaseParseShirts(text);if(!base.length)return base;
  const colors=v10FindColors(text),source=base[0],qty=Math.max(1,Math.round(base.reduce((sum,item)=>sum+Number(item.qty||0),0)));
  if(!colors.length)return base.map(item=>({...item,colorId:'none',intakeSource:'ai'}));
  if(colors.length===1)return base.map(item=>({...item,colorId:colors[0],intakeSource:'ai'}));
  const lines=colors.slice(0,qty).map(colorId=>({...source,colorId,qty:1,intakeSource:'ai'}));
  if(lines.length<qty)lines.push({...source,colorId:'none',qty:qty-lines.length,garmentNote:[source.garmentNote,'Color not stated — verify'].filter(Boolean).join(' · '),intakeSource:'ai'});
  return lines;
};

/* Alterations now carry a visible, printable color. */
window.v285SetAlterationColor=function(colorId){counterDraft.alteration.colorId=colorId;counterDraft.alteration.touched=true;renderPosContent()};
v9AlterationLines=function v285AlterationLines(){
  const draft=counterDraft.alteration||{},alteration=ALTERATION_VARIANTS.find(item=>item.id===draft.variantId),garment=garmentById('g_alteration')||state.garmentCatalog[0];if(!alteration||!garment)return[];
  const qty=v9PositiveNumber(draft.qty),colorId=draft.colorId||'none',lines=[{garmentId:garment.id,materialId:'standard',colorId,qty,unitPrice:alteration.price,buttonType:'none',garmentNote:`${alteration.garment} · ${alteration.name}${draft.additionalInfo?' · '+draft.additionalInfo:''}`,serviceType:'alterations',alterationVariantId:alteration.id}];
  if(draft.dryCleanAlso){const dryGarment=garmentById(draft.dryCleanGarmentId);if(dryGarment)lines.push({garmentId:dryGarment.id,materialId:'standard',colorId,qty,unitPrice:dryGarment.basePrice,buttonType:'standard',garmentNote:`Dry clean after alteration · linked to ${alteration.garment} ${alteration.name}`,serviceType:'dryclean',linkedAlterationId:alteration.id})}
  return lines;
};

function v285ColorGridHTML(selected,handler,label){return `<div class="v285-color-block"><span class="field-label">${label}</span><div class="color-grid v28-color-grid v285-color-grid">${GARMENT_COLORS.map(color=>`<button type="button" class="color-tile ${selected===color.id?'selected':''}" onclick="${handler}('${color.id}')"><span class="color-swatch" style="background:${color.sw}"></span>${esc(color.name)}</button>`).join('')}</div></div>`}
function v285CollapseLineTools(content){content.querySelectorAll('.v9-saved-line>.v284-line-tools').forEach(tools=>{const details=document.createElement('details');details.className='v285-line-edit';details.innerHTML='<summary>Edit price, no charge or notes</summary>';tools.before(details);details.appendChild(tools)})}
function v285EnhanceCounter(content){
  if(state.posNav!=='counter')return;
  content.classList.add('v285-efficient-counter');
  const main=[...content.querySelectorAll('.pos-card')].find(card=>card.querySelector('.v4-service-tabs'))||[...content.querySelectorAll('.v13-scan-card')].find(card=>card.querySelector('button[onclick*="v4Add"]'));
  if(counterDraft.serviceMode==='shirts'&&main&&!main.querySelector('.v285-shirt-colors')){
    const anchor=[...main.querySelectorAll('button')].find(button=>/add shirts/i.test(button.textContent||''))||main.querySelector('#v28-shirt-qty')?.closest('label');
    if(anchor){const wrap=document.createElement('div');wrap.className='v285-shirt-colors';wrap.innerHTML=v285ColorGridHTML(counterDraft.shirts.colorId,'v285SetShirtColor','Shirt Color');anchor.before(wrap)}
  }
  if(counterDraft.serviceMode==='alterations'&&main&&!main.querySelector('.v285-alteration-colors')){
    const anchor=[...main.querySelectorAll('button')].find(button=>/add alteration/i.test(button.textContent||''))||main.querySelector('textarea');
    if(anchor){const wrap=document.createElement('div');wrap.className='v285-alteration-colors';wrap.innerHTML=v285ColorGridHTML(counterDraft.alteration.colorId,'v285SetAlterationColor','Garment Color');anchor.before(wrap)}
  }
  const visit=content.querySelector('.ticket-panel');if(visit){visit.classList.add('v285-follow-visit');visit.style.maxHeight='none';visit.style.overflow='visible'}
  v285CollapseLineTools(content);
}

const v285BasePostRender=v28PostRender;
v28PostRender=function v285PostRender(){v285BasePostRender();const content=document.getElementById('pos-content');if(content)v285EnhanceCounter(content)};

if(typeof renderPosRoot==='function'){const v285BaseRenderRoot=renderPosRoot;renderPosRoot=function(){const result=v285BaseRenderRoot();document.querySelectorAll('.ps-brand .wordmark small').forEach(element=>element.textContent=`Staff POS · ${V28_5_VERSION}`);return result};window.renderPosRoot=renderPosRoot}
queueMicrotask(()=>{const content=document.getElementById('pos-content');if(content)v285EnhanceCounter(content)});
