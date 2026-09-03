/* HATTAN OPS V28.4 — LINE CONTROLS + THERMAL TICKET FIX */
const V28_4_VERSION='V28.4 Line Controls & Ticket Fix';

/* Explicit choices: blank still means staff has not answered. */
if(!GARMENT_COLORS.some(c=>c.id==='none'))GARMENT_COLORS.push({id:'none',name:'None',sw:'#fff'});
if(!GARMENT_COLORS.some(c=>c.id==='multicolor'))GARMENT_COLORS.push({id:'multicolor',name:'Multi Color',sw:'conic-gradient(#e44 0 16%,#edc53b 16% 33%,#49a764 33% 50%,#4388d8 50% 67%,#8354b8 67% 84%,#111 84%)'});
if(!BAG_COLORS.includes('None'))BAG_COLORS.push('None');
if(!BAG_COLORS.includes('Multi Color'))BAG_COLORS.push('Multi Color');

const V284_CONDITIONS={stain:'Stain',delicate:'Delicate',defective:'Defective Condition'};
function v284EnsureBuilder(){if(!counterDraft?.builder)return null;counterDraft.builder.conditionFlags=counterDraft.builder.conditionFlags||[];return counterDraft.builder}
window.v284ToggleCondition=function(id){const b=v284EnsureBuilder();if(!b)return;const at=b.conditionFlags.indexOf(id);if(at>=0)b.conditionFlags.splice(at,1);else b.conditionFlags.push(id);renderPosContent()};
window.v284ToggleNoCharge=function(){const b=v284EnsureBuilder();if(!b)return;b.priceMode=b.priceMode==='no_charge'?null:'no_charge';if(b.priceMode==='no_charge')b.customUnitPrice=0;else b.customUnitPrice='';renderPosContent()};
window.v284SetManualPrice=function(value){const b=v284EnsureBuilder();if(!b)return;const text=String(value??'').trim();if(text===''){b.customUnitPrice='';if(b.priceMode==='manual')b.priceMode=null}else{b.customUnitPrice=Math.max(0,Number(text)||0);b.priceMode='manual'}v9RefreshVisitDraft()};
window.v284SetBuilderNote=function(value){const b=v284EnsureBuilder();if(!b)return;b.garmentNote=value;v9RefreshVisitDraft()};

/* Build the line here so custom price and do-over status cannot merge into a regular-price line. */
v9CommitDryCleaning=function v284CommitDryCleaning(render=true){
  const b=counterDraft?.builder;if(!b?.garmentId)return false;
  if(!b.colorId){if(render)toast('Choose the garment color before adding it',false,'alerttriangle');return false}
  const flags=(b.conditionFlags||[]).map(id=>V284_CONDITIONS[id]).filter(Boolean),notes=[b.garmentNote||'',...flags];
  if(v8IsPants(b.garmentId)&&counterDraft.crease)notes.push(counterDraft.crease==='nocrease'?'No crease':'Crease');
  if(b.priceMode==='no_charge')notes.unshift('NO CHARGE / DO OVER');
  const manual=b.priceMode==='manual',noCharge=b.priceMode==='no_charge';
  const line={garmentId:b.garmentId,materialId:b.materialId||'standard',colorId:b.colorId,qty:v9PositiveNumber(b.qty),unitPrice:noCharge?0:(manual?Math.max(0,Number(b.customUnitPrice)||0):garmentUnitPrice(b.garmentId)),buttonType:b.buttonType||'standard',garmentNote:notes.filter(Boolean).join(' · '),serviceType:'dryclean',conditionFlags:(b.conditionFlags||[]).slice(),priceMode:noCharge?'no_charge':(manual?'manual':null),isRedo:noCharge};
  if(manual||noCharge){line.pricingVersion='flat-upcharge-v17';line.materialUpcharge=0}else v17StampFlatLine(line);
  if(Number.isInteger(b.editingIndex))counterDraft.items[b.editingIndex]=line;else if(manual||noCharge||flags.length||b.garmentNote)counterDraft.items.push(line);else v9AddOrMergeLine(line);
  counterDraft.builder={tab:'garment',garmentId:null,materialId:'standard',colorId:'',qty:1,buttonType:'standard',garmentNote:'',conditionFlags:[],priceMode:null,customUnitPrice:''};counterDraft.crease='';counterDraft.serviceDueDates.dryclean||=v8DefaultDue('dryclean');
  if(render)renderPosContent();return true;
};

const v284BasePendingSubtotal=v9PendingSubtotal;
v9PendingSubtotal=function(){const b=counterDraft?.builder;if(counterDraft?.serviceMode==='dryclean'&&b?.garmentId){if(b.priceMode==='no_charge')return 0;if(b.priceMode==='manual')return v17Round(Math.max(0,Number(b.customUnitPrice)||0)*v9PositiveNumber(b.qty))}return v284BasePendingSubtotal()};

window.v284SetLinePrice=function(index,value){const line=counterDraft?.items?.[index];if(!line)return;line.unitPrice=Math.max(0,Number(value)||0);line.priceMode='manual';line.pricingVersion='flat-upcharge-v17';line.materialUpcharge=0;renderPosContent()};
window.v284ToggleLineNoCharge=function(index){const line=counterDraft?.items?.[index];if(!line)return;if(line.priceMode==='no_charge'){line.priceMode='manual';line.unitPrice=Number(line.previousUnitPrice||garmentById(line.garmentId)?.basePrice||0);line.isRedo=false}else{line.previousUnitPrice=Number(line.unitPrice||0);line.unitPrice=0;line.materialUpcharge=0;line.pricingVersion='flat-upcharge-v17';line.priceMode='no_charge';line.isRedo=true;if(!/NO CHARGE \/ DO OVER/i.test(line.garmentNote||''))line.garmentNote=['NO CHARGE / DO OVER',line.garmentNote].filter(Boolean).join(' · ')}renderPosContent()};
window.v284SetLineNote=function(index,value){const line=counterDraft?.items?.[index];if(line)line.garmentNote=value};

function v284BuilderControlsHTML(){const b=v284EnsureBuilder(),flags=b?.conditionFlags||[],regular=b?.garmentId?garmentUnitPrice(b.garmentId):0;return `<div class="v284-builder-controls"><div class="v284-condition-row"><button type="button" class="v284-condition ${flags.includes('stain')?'selected':''}" onclick="v284ToggleCondition('stain')">STAIN</button><button type="button" class="v284-condition ${flags.includes('delicate')?'selected':''}" onclick="v284ToggleCondition('delicate')">DELICATE</button><button type="button" class="v284-condition ${flags.includes('defective')?'selected':''}" onclick="v284ToggleCondition('defective')">DEFECTIVE CONDITION</button></div><div class="v284-price-row"><label><span>One-Off Unit Price</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Regular ${money(regular)}" value="${b?.priceMode==='manual'?esc(b.customUnitPrice):''}" oninput="v284SetManualPrice(this.value)"></label><button type="button" class="v284-no-charge ${b?.priceMode==='no_charge'?'selected':''}" onclick="v284ToggleNoCharge()">NO CHARGE / DO OVER</button></div><label class="v284-garment-note"><span>Notes for This Garment</span><textarea rows="2" placeholder="Stain location, damage, special handling or any other details…" oninput="v284SetBuilderNote(this.value)">${esc(b?.garmentNote||'')}</textarea></label></div>`}

function v284EnhanceSavedLines(content){content.querySelectorAll('.v9-saved-line').forEach((lineNode,index)=>{if(lineNode.querySelector('.v284-line-tools'))return;const line=counterDraft?.items?.[index];if(!line)return;lineNode.insertAdjacentHTML('beforeend',`<div class="v284-line-tools"><label><span>Unit Price</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${Number(line.unitPrice||0).toFixed(2)}" onchange="v284SetLinePrice(${index},this.value)"></label><button type="button" class="v284-line-nocharge ${line.priceMode==='no_charge'?'selected':''}" onclick="v284ToggleLineNoCharge(${index})">No Charge / Do Over</button><label class="v284-line-note"><span>Notes for This Line</span><textarea rows="2" placeholder="Add or elaborate on this garment/order line…" oninput="v284SetLineNote(${index},this.value)">${esc(line.garmentNote||'')}</textarea></label></div>`)});}

function v284EnhanceCounter(content){
  if(state.posNav!=='counter')return;
  const card=[...content.querySelectorAll('.pos-card')].find(node=>node.querySelector('.v4-service-tabs'));
  if(card&&counterDraft?.serviceMode==='dryclean'&&!card.querySelector('.v284-builder-controls')){
    const details=card.querySelector('details.v8-special-details'),colorLabel=[...card.querySelectorAll('.field-label')].find(el=>/^4\.\s*Color/i.test(el.textContent||''));
    if(details)details.insertAdjacentHTML('afterend',v284BuilderControlsHTML());else colorLabel?.insertAdjacentHTML('beforebegin',v284BuilderControlsHTML());
  }
  v284EnhanceSavedLines(content);
}

/* Split old imported semicolon paragraphs and compute pieces from real quantities. */
function v284LegacyParts(order){if((order.lineItems||order.itemsDetail||[]).length)return[];const raw=String(order.items||'').replace(/^\s*(?:dry cleaning|laundered shirts|alterations)\s*[·:\-]?\s*/i,'').trim();const parts=raw.split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean);return parts.length>1?parts:[]}
function v284PieceCount(order,service){if(service==='washfold')return Number((order.lineItems||[])[0]?.qty||order.pieceCount||1);const items=order.lineItems||order.itemsDetail||[];const structured=items.reduce((sum,line)=>sum+(Number(line.qty)||0),0);if(structured>0)return structured;const legacy=v284LegacyParts(order).reduce((sum,text)=>sum+(Number(text.match(/^\s*(\d+(?:\.\d+)?)\b/)?.[1])||0),0);return legacy||Number(order.pieceCount||1)}

const v284BaseReceipt=window.receiptTicketHTML||receiptTicketHTML;
window.receiptTicketHTML=function v284ReceiptTicketHTML(order){
  let html=v284BaseReceipt(order),address=v8AddressForOrder(order),unit=String(address?.apartment||address?.unit||address?.apt||'').replace(/^(?:apt\.?|apartment|unit|#)\s*/i,'').replace(/\s*\*+\s*$/,'').trim(),service=v8OrderService(order),pieces=v284PieceCount(order,service),legacy=v284LegacyParts(order);
  html=html.replace('<section class="v8-print-ticket v11-photo-ticket">','<section class="v8-print-ticket v11-photo-ticket v284-receipt">');
  html=html.replace(/<div class="v23-delivery-unit-label">[\s\S]*?<\/div>(?:<div class="v23-delivery-unit">[\s\S]*?<\/div>)?/,'').replace(/<div class="v17-top-unit[^>]*">[\s\S]*?<\/div>/,'');
  if(unit)html=html.replace('<div class="v11-store-name">',`<div class="v284-apartment-label">APARTMENT / UNIT</div><div class="v284-apartment">#${esc(unit.toUpperCase())}</div><div class="v11-store-name">`);
  if(legacy.length){const rows=legacy.map(part=>`<div class="v11-item-line v284-legacy-line"><div class="rt-row"><strong>${esc(part.toUpperCase())}</strong></div></div>`).join('');html=html.replace(/<div class="v11-item-line">[\s\S]*?<\/div><\/div>(?=(?:<div class="v11-notes"|<div class="rt-hr"))/,rows)}
  const countText=service==='washfold'?`${pieces} lb`:`${pieces} ${pieces===1?'pc':'pcs'}`;html=html.replace(/<div class="v11-piece-count">[\s\S]*?<\/div>/,`<div class="v11-piece-count">${esc(String(countText))}</div>`);return html;
};
try{receiptTicketHTML=window.receiptTicketHTML}catch(_error){}

const v284BasePostRender=v28PostRender;
v28PostRender=function(){v284BasePostRender();const content=document.getElementById('pos-content');if(content)v284EnhanceCounter(content)};
if(typeof renderPosRoot==='function'){const v284BaseRenderRoot=renderPosRoot;renderPosRoot=function(){const result=v284BaseRenderRoot();document.querySelectorAll('.ps-brand .wordmark small').forEach(el=>el.textContent=`Staff POS · ${V28_4_VERSION}`);return result};window.renderPosRoot=renderPosRoot}
queueMicrotask(()=>{const content=document.getElementById('pos-content');if(content)v284EnhanceCounter(content)});

/* ---------------- V28.4 CORRECTION PASS: LIVE COUNTER BEHAVIOR ---------------- */

/* Quantity is a batch target. Each color tap records one garment, keeps the chosen
   garment/material active, and counts down so mixed colors can be entered quickly. */
window.v28PickAndAddColor=function v284PickAndAddColor(colorId){
  const b=counterDraft?.builder;
  if(!b?.garmentId)return toast('Choose the garment type first',false,'alerttriangle');
  const remaining=Math.max(1,Math.round(Number(b.qty)||1));
  const garmentId=b.garmentId,materialId=b.materialId||'standard',buttonType=b.buttonType||'standard';
  b.colorId=colorId;b.qty=1;
  if(!v9CommitDryCleaning(false))return;
  if(remaining>1){
    counterDraft.builder={tab:'garment',garmentId,materialId,colorId:'',qty:remaining-1,buttonType,garmentNote:'',conditionFlags:[],priceMode:null,customUnitPrice:''};
    toast(`${remaining-1} piece${remaining-1===1?'':'s'} remaining — tap the next color`,true,'checkcircle');
  }else toast('Garment batch added',true,'checkcircle');
  renderPosContent();
};

/* Keep the selected special material available during a multi-piece batch. */
const v284BaseSetMaterial=posSetBuilderMaterial;
posSetBuilderMaterial=function v284SetBuilderMaterial(id){
  const garmentId=counterDraft?.builder?.garmentId,qty=counterDraft?.builder?.qty;
  const result=v284BaseSetMaterial(id);
  if(counterDraft?.builder&&garmentId){counterDraft.builder.garmentId=garmentId;counterDraft.builder.qty=qty;counterDraft.builder.materialId=id}
  return result;
};
window.posSetBuilderMaterial=posSetBuilderMaterial;

/* Arrow keys scroll the active POS surface anywhere except while editing a field. */
document.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
  const target=event.target;
  if(target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
  const modal=document.querySelector('.pos-modal-overlay.show .pos-modal');
  const surface=modal||document.querySelector('.pos-content')||document.scrollingElement;
  if(!surface)return;
  event.preventDefault();
  surface.scrollBy({top:event.key==='ArrowDown'?150:-150,behavior:'auto'});
},{capture:true});

/* Correct explicit mixed-color speech such as:
   “3 blouses, one is blue, navy, green silk” => exactly three one-piece lines. */
const v284BaseParseDryGarments=v10ParseDryGarments;
v10ParseDryGarments=function v284ParseDryGarments(text,warnings){
  const normalized=String(text||''),matches=v10GarmentMatches(normalized);
  if(matches.length!==1)return v284BaseParseDryGarments(text,warnings);
  const match=matches[0];
  if(v10IsNonDryGarmentContext(normalized,match))return v284BaseParseDryGarments(text,warnings);
  const prefix=normalized.slice(0,match.index),suffix=v10TrimAtService(normalized.slice(match.end));
  const quantity=v10QuantityBefore(prefix),colors=v10FindColors(suffix),g=garmentById(match.id);
  if(!quantity.explicit||!g)return v284BaseParseDryGarments(text,warnings);
  const qty=Math.max(1,Math.round(quantity.value||1)),context=`${prefix} ${suffix}`,materialId=v10FindMaterial(context),buttonType=v10ButtonType(context),note=v10GarmentModifiers(context).join(' · ');
  if(colors.length>1){
    const lines=colors.slice(0,qty).map(colorId=>({garmentId:g.id,materialId,colorId,qty:1,unitPrice:garmentUnitPrice(g.id),buttonType,garmentNote:note,serviceType:'dryclean',intakeSource:'ai'}));
    if(lines.length<qty){const missing=qty-lines.length;lines.push({garmentId:g.id,materialId,colorId:'none',qty:missing,unitPrice:garmentUnitPrice(g.id),buttonType,garmentNote:[note,'Color not stated — verify'].filter(Boolean).join(' · '),serviceType:'dryclean',intakeSource:'ai'});warnings.push(`${g.name}: ${missing} color${missing===1?' is':'s are'} still needed.`)}
    if(colors.length>qty)warnings.push(`${g.name}: more colors than the stated quantity; only the first ${qty} were used.`);
    return lines;
  }
  const colorId=colors[0]||'none';
  if(!colors.length)warnings.push(`${g.name}: color was not stated.`);
  return [{garmentId:g.id,materialId,colorId,qty,unitPrice:garmentUnitPrice(g.id),buttonType,garmentNote:note,serviceType:'dryclean',intakeSource:'ai'}];
};

function v284PrintNote(value){return String(value||'').replace(/(?:^|\s*[·—-]\s*)AI\s*(?:voice|intake)(?:\s*[—-]\s*verify exact measurement)?/ig,'').replace(/\s*·\s*·\s*/g,' · ').replace(/^\s*·|·\s*$/g,'').trim()}
function v284ReceiptLineHTML(item,service){
  const garment=garmentById(item.garmentId),qty=Math.max(0,Number(item.qty)||0),name=String(garment?.name||'Service item').toUpperCase();
  const detail=[];
  if(item.colorId&&!['print','none'].includes(item.colorId))detail.push(colorById(item.colorId)?.name||item.colorId);
  if(item.colorId==='none')detail.push('COLOR: NONE');
  if(item.materialId&&!['standard','cotton'].includes(item.materialId))detail.push(materialById(item.materialId)?.name||item.materialId);
  const cleanNote=v284PrintNote(item.garmentNote);if(cleanNote)detail.push(cleanNote);
  const amount=typeof v17LineTotal==='function'?v17LineTotal(item):(Number(item.unitPrice)||0)*qty;
  return `<div class="v11-item-line"><div class="rt-row"><strong>${esc(service==='washfold'?`${qty} LB`:`${qty} - ${name}`)}</strong><strong>${money(amount)}</strong></div>${detail.length?`<div class="v11-item-detail">${esc(detail.join(' · ').toUpperCase())}</div>`:''}</div>`;
}

/* Own the final thermal-ticket markup instead of modifying an older receipt string. */
window.receiptTicketHTML=function v284CorrectedReceipt(order){
  const customer=order.customerId?customerById(order.customerId):null,address=v8AddressForOrder(order),serviceId=v8OrderService(order),service=V8_SERVICE_NAMES[serviceId]||'Cleaning';
  const isDelivery=order.fulfillment==='delivery'||order.channel==='delivery',unit=String(address?.apartment||address?.unit||address?.apt||'').replace(/^(?:apt\.?|apartment|unit|#)\s*/i,'').trim();
  const subtotal=Number(order.subtotal??order.total??0),fee=Number(order.surcharge||0),tax=Number(order.tax||0),grand=subtotal+fee+tax,prepaid=Math.min(grand,Math.max(0,Number(order.amountCharged??(order.paid?grand:0))||0)),balance=Math.max(0,grand-prepaid),paid=balance<.005;
  const ticket=v11TicketNumber(order.ticket||order.id),items=order.lineItems||order.itemsDetail||[],pieces=v284PieceCount(order,serviceId),register=state.session?.register||'R1';
  let lines=items.map(item=>v284ReceiptLineHTML(item,serviceId)).join('');
  if(!lines){const legacy=v284LegacyParts(order);lines=(legacy.length?legacy:[String(order.items||service)]).map((part,index)=>`<div class="v11-item-line v284-legacy-line"><div class="rt-row"><strong>${esc(String(part).toUpperCase())}</strong>${index===0?`<strong>${money(subtotal)}</strong>`:''}</div></div>`).join('')}
  const apartment=isDelivery?(unit?`<div class="v284-apartment-label">DELIVERY · APARTMENT</div><div class="v284-apartment">#${esc(unit.toUpperCase())}</div>`:`<div class="v284-delivery-label">DELIVERY</div>`):'';
  const addressLine=isDelivery&&address?`<div class="v11-address">${esc(String(address.street||address.line1||'').toUpperCase())}</div>`:'';
  const notes=v284PrintNote(order.notes);
  return `<section class="v8-print-ticket v11-photo-ticket v284-receipt">${apartment}<div class="v11-store-name">Hattan Cleaners</div><div class="v11-store-line">141 3RD AVENUE</div><div class="v11-store-line">BET. 14TH &amp; 15TH</div><div class="v11-store-line">212 477 1740</div><div class="v23-ticket-label">TICKET</div><div class="v11-ticket-number v23-ticket-number">${esc(ticket)}</div><div class="v23-account-number"><span>ACCOUNT</span> ${esc(customer?.customerNumber||'WALK-IN')}</div><div class="v11-customer-name">${esc(v11ReceiptCustomerName(order,customer))}</div>${addressLine}<div class="v11-meta"><span>${esc(order.register||register)} · ${esc(order.createdBy||'Staff')}</span><span>${esc(v11ReceiptDateTime(order.createdAt))}</span></div><div class="rt-hr"></div><div class="v11-service-row"><strong>${esc(service.toUpperCase())}</strong></div>${lines}${notes?`<div class="v11-notes"><strong>NOTES:</strong> ${esc(notes.toUpperCase())}</div>`:''}<div class="rt-hr"></div><div class="v11-totals"><div class="v11-piece-count">${esc(serviceId==='washfold'?`${pieces} lb`:`${pieces} ${pieces===1?'pc':'pcs'}`)}</div><div class="v284-money"><div class="rt-row"><span>Sub.T</span><strong>${money(subtotal)}</strong></div><div class="rt-row"><span>Tax</span><strong>${money(tax)}</strong></div>${fee?`<div class="rt-row"><span>Card Fee</span><strong>${money(fee)}</strong></div>`:''}<div class="rt-row rt-total"><span>G.Total</span><strong>${money(grand)}</strong></div><div class="rt-row"><span>PrePay</span><strong>${money(prepaid)}</strong></div><div class="rt-row rt-total"><span>Balance</span><strong>${money(balance)}</strong></div></div></div><div class="v11-hours">MON-FRI 8:00 AM - 6:00 PM<br>SATURDAY 9:00 AM - 4:00 PM</div><div class="v11-action">** ${paid?'PAID':'BALANCE DUE'} / ${isDelivery?'DELIVER':'PICKUP'} **</div>${isDelivery?'<div class="v11-pickup-warning">** THIS TICKET IS NOT VALID FOR PICK UP **</div>':''}<div class="v11-ready-line"><span>Ready</span><strong>${esc(v11ReadyDate(order))}</strong><span>After ${esc(order.dueTime||'04:00 PM')}</span></div><div class="v11-bottom-ticket">${esc(ticket)}</div>${v8BarcodeHTML(order.barcode||v8MakeBarcode(order.ticket||order.id))}</section>`;
};
try{receiptTicketHTML=window.receiptTicketHTML}catch(_error){}
