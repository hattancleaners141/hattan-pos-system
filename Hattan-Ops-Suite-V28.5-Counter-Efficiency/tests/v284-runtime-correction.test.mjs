import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../v284-counter-ticket.js',import.meta.url),'utf8');
const garments={g_blouse:{id:'g_blouse',name:'Blouse',basePrice:10,unit:'piece'}};
const colors={blue:{name:'Blue'},navy:{name:'Navy'},green:{name:'Green'},none:{name:'None'}};
const context={
  console,queueMicrotask:fn=>fn(),window:null,
  GARMENT_COLORS:[{id:'blue',name:'Blue',sw:'blue'},{id:'navy',name:'Navy',sw:'navy'},{id:'green',name:'Green',sw:'green'}],BAG_COLORS:['Black'],
  counterDraft:{builder:{garmentId:null,qty:1,materialId:'standard'},items:[],serviceDueDates:{},crease:'',serviceMode:'dryclean'},
  state:{posNav:'counter',session:{register:'R1'}},
  document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},getElementById(){return null},scrollingElement:null},
  renderPosContent(){},v9RefreshVisitDraft(){},toast(){},v8IsPants(){return false},v9PositiveNumber:v=>Math.max(1,Number(v)||1),v8DefaultDue:()=> '2026-09-04',
  garmentUnitPrice:id=>garments[id]?.basePrice||0,garmentById:id=>garments[id],materialById:id=>({name:id[0].toUpperCase()+id.slice(1)}),colorById:id=>colors[id],
  v17StampFlatLine:x=>x,v17Round:n=>Math.round(n*100)/100,v9AddOrMergeLine:null,
  v9CommitDryCleaning(){return false},v9PendingSubtotal(){return 0},v28PostRender(){},renderPosRoot(){},posSetBuilderMaterial(id){this.counterDraft.builder.materialId=id;this.renderPosContent()},
  receiptTicketHTML(){return''},v8AddressForOrder(){return{street:'230 E. 15th',apartment:'2K'}},v8OrderService:o=>o.serviceType,
  v10ParseDryGarments(){return[]},v10GarmentMatches(text){const m=/\bblouses?\b/i.exec(text);return m?[{id:'g_blouse',index:m.index,end:m.index+m[0].length}]:[]},v10IsNonDryGarmentContext(){return false},v10TrimAtService:x=>x,
  v10QuantityBefore(text){const m=text.match(/\b(\d+)\b/);return m?{value:Number(m[1]),explicit:true}:{value:1,explicit:false}},
  v10FindColors(text){return['blue','navy','green'].filter(c=>new RegExp(`\\b${c}\\b`,'i').test(text))},v10FindMaterial:text=>/\bsilk\b/i.test(text)?'silk':'standard',v10ButtonType:()=> 'standard',v10GarmentModifiers:()=>[],
  V8_SERVICE_NAMES:{dryclean:'Dry Cleaning'},money:n=>`$${Number(n).toFixed(2)}`,esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  customerById(){return{name:'Rachel Abrams',customerNumber:'17236'}},v11TicketNumber:x=>String(x),v11ReceiptCustomerName:()=> 'ABRAMS, RACHEL',v11ReceiptDateTime:()=> '09/02/26 12:37 PM',v11ReadyDate:()=> 'WED. 09/02/26',
  v17LineTotal:item=>item.unitPrice*item.qty,v8BarcodeHTML:()=>'<div class="v8-barcode">BARCODE</div>',v8MakeBarcode:()=> 'HAT-600196'
};
context.window=context;
context.v9AddOrMergeLine=line=>{const hit=context.counterDraft.items.find(x=>x.garmentId===line.garmentId&&x.colorId===line.colorId&&x.materialId===line.materialId);hit?hit.qty+=line.qty:context.counterDraft.items.push(line)};
vm.createContext(context);
vm.runInContext(source,context);

const warnings=[];
const parsed=context.v10ParseDryGarments('3 blouses, one is blue, navy, green silk',warnings);
assert.equal(parsed.length,3,'three color lines are created');
assert.equal(parsed.reduce((n,item)=>n+item.qty,0),3,'explicit quantity remains exactly three pieces');
assert.deepEqual(Array.from(parsed,item=>item.colorId),['blue','navy','green']);
assert.ok(parsed.every(item=>item.materialId==='silk'),'silk applies to the three blouses');

const order={id:'600-196',ticket:'600-196',customerId:'c1',serviceType:'dryclean',fulfillment:'delivery',lineItems:parsed,subtotal:30,total:30,createdAt:'2026-09-02T12:37:00',dueTime:'04:00 PM',notes:'AI voice · RUSH'};
const receipt=context.receiptTicketHTML(order);
assert.match(receipt,/v284-apartment[^>]*>#2K</,'delivery apartment is printed in the centered hero');
assert.match(receipt,/>3 pcs</,'receipt count is exactly three');
assert.doesNotMatch(receipt,/AI voice/i,'AI intake source is not customer-facing print text');
assert.equal((receipt.match(/class="v11-item-line"/g)||[]).length,3,'each blouse prints as a separate spaced line');
assert.match(receipt,/class="v284-money"/,'receipt uses the protected money column');

context.counterDraft={builder:{garmentId:'g_blouse',qty:3,materialId:'silk',buttonType:'standard',colorId:'',conditionFlags:[]},items:[],serviceDueDates:{},crease:'',serviceMode:'dryclean'};
context.v28PickAndAddColor('blue');context.v28PickAndAddColor('navy');context.v28PickAndAddColor('green');
assert.equal(context.counterDraft.items.reduce((n,item)=>n+item.qty,0),3,'three color taps add exactly three pieces');
assert.deepEqual(Array.from(context.counterDraft.items,item=>item.colorId),['blue','navy','green']);

console.log('V28.4 runtime correction checks passed');
