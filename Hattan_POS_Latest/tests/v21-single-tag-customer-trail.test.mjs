import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../v21-single-tag-customer-trail.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../v21-single-tag-customer-trail.css', import.meta.url), 'utf8');

function runtime() {
  const elements = new Map();
  const customers = [
    { id:'c1', name:'Alice Chen', initials:'AC', customerNumber:'C-10001', phone:'+12125550101', preferredChannel:'pickup', addresses:[] },
    { id:'c2', name:'Ben Ortiz', initials:'BO', customerNumber:'C-10002', phone:'+12125550102', preferredChannel:'delivery', addresses:[{ id:'a1', street:'1 Main St' }] },
  ];
  const orders = [
    { id:'dc1', ticket:'100', serviceType:'dryclean', status:'dropped_off', tagNumber:'A-1', tagNumbers:['A-1','A-2','A-3'], createdAt:'2026-08-25T10:00:00Z', customerId:'c1', pieceCount:3 },
    { id:'wf1', ticket:'101', serviceType:'washfold', status:'dropped_off', tagNumber:null, tagNumbers:[], createdAt:'2026-08-25T10:01:00Z', customerId:'c2', pieceCount:1 },
    { id:'sh1', ticket:'102', serviceType:'shirts', status:'dropped_off', tagNumber:null, tagNumbers:[], createdAt:'2026-08-25T10:02:00Z', customerId:'c1', pieceCount:4 },
  ];
  let context;
  context = vm.createContext({
    console,
    V16_SHARED_KEYS:['customers','orders'],
    V12_TAG_COLORS:[{ name:'White', hex:'#fff' },{ name:'Blue', hex:'#b8d8f3' }],
    V8_SERVICE_NAMES:{ dryclean:'Dry Cleaning', washfold:'Wash & Fold', shirts:'Laundered Shirts', alterations:'Alterations' },
    STORAGE_KEY:'test',
    state:{
      customers, orders, recentCustomerSearches:[], recentCustomerViews:[],
      tagUi:{ filter:'needs', search:'', createdDate:'' }, posNav:'customers', session:{ loggedIn:true },
    },
    counterDraft:{ customerId:null, guestName:'', items:[], fulfillment:'pickup' },
    v13TagState:{ order:null, tags:[] },
    localStorage:{ getItem:() => '{}', setItem:() => {} },
    customerById:id => customers.find(customer => customer.id === id),
    v8OrderService:order => order.serviceType,
    v12NormalizeTag:value => String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 18),
    v8NowISO:() => '2026-08-25T11:00:00Z',
    v6CurrentStaff:() => ({ name:'Maria' }),
    v12IsOpen:order => !['picked_up','delivered','voided'].includes(order.status),
    v8OrderCreatedDate:order => String(order.createdAt || '').slice(0, 10),
    v12OrderSearchBlob:order => `${order.ticket} ${order.tagNumber || ''}`.toLowerCase(),
    v12TagColor:order => order.serviceType === 'shirts' ? { name:'Blue', hex:'#b8d8f3' } : { name:'White', hex:'#fff' },
    v12TagInputId:(order, index) => `tag-${order.id}-${index}`,
    v12TagColorId:order => `color-${order.id}`,
    v12DateTime:value => value,
    v8AddActivity:(order, type, label) => { order.activity = [{ type, label }]; },
    recordSync:() => {},
    saveState:() => {}, loadState:() => {},
    v16ApplySnapshot:snapshot => Object.assign(context.state, snapshot), v16SafeRender:() => {},
    renderPosContent:() => { context.renders += 1; }, renders:0,
    esc:value => String(value ?? ''), icon:name => `[${name}]`, money:value => `$${Number(value || 0).toFixed(2)}`,
    customerLabel:order => context.customerById(order.customerId)?.name || 'Guest',
    toast:(message) => { context.lastToast = message; }, lastToast:'',
    v3FindOrderByScan:value => orders.find(order => order.ticket === value || order.id === value),
    v12TagFilter:() => {}, v12TagSearch:() => {}, v12TagDate:() => {},
    v13Head:() => '<h2>Tag Assign</h2>',
    v13CancelTagTicket:() => {},
    v14EnhanceLedger:() => {}, v14QuickTag:() => {}, posCompleteDropOff:() => {},
    v7OpenTickets:id => orders.filter(order => order.customerId === id),
    arBalance:() => 0,
    v6CustomerSearchBlob:customer => `${customer.name} ${customer.customerNumber} ${customer.phone}`.toLowerCase(),
    v14Initials:name => name.split(/\s+/).map(word => word[0]).join(''),
    renderPosCustomers:content => { content.innerHTML = '<div class="filter-tabs"></div>'; },
    renderV7CustomerProfile:() => {},
    v8FreshCounterDraft:() => ({ customerId:null, guestName:'', items:[], fulfillment:'pickup' }),
    v19EnsureDraft:draft => draft,
    v17CustomerDefault:customer => customer.preferredChannel || 'pickup',
    v9HasPendingDraft:() => false,
    v12RestoreInput:() => {},
    openPosModal:() => {}, closePosModal:() => {},
    document:{
      getElementById:id => elements.get(id) || null,
      querySelectorAll:() => [],
      querySelector:() => null,
    },
    window:{ setTimeout:callback => callback() },
    prompt:() => null,
  });
  vm.runInContext(source, context, { filename:'v21-single-tag-customer-trail.js' });
  return { context, customers, orders, elements };
}

test('V21 assets load after V20 and keep the new title', () => {
  assert.match(index, /V21 Single Tag \+ Customer Trail<\/title>/);
  assert.ok(index.indexOf('v21-single-tag-customer-trail.css') > index.indexOf('v20-bilingual-session.css'));
  assert.ok(index.indexOf('v21-single-tag-customer-trail.js') > index.indexOf('v20-bilingual-session.js'));
  assert.match(styles, /v21-recent-customer-grid/);
});

test('old multi-tag tickets retain an audit copy but have one active tag', () => {
  const { orders } = runtime();
  assert.equal(orders[0].tagNumber, 'A-1');
  assert.deepEqual(Array.from(orders[0].tagNumbers), ['A-1']);
  assert.deepEqual(Array.from(orders[0].legacyTagNumbers), ['A-2','A-3']);
  assert.equal(orders[0].v21SingleTagMigrated, true);
});

test('Tag Assign excludes Wash & Fold and renders one tag input only', () => {
  const { context } = runtime();
  const rows = vm.runInContext('v12TagRows()', context);
  assert.deepEqual(Array.from(rows, order => order.id), ['sh1']);
  const content = { innerHTML:'' };
  context.v12RenderTags(content);
  assert.match(content.innerHTML, /One Tag Number/);
  assert.match(content.innerHTML, /One tag #/);
  assert.doesNotMatch(content.innerHTML, /Tag 1|Tag 2|Tags 1–5/);
  assert.doesNotMatch(content.innerHTML, /#101/);
});

test('saving a tag stores exactly one active value', () => {
  const { context, orders, elements } = runtime();
  elements.set('tag-sh1-0', { value:' b-77 ' });
  elements.set('color-sh1', { value:'Blue' });
  context.v21SaveTag('sh1');
  assert.equal(orders[2].tagNumber, 'B-77');
  assert.deepEqual(Array.from(orders[2].tagNumbers), ['B-77']);
  assert.match(context.lastToast, /B-77 saved/);
});

test('recently viewed customers are remembered and Drop Off preselects the profile', () => {
  const { context, customers } = runtime();
  context.v7RememberCustomer('c2');
  assert.equal(context.state.recentCustomerViews[0].customerId, 'c2');
  assert.equal(context.state.recentCustomerViews[0].viewedBy, 'Maria');
  const html = context.v21RecentCustomerPageHTML();
  assert.match(html, /Recently Viewed Customers/);
  assert.match(html, /Ben Ortiz/);
  assert.match(html, /View Profile/);
  assert.match(html, /Drop Off/);
  context.v21StartCustomerDropOff('c2');
  assert.equal(context.state.posNav, 'counter');
  assert.equal(context.counterDraft.customerId, 'c2');
  assert.equal(context.counterDraft.fulfillment, customers[1].preferredChannel);
});
