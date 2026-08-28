import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../v19-customer-controls.js', import.meta.url), 'utf8');

function runtime() {
  const context = vm.createContext({
    console,
    V12_TAG_COLORS:[{ name:'Black', hex:'#222222' }, { name:'Blue', hex:'#9cc9ee' }],
    V14_SERVICE_INSTRUCTIONS:{ washfold:[
      { id:'lowdry', label:'Low dry' },
      { id:'nosoftener', label:'No fabric softener' },
      { id:'separate', label:'Separate darks & whites' },
    ] },
    state:{
      customers:[{ id:'cust_1', name:'Test Customer', customerNumber:'C-10001', phone:'+12125551212', email:'test@example.com', storeCredit:30, defaultFulfillment:'delivery', addresses:[{ id:'addr_1', apartment:'2C', street:'141 3rd Avenue' }] }],
      orders:[], workflowSettings:{}, instructionTranslations:{},
    },
    counterDraft:{
      customerId:'cust_1', fulfillment:'pickup', deliveryOverrideConfirmed:false,
      payNow:true, useStoreCredit:true, paymentMethod:'card',
      serviceInstructions:{ washfold:[] }, serviceInstructionNotes:{ washfold:'' },
      instructionOpen:{}, serviceDueTimes:{}, tags:[],
    },
    checkoutState:{ method:'card', useCredit:false },
    v13TagState:{ order:null, tags:[] },
    lastModal:'', renderCount:0,
    v14EnsureDraft:d => d,
    v14CloneInstructionOrder:() => ({ washfold:['lowdry','nosoftener','separate'] }),
    saveState:() => {}, loadState:() => {},
    v8FreshCounterDraft:() => ({}), freshCounterDraft:() => ({}),
    v8OrderService:o => o?.serviceType || o,
    v12RenderTags:() => {}, v13RenderSimpleTags:() => {},
    v13TagScanKeydown:() => {}, v3FindOrderByScan:() => null,
    toast:() => {}, v12IsOpen:() => true,
    v14InstructionText:() => '',
    v14InstructionRows:service => context.V14_SERVICE_INSTRUCTIONS[service] || [],
    v17TranslateProductionDetail:() => '',
    v3VoiceParse:() => 'parsed',
    posPickCustomer:() => {}, posClearCustomer:() => {}, v3SetFulfillment:value => { context.counterDraft.fulfillment = value; },
    customerById:id => context.state.customers.find(customer => customer.id === id),
    v17CustomerDefault:customer => customer?.defaultFulfillment || 'pickup',
    openPosModal:html => { context.lastModal = html; },
    closePosModal:() => {}, renderPosContent:() => { context.renderCount += 1; },
    icon:() => '', esc:value => String(value ?? ''),
    v17EffectiveDelivery:(order, customer) => order?.fulfillment === 'delivery' || customer?.defaultFulfillment === 'delivery',
    v15OrderBalance:() => 0, arBalance:() => 0, money:value => `$${Number(value || 0).toFixed(2)}`,
    callBackend:async () => ({ ok:false }), recordSync:() => {}, uid:prefix => `${prefix}1`,
    navigator:{}, window:{ location:{ href:'' } },
    posSendStatementEmail:() => {}, posOpenStatement:() => {}, v15OpenArCustomer:() => {}, posRecordArPayment:() => {},
    v8DraftBaseTotal:() => 100, v9PendingSubtotal:() => 0,
    posSetPayNow:() => {}, finalizePayment:order => { order.paid = true; },
    v15ApplyStoreCredit:() => ({ ok:false }), posCompleteDropOff:() => {},
    v8AddActivity:() => {}, posFinishCheckout:() => {},
    v8NowISO:() => '2026-08-24T12:00:00.000Z', v6CurrentStaff:() => ({ name:'Manager' }),
    v17EnhanceCounter:() => {},
    receiptTicketHTML:() => '<section><div class="v17-top-alert">RUSH</div><div class="v17-top-unit">APT 2C</div><div class="rt-row"><span>PrePay</span><strong>$100.00</strong></div></section>',
    posShellHTML:() => 'Staff POS · V18 Stability', renderPosSettings:() => {},
  });
  vm.runInContext(source, context, { filename:'v19-customer-controls.js' });
  return context;
}

test('V19 loads cleanly and migrates tag colors and bilingual instructions at runtime', () => {
  const context = runtime();
  const result = vm.runInContext(`({
    dry:v19RequiresTag('dryclean'),
    shirts:v19RequiresTag('shirts'),
    alterations:v19RequiresTag('alterations'),
    washfold:v19RequiresTag('washfold'),
    colors:V12_TAG_COLORS.map(color => color.name),
    labels:V14_SERVICE_INSTRUCTIONS.washfold.map(row => row.label),
    translations:state.instructionTranslations.washfold,
  })`, context);
  assert.deepEqual(Array.from(result.colors), ['White', 'Blue']);
  assert.deepEqual(Array.from(result.labels), ['Low dry', 'No softener', 'Separate darks & whites', 'Delicate cycle']);
  assert.equal(result.dry, true);
  assert.equal(result.shirts, true);
  assert.equal(result.alterations, true);
  assert.equal(result.washfold, false);
  assert.equal(result.translations.delicate.zh, '轻柔洗涤');
  assert.equal(result.translations.delicate.enabled, true);
});

test('store credit preview charges the card fee only after credit', () => {
  const context = runtime();
  const preview = vm.runInContext('v19DraftPaymentPreview(state.customers[0])', context);
  assert.equal(preview.subtotal, 100);
  assert.equal(preview.credit, 30);
  assert.equal(preview.externalBase, 70);
  assert.equal(preview.fee, 2.1);
  assert.equal(preview.externalDue, 72.1);
  assert.equal(preview.visitTotal, 102.1);
});

test('Delivery default blocks silent Pickup and the one-time confirmation changes only the draft', () => {
  const context = runtime();
  vm.runInContext("v3SetFulfillment('pickup')", context);
  assert.match(context.lastModal, /Customer Usually Receives Delivery/);
  assert.equal(context.counterDraft.fulfillment, 'pickup');
  vm.runInContext('v19KeepCustomerDelivery()', context);
  assert.equal(context.counterDraft.fulfillment, 'delivery');
  vm.runInContext('v19ConfirmOneTimePickup()', context);
  assert.equal(context.counterDraft.fulfillment, 'pickup');
  assert.equal(context.counterDraft.deliveryOverrideConfirmed, true);
  assert.equal(context.state.customers[0].defaultFulfillment, 'delivery');
});

test('receipt wrapper promotes apartment and RUSH markers and adds credit detail', () => {
  const context = runtime();
  const html = vm.runInContext("receiptTicketHTML({ storeCreditApplied:30, externalPaymentAmount:72.10, paymentBreakdown:{ externalMethod:'card' } })", context);
  assert.match(html, /v19-top-rush">RUSH/);
  assert.match(html, /v19-top-unit">2C \*<\/div>/);
  assert.match(html, /Store Credit/);
  assert.match(html, /card/);
});
