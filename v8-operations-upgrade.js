/*
 * Hattan Ops V12 — intake, tag assignment, ticket history, timeclock and hardware workflow
 * Netlify-testable browser prototype. Payment fields simulate processor-hosted
 * tokenization: only a demo token, brand and last four digits are persisted.
 */

const V8_SERVICE_NAMES = {
  dryclean: 'Dry Cleaning',
  washfold: 'Wash & Fold',
  shirts: 'Laundered Shirts',
  alterations: 'Alterations'
};

const V8_ALTERATION_TAG_COLORS = {
  0: { name: 'Gray', hex: '#a5a5a5' },
  1: { name: 'Blue', hex: '#4b82d0' },
  2: { name: 'Yellow', hex: '#e6c84f' },
  3: { name: 'Pink', hex: '#dd86a5' },
  4: { name: 'Green', hex: '#4e9b63' },
  5: { name: 'Orange', hex: '#df8b3b' },
  6: { name: 'Purple', hex: '#8059a5' }
};

function v8NowISO() { return new Date().toISOString(); }
function v8TodayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function v8DatePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function v8TimeLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function v8ServiceForItem(it) {
  let s = it.serviceType || garmentById(it.garmentId)?.service || 'dryclean';
  if (s === 'drycleaning') s = 'dryclean';
  if (s === 'alteration') s = 'alterations';
  return V8_SERVICE_NAMES[s] ? s : 'dryclean';
}
function v8OrderService(order) {
  if (order.serviceType && V8_SERVICE_NAMES[order.serviceType]) return order.serviceType;
  if (order.lineItems?.length) return v8ServiceForItem(order.lineItems[0]);
  const raw = (order.services || [])[0];
  return ({ drycleaning: 'dryclean', alterations: 'alterations', shirts: 'shirts', washfold: 'washfold' })[raw] || 'dryclean';
}
function v8DefaultDue(service) {
  return v8DatePlus(({ washfold: 1, shirts: 2, dryclean: 3, alterations: 7 })[service] || 3);
}
function v8PieceCount(items, service) {
  if (service === 'washfold') return 1;
  return Math.max(1, Math.round((items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0)));
}
function v8TagStyle(service, dueDate) {
  if (service === 'alterations') {
    const day = dueDate ? new Date(`${dueDate}T12:00:00`).getDay() : new Date().getDay();
    return V8_ALTERATION_TAG_COLORS[day] || V8_ALTERATION_TAG_COLORS[0];
  }
  if (service === 'dryclean') return { name: 'White', hex: '#ffffff' };
  if (service === 'shirts') return { name: 'Blue', hex: '#b8d8f3' };
  return { name: 'Black', hex: '#222222' };
}
function v8MakeBarcode(ticket) {
  return `HAT-${String(ticket || '').replace(/\D/g, '').padStart(6, '0').slice(-6)}`;
}
function v8AddActivity(order, type, label, meta = {}) {
  order.activity = order.activity || [];
  order.activity.unshift({ id: uid('evt_'), type, label, at: v8NowISO(), by: v6CurrentStaff()?.name || 'System', ...meta });
  order.activity = order.activity.slice(0, 80);
}
function v8AddressForOrder(order) {
  const c = order.customerId ? customerById(order.customerId) : null;
  if (!c) return null;
  return (c.addresses || []).find(a => a.id === order.address) || (c.addresses || [])[0] || null;
}
function v8AddressText(addr) {
  if (!addr) return 'No address on file';
  return [addr.street || addr.line1, addr.apartment && !String(addr.line1 || '').includes(addr.apartment) ? `Apt ${addr.apartment}` : '', addr.line2].filter(Boolean).join(', ');
}
function v8OrderCreatedDate(order) {
  return String(order.createdAt || '').slice(0, 10) || (order.placedLabel === 'Today' ? v8TodayISO() : '');
}

function v8EnsureData() {
  state.deliveryBatches = state.deliveryBatches || [];
  state.nextDeliveryBatch = state.nextDeliveryBatch || 1;
  state.rackUi = state.rackUi || { search: '', createdDate: '', showAssigned: false };
  state.deliveryUi = state.deliveryUi || { input: '', scanned: [], driverId: state.drivers?.[0]?.id || '' };
  state.hardwareProfile = state.hardwareProfile || {
    printer: 'Star Micronics TSP100IV / TSP143IV-UEWB',
    paperWidth: '80mm',
    resolution: '203 dpi',
    connection: 'System / Wi-Fi printer',
    scanner: 'NADAMOO USB 1D scanner',
    scannerMode: 'USB keyboard + Enter',
    symbology: 'Code 128-B'
  };

  const existingCustomerNumbers = state.customers
    .map(c => Number(String(c.customerNumber || '').replace(/\D/g, '')))
    .filter(Number.isFinite);
  const highestCustomerNumber = Math.max(10000, ...existingCustomerNumbers);
  state.nextCustomerNumber = Math.max(Number(state.nextCustomerNumber) || 10001, highestCustomerNumber + 1);

  if (!state.materials.some(m => m.id === 'standard')) state.materials.unshift({ id: 'standard', name: 'Standard / Cotton', multiplier: 1 });
  const cotton = state.materials.find(m => m.id === 'cotton');
  if (cotton) cotton.multiplier = 1;
  if (!state.materials.some(m => m.id === 'rayon')) state.materials.push({ id: 'rayon', name: 'Rayon', multiplier: 1.2 });
  if (!state.materials.some(m => m.id === 'viscose')) state.materials.push({ id: 'viscose', name: 'Viscose', multiplier: 1.2 });

  state.customers.forEach(c => {
    if (!c.customerNumber) c.customerNumber = `C-${state.nextCustomerNumber++}`;
    c.addresses = c.addresses || [];
    c.paymentMethods = c.paymentMethods || [];
    c.addresses.forEach(a => {
      if (!a.street) a.street = String(a.line1 || '').replace(/,?\s*(Apt|Apartment|Unit|#)\.?\s*.+$/i, '').trim();
      if (!a.apartment) {
        const m = String(a.line1 || '').match(/(?:Apt|Apartment|Unit|#)\.?\s*([^,]+)/i);
        a.apartment = m ? m[1].trim() : '';
      }
    });
  });

  state.orders.forEach((o, index) => {
    o.createdAt = o.createdAt || new Date(Date.now() - index * 3600000).toISOString();
    o.fulfillment = o.fulfillment || (o.channel === 'delivery' ? 'delivery' : 'pickup');
    o.serviceType = o.serviceType || v8OrderService(o);
    o.barcode = o.barcode || v8MakeBarcode(o.ticket || o.id);
    o.activity = o.activity || [];
    o.lineItems = o.lineItems || o.itemsDetail || [];
    o.pieceCount = o.pieceCount || v8PieceCount(o.lineItems, o.serviceType);
    o.tagNumbers = Array.isArray(o.tagNumbers) ? o.tagNumbers.filter(Boolean).map(String) : (o.tagNumber ? [String(o.tagNumber)] : []);
    o.tagNumber = o.tagNumbers[0] || null;
    if (o.tagNumber) {
      const style = v8TagStyle(o.serviceType, o.dueDate);
      o.tagColor = o.tagColor || style.name;
      o.tagColorHex = o.tagColorHex || style.hex;
      o.tagAssignedAt = o.tagAssignedAt || o.createdAt;
    } else {
      o.tagColor = null;
      o.tagColorHex = null;
      o.tagAssignedAt = null;
    }
    if (o.status === 'quality_check') o.status = 'in_cleaning';
    if (o.status !== 'voided') {
      const stages = getStages(o), stageIndex = stages.findIndex(stage => stage.id === o.status);
      if (stageIndex >= 0) o.stageIndex = stageIndex;
    }
  });
}

const v8BaseSaveState = saveState;
saveState = function v8SaveState() {
  v8BaseSaveState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.deliveryBatches = state.deliveryBatches || [];
    raw.nextDeliveryBatch = state.nextDeliveryBatch || 1;
    raw.rackUi = state.rackUi || {};
    raw.deliveryUi = state.deliveryUi || {};
    raw.nextCustomerNumber = state.nextCustomerNumber || 10001;
    raw.hardwareProfile = state.hardwareProfile || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (e) { /* Browser storage unavailable. */ }
};

const v8BaseLoadState = loadState;
loadState = function v8LoadState() {
  v8BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.deliveryBatches) state.deliveryBatches = raw.deliveryBatches;
    if (raw.nextDeliveryBatch) state.nextDeliveryBatch = raw.nextDeliveryBatch;
    if (raw.rackUi) state.rackUi = raw.rackUi;
    if (raw.deliveryUi) state.deliveryUi = raw.deliveryUi;
    if (raw.nextCustomerNumber) state.nextCustomerNumber = raw.nextCustomerNumber;
    if (raw.hardwareProfile) state.hardwareProfile = raw.hardwareProfile;
  } catch (e) { /* Ignore corrupt optional V8 data. */ }
  v8EnsureData();
};

/* Code 128-B is compact enough for the long barcode at the foot of an 80mm ticket
   and is supported by the NADAMOO 1D USB scanner shown for this counter. */
const V11_CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];
function v8BarcodeHTML(value) {
  const clean = String(value || 'HAT-000000').replace(/[^\x20-\x7e]/g, '').slice(0, 40) || 'HAT-000000';
  const dataCodes = Array.from(clean, ch => ch.charCodeAt(0) - 32);
  const checksum = (104 + dataCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const codes = [104, ...dataCodes, checksum, 106];
  let x = 10;
  const rects = [];
  codes.forEach(code => {
    const pattern = V11_CODE128_PATTERNS[code];
    Array.from(pattern).forEach((width, index) => {
      const modules = Number(width);
      if (index % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${modules}" height="58" fill="#000"/>`);
      x += modules;
    });
  });
  const total = x + 10;
  return `<div class="v8-barcode" data-symbology="CODE128B" data-barcode-value="${esc(clean)}"><svg viewBox="0 0 ${total} 58" role="img" aria-label="Code 128 barcode ${esc(clean)}" preserveAspectRatio="none" shape-rendering="crispEdges">${rects.join('')}</svg><div class="v8-barcode-label">${esc(clean)}</div></div>`;
}

function v8CountryOptions(selected = '+1') {
  const opts = [['+1','US / Canada +1'],['+44','United Kingdom +44'],['+972','Israel +972'],['+52','Mexico +52'],['+7','Russia / Kazakhstan +7'],['+86','China +86'],['+91','India +91'],['+55','Brazil +55'],['+351','Portugal +351'],['+380','Ukraine +380'],['custom','Other international code']];
  return opts.map(([v,l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
}
function v8CountryChanged(value) {
  const custom = document.getElementById('nc-country-custom');
  if (custom) custom.style.display = value === 'custom' ? 'block' : 'none';
}
function v8FormatPhone(code, local) {
  const raw = String(local || '').trim();
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '');
  const cc = String(code || '+1').replace(/[^+\d]/g, '') || '+1';
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  return `${cc.startsWith('+') ? cc : '+' + cc}${digits}`;
}
function v8DetectCardBrand(number) {
  const n = String(number || '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^(6011|65|64[4-9])/.test(n)) return 'Discover';
  return 'Card';
}
function v8Luhn(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
function v8ValidExpiry(value) {
  const m = String(value || '').trim().match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/);
  if (!m) return false;
  const end = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59, 59);
  return end >= new Date();
}
function v8TokenizeDemoCard(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return { id: uid('pm_'), brand: v8DetectCardBrand(digits), last4: digits.slice(-4), default: true, processorToken: `tok_demo_${uid('').toLowerCase()}` };
}
function v9NextCustomerNumber() {
  state.nextCustomerNumber = Math.max(Number(state.nextCustomerNumber) || 10001, 10001);
  return `C-${state.nextCustomerNumber++}`;
}

ncDraft = { channel: 'pickup', saveCard: false };
posOpenNewCustomer = function v8OpenNewCustomer() {
  ncDraft = { channel: 'pickup', saveCard: false };
  openPosModal(`
    <h3>${icon('users',17)} New Customer</h3>
    <p class="pm-sub">Name, international phone and complete service address are saved to the customer profile. A unique customer number is assigned automatically.</p>
    <div class="v8-form-grid">
      <div class="wide"><span class="field-label">Full name *</span><input class="text-input" id="nc-name" placeholder="Jordan Ramirez" autocomplete="name"></div>
      <div><span class="field-label">Country code *</span><select class="text-input" id="nc-country" onchange="v8CountryChanged(this.value)">${v8CountryOptions()}</select><input class="text-input" id="nc-country-custom" style="display:none;margin-top:6px" placeholder="+33"></div>
      <div><span class="field-label">Phone number *</span><input class="text-input" id="nc-phone" type="tel" inputmode="tel" placeholder="212 555 0100" autocomplete="tel-national"></div>
      <div class="wide"><span class="field-label">Email <span class="v8-optional">optional</span></span><input class="text-input" id="nc-email" type="email" placeholder="jordan@email.com" autocomplete="email"></div>
      <div class="wide"><span class="field-label">Street address *</span><input class="text-input" id="nc-street" placeholder="201 East 17th Street" autocomplete="street-address"></div>
      <div><span class="field-label">Apartment / Unit *</span><input class="text-input" id="nc-apartment" placeholder="8A or N/A"></div>
      <div><span class="field-label">ZIP code *</span><input class="text-input" id="nc-zip" inputmode="numeric" placeholder="10003" autocomplete="postal-code"></div>
      <div><span class="field-label">City *</span><input class="text-input" id="nc-city" value="New York" autocomplete="address-level2"></div>
      <div><span class="field-label">State *</span><input class="text-input" id="nc-state" value="NY" maxlength="2" autocomplete="address-level1"></div>
    </div>
    <span class="field-label" style="margin-top:16px">Preferred service method</span>
    <div class="segmented" style="margin-bottom:16px"><div class="seg selected" id="nc-seg-pickup" onclick="posSetNcChannel('pickup')">${icon('box',14)} Counter Pickup</div><div class="seg" id="nc-seg-delivery" onclick="posSetNcChannel('delivery')">${icon('truck',14)} Delivery</div></div>
    <div class="pref-row" style="padding-top:0"><div><div class="pr-label">Securely save a card on file</div><div class="pr-sub">Enter it once; afterward staff see only brand and last 4</div></div><div class="switch" id="nc-card-switch" onclick="posToggleNcCard()"></div></div>
    <div id="nc-card-fields" style="display:none;margin:10px 0 8px">
      <div class="v8-secure-note"><strong>Prototype safety:</strong> use a test card only. In production these fields are hosted by Clover/Fiserv, so the full number and expiration go directly to the processor and never enter Hattan's database.</div>
      <div class="v8-form-grid"><div class="wide"><span class="field-label">Card number</span><input class="text-input" id="nc-card-number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242"></div><div><span class="field-label">Expiration</span><input class="text-input" id="nc-card-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY"></div><div><span class="field-label">After saving</span><div class="v8-secure-note" style="margin:0">Only •••• last 4 remains visible.</div></div></div>
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="posSaveNewCustomer()">${icon('checkcircle',16)} Add Customer</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
};

posSaveNewCustomer = function v8SaveNewCustomer() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const name = get('nc-name'), localPhone = get('nc-phone'), email = get('nc-email');
  const street = get('nc-street'), apartment = get('nc-apartment'), city = get('nc-city'), region = get('nc-state').toUpperCase(), zip = get('nc-zip');
  let country = get('nc-country');
  if (country === 'custom') country = get('nc-country-custom');
  if (!name || !localPhone || !street || !apartment || !city || !region || !zip) return toast('Complete all required customer and address fields', false, 'alerttriangle');
  const phone = v8FormatPhone(country, localPhone);
  if (phone.replace(/\D/g, '').length < 7) return toast('Enter a valid phone number with country code', false, 'alerttriangle');
  const paymentMethods = [];
  if (ncDraft.saveCard) {
    const number = get('nc-card-number'), exp = get('nc-card-exp');
    if (!v8Luhn(number)) return toast('Enter a valid test card number', false, 'alerttriangle');
    if (!v8ValidExpiry(exp)) return toast('Enter a valid future expiration as MM/YY', false, 'alerttriangle');
    paymentMethods.push(v8TokenizeDemoCard(number));
  }
  const initials = name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
  const address = { id: uid('addr_'), label: 'Home', street, apartment, city, state: region, postalCode: zip, line1: `${street}, Apt ${apartment}`, line2: `${city}, ${region} ${zip}`, building: street };
  const cust = { id: uid('cust_'), customerNumber:v9NextCustomerNumber(), name, initials, phone, email, memberSince: new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'}), points:0, storeCredit:0, preferredChannel:ncDraft.channel, addresses:[address], paymentMethods, garmentPrefs:{starch:'light',fold:'hang',fragranceFree:false,notes:''} };
  state.customers.push(cust);
  counterDraft.customerId = cust.id;
  counterDraft.fulfillment = ncDraft.channel === 'delivery' ? 'delivery' : 'pickup';
  recordSync(`New customer created · ${name} · ${phone} · ${v8AddressText(address)}`);
  saveState(); closePosModal(); renderPosContent();
  toast(`${name} added as Customer ${cust.customerNumber}`, true, 'users');
  fireAutomatedText('newCustomerWelcome', cust);
};

function v8OpenAddCard(customerId) {
  const c = customerById(customerId); if (!c) return;
  openPosModal(`<h3>${icon('creditcard',17)} Save Card · ${esc(c.name)}</h3><div class="v8-secure-note"><strong>Use a test card in this prototype.</strong> Production uses processor-hosted secure fields. Hattan retains only a token, card brand and last four digits.</div><span class="field-label">Card number</span><input class="text-input" id="v8-add-card-number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" style="margin-bottom:10px"><span class="field-label">Expiration</span><input class="text-input" id="v8-add-card-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY"><button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v8SaveAddedCard('${c.id}')">Tokenize & Save</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
}
function v8SaveAddedCard(customerId) {
  const number = document.getElementById('v8-add-card-number')?.value || '';
  const exp = document.getElementById('v8-add-card-exp')?.value || '';
  if (!v8Luhn(number)) return toast('Enter a valid test card number', false, 'alerttriangle');
  if (!v8ValidExpiry(exp)) return toast('Enter a valid future expiration as MM/YY', false, 'alerttriangle');
  const c = customerById(customerId); if (!c) return;
  c.paymentMethods = c.paymentMethods || [];
  c.paymentMethods.forEach(p => p.default = false);
  c.paymentMethods.push(v8TokenizeDemoCard(number));
  recordSync(`Card token saved · ${c.name} · ${c.paymentMethods.at(-1).brand} •${c.paymentMethods.at(-1).last4}`);
  saveState(); closePosModal(); renderV7CustomerProfile(); toast('Card securely tokenized; only last 4 retained', true, 'lock');
}

function v8FreshCounterDraft() {
  return {
    customerId:null, guestName:'', items:[], tags:[], notes:'', payNow:false, paymentMethod:'card', photos:[],
    builder:{tab:'garment',garmentId:null,materialId:'standard',colorId:'black',qty:1,buttonType:'standard',garmentNote:''},
    serviceMode:'dryclean', crease:'', fulfillment:'pickup',
    wf:{pounds:'',bagColor:'Black',options:[],touched:false},
    shirts:{qty:1,packaging:'hanger',starch:'None',touched:false},
    alteration:{variantId:'pants_hem',qty:1,additionalInfo:'',dryCleanAlso:false,dryCleanGarmentId:'g_pants',touched:false},
    serviceDueDates:{}, aiTranscript:'', aiListening:false, aiInterpretation:null
  };
}
freshCounterDraft = v8FreshCounterDraft;

function v8UpchargeMaterials() {
  const wanted = ['linen','wool','silk','cashmere','rayon','viscose','synthetic','leather'];
  return state.materials.filter(m => wanted.includes(m.id) || (m.multiplier || 1) > 1);
}
function v8IsPants(garmentId) { return /pant|trouser/i.test(garmentById(garmentId)?.name || ''); }
function v8DraftGroups() {
  const groups = { dryclean:[], washfold:[], shirts:[], alterations:[] };
  (counterDraft?.items || []).forEach(it => groups[v8ServiceForItem(it)].push(it));
  return Object.entries(groups).filter(([,items]) => items.length).map(([service,items]) => ({ service, items }));
}
function v8DraftDue(service) {
  counterDraft.serviceDueDates = counterDraft.serviceDueDates || {};
  return counterDraft.serviceDueDates[service] || (counterDraft.serviceDueDates[service] = v8DefaultDue(service));
}
function v8SetDraftDue(service, value) { counterDraft.serviceDueDates[service] = value; renderPosContent(); }
function v8DraftBaseTotal() { return (counterDraft?.items || []).reduce((s,it) => s + (Number(it.unitPrice)||0) * (Number(it.qty)||0), 0) + ((counterDraft?.tags || []).includes('rush') ? 10 : 0); }
function v8DraftFee() { return counterDraft?.payNow && counterDraft.paymentMethod === 'card' ? Math.round(v8DraftBaseTotal() * .03 * 100) / 100 : 0; }
function v8ServiceSubtotal(items) { return items.reduce((s,it) => s + (Number(it.unitPrice)||0) * (Number(it.qty)||0), 0); }
function v8DraftTagHTML(service, items) {
  return `<span class="v8-tag-chip v12-awaiting-tag">Tag assigned after intake</span>`;
}
function v8CustomerSearchResults(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return state.customers.filter(c => v6CustomerSearchBlob(c).includes(q)).slice(0,8);
}
v6CustomerSearchBlob = function v9CustomerSearchBlob(c) {
  const orders=state.orders.filter(o=>o.customerId===c.id);
  const addresses=(c.addresses||[]).map(a=>`${a.street||''} ${a.apartment||''} ${a.line1||''} ${a.line2||''} ${a.city||''} ${a.state||''} ${a.postalCode||''}`).join(' ');
  const orderBits=orders.map(o=>`${o.id||''} ${o.ticket||''} ${o.barcode||''} ${o.tagNumber||''} ${(o.tagNumbers||[]).join(' ')}`).join(' ');
  return `${c.customerNumber||''} ${String(c.customerNumber||'').replace(/\D/g,'')} ${c.name||''} ${c.phone||''} ${c.email||''} ${addresses} ${orderBits}`.toLowerCase();
};
function v8TicketItemHTML(it, idx) {
  const g = garmentById(it.garmentId), mat = materialById(it.materialId), col = colorById(it.colorId);
  if (!g) return '';
  const itemService = v8ServiceForItem(it), isWeight = itemService === 'washfold';
  const details = [];
  if (it.materialId && !['standard','cotton'].includes(it.materialId)) details.push(mat.name);
  if (it.colorId && !['print'].includes(it.colorId)) details.push(col.name);
  details.push(`${it.qty} ${g.unit}${Number(it.qty) === 1 ? '' : 's'} × ${money(it.unitPrice)}`);
  if (it.buttonType && it.buttonType !== 'standard' && it.buttonType !== 'none') details.push(BUTTON_TYPES.find(b=>b.id===it.buttonType)?.name || it.buttonType);
  return `<div class="ticket-line v9-saved-line"><div class="tl-name">${esc(g.name)}<div style="font-size:11px;color:var(--ink-muted)">${details.map(esc).join(' · ')}</div>${it.garmentNote?`<div style="font-size:10.5px;color:var(--ink-secondary);margin-top:2px">${esc(it.garmentNote)}</div>`:''}</div><label class="v9-line-qty"><span>${isWeight?'Lb':'Qty'}</span><input type="number" min="${isWeight?'.1':'1'}" step="${isWeight?'.1':'1'}" value="${esc(it.qty)}" oninput="v9SetLineQty(${idx},this.value,${isWeight})"></label><div class="tl-price" id="v9-line-price-${idx}">${money(it.unitPrice*it.qty)}</div><div class="v3-line-actions">${itemService==='dryclean'?`<button class="btn btn-ghost v3-mini" onclick="v3EditLine(${idx})">Edit</button>`:''}<button class="btn btn-ghost v3-mini v9-remove-line" onclick="posRemoveItem(${idx})">${icon('x',13)} Remove</button></div></div>`;
}

function v9PositiveNumber(value, fallback = 1, decimal = false) {
  const parsed = decimal ? Number.parseFloat(value) : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function v9HasPendingDraft(service = counterDraft?.serviceMode) {
  if (!counterDraft) return false;
  if (service === 'dryclean') return !!counterDraft.builder?.garmentId;
  if (service === 'washfold') return !!counterDraft.wf?.touched && v9PositiveNumber(counterDraft.wf?.pounds, 0, true) > 0;
  if (service === 'shirts') return !!counterDraft.shirts?.touched;
  if (service === 'alterations') return !!counterDraft.alteration?.touched;
  return false;
}
function v9VisitTicketCount() {
  const services = new Set((counterDraft?.items || []).map(v8ServiceForItem));
  if (v9HasPendingDraft()) {
    services.add(counterDraft.serviceMode);
    if (counterDraft.serviceMode === 'alterations' && counterDraft.alteration?.dryCleanAlso) services.add('dryclean');
  }
  return services.size;
}
function v9PendingSubtotal() {
  if (!v9HasPendingDraft()) return 0;
  const service=counterDraft.serviceMode;
  if(service==='dryclean'){const b=counterDraft.builder;return garmentUnitPrice(b.garmentId,b.materialId||'standard')*v9PositiveNumber(b.qty);}
  if(service==='washfold'){const line=v9WashFoldLine();return line?line.unitPrice*line.qty:0;}
  if(service==='shirts'){const line=v9ShirtLine();return line?line.unitPrice*line.qty:0;}
  return v9AlterationLines().reduce((sum,line)=>sum+line.unitPrice*line.qty,0);
}
function v9WashFoldLine() {
  const wf = counterDraft.wf || {}, lbs = v9PositiveNumber(wf.pounds, 0, true);
  const g = garmentById('g_wf');
  if (!g || !lbs) return null;
  const extras = (wf.options || []).map(id => WF_UPCHARGES.find(x => x.id === id)).filter(Boolean);
  const extraTotal = extras.reduce((sum, x) => sum + Number(x.price || 0), 0);
  const belowMin = Number(g.minWeight || 0) && lbs < Number(g.minWeight || 0);
  const baseCharge = belowMin ? Number(g.minCharge || 0) : lbs * Number(g.basePrice || 0);
  return {garmentId:g.id,materialId:'standard',colorId:'print',qty:lbs,unitPrice:(baseCharge+extraTotal)/lbs,buttonType:'none',garmentNote:`Bag: ${wf.bagColor||'Black'}${belowMin?` · ${g.minWeight} lb minimum applied (${money(g.minCharge)})`:''}${extras.length?' · '+extras.map(x=>x.name).join(' · '):''}`,serviceType:'washfold'};
}
function v9ShirtLine() {
  const s = counterDraft.shirts || {}, g = garmentById(s.packaging === 'box' ? 'g_lshirt_box' : 'g_lshirt');
  if (!g) return null;
  return {garmentId:g.id,materialId:'standard',colorId:'white',qty:v9PositiveNumber(s.qty),unitPrice:g.basePrice,buttonType:'standard',garmentNote:`${s.packaging==='box'?'Boxed':'On hanger'} · Starch: ${s.starch||'None'}`,serviceType:'shirts'};
}
function v9AlterationLines() {
  const d = counterDraft.alteration || {}, a = ALTERATION_VARIANTS.find(x => x.id === d.variantId);
  const g = garmentById('g_alteration') || state.garmentCatalog[0];
  if (!a || !g) return [];
  const qty = v9PositiveNumber(d.qty), lines = [{garmentId:g.id,materialId:'standard',colorId:'print',qty,unitPrice:a.price,buttonType:'none',garmentNote:`${a.garment} · ${a.name}${d.additionalInfo?' · '+d.additionalInfo:''}`,serviceType:'alterations',alterationVariantId:a.id}];
  if (d.dryCleanAlso) {
    const dg = garmentById(d.dryCleanGarmentId);
    if (dg) lines.push({garmentId:dg.id,materialId:'standard',colorId:'print',qty,unitPrice:dg.basePrice,buttonType:'standard',garmentNote:`Dry clean after alteration · linked to ${a.garment} ${a.name}`,serviceType:'dryclean',linkedAlterationId:a.id});
  }
  return lines;
}
function v9PendingDraftHTML() {
  if (!counterDraft) return '';
  const service = counterDraft.serviceMode;
  let title = V8_SERVICE_NAMES[service] || 'Service', detail = '', price = '', add = '', ready = false;
  if (service === 'dryclean') {
    const b = counterDraft.builder || {}, g = garmentById(b.garmentId);
    ready = !!g;
    if (g) {
      const material = !['standard','cotton'].includes(b.materialId) ? materialById(b.materialId)?.name : '';
      const crease = v8IsPants(b.garmentId) && counterDraft.crease ? (counterDraft.crease === 'nocrease' ? 'No crease' : 'Crease') : '';
      title = `${g.name} × ${v9PositiveNumber(b.qty)}`;
      detail = [colorById(b.colorId)?.name, material, crease, b.garmentNote].filter(Boolean).join(' · ');
      price = money(garmentUnitPrice(b.garmentId,b.materialId||'standard') * v9PositiveNumber(b.qty));
    } else detail = 'Choose a garment; color, material, crease and quantity will update here.';
    add = 'posAddGarmentToTicket()';
  } else if (service === 'washfold') {
    const line = v9WashFoldLine(); ready = !!line;
    title = line ? `Wash & Fold · ${line.qty} lb` : 'Wash & Fold';
    detail = line ? line.garmentNote : 'Enter the bag weight and any preferences.';
    price = line ? money(line.unitPrice * line.qty) : '';
    add = 'v4AddWashFold()';
  } else if (service === 'shirts') {
    const line = v9ShirtLine(); ready = !!line;
    title = line ? `Laundered Shirts × ${line.qty}` : 'Laundered Shirts';
    detail = line?.garmentNote || 'Choose packaging, starch and quantity.';
    price = line ? money(line.unitPrice * line.qty) : '';
    add = 'v4AddLaunderedShirts()';
  } else {
    const lines = v9AlterationLines(), line = lines[0]; ready = !!line;
    title = line ? `${line.garmentNote.split(' · ').slice(0,2).join(' · ')} × ${line.qty}` : 'Alterations';
    detail = line ? `${counterDraft.alteration?.dryCleanAlso?'Includes a separate linked dry-cleaning ticket':'Alteration ticket'}${counterDraft.alteration?.additionalInfo?' · '+counterDraft.alteration.additionalInfo:''}` : 'Choose alteration work and quantity.';
    price = lines.length ? money(lines.reduce((sum,x)=>sum+x.unitPrice*x.qty,0)) : '';
    add = 'v4AddAlteration()';
  }
  return `<div class="v9-pending-card"><div class="v9-pending-label"><span class="v9-live-dot"></span> Live selection · not yet saved</div><div class="v9-pending-main"><div><strong>${esc(title)}</strong><div>${esc(detail)}</div></div>${price?`<b>${price}</b>`:''}</div><div class="v9-pending-actions"><button class="btn btn-primary btn-sm" ${ready?'':'disabled'} onclick="${add}">${icon('plus',13)} Add to Visit</button><button class="btn btn-ghost btn-sm" onclick="v9ClearPending()">Clear Selection</button></div></div>`;
}

renderPosCounter = function v8RenderPosCounter(content) {
  if (!counterDraft) counterDraft = v8FreshCounterDraft();
  const d = counterDraft, selectedCust = d.customerId ? customerById(d.customerId) : null;
  const results = v8CustomerSearchResults(posCustomerSearch), groups = v8DraftGroups();
  const base = v8DraftBaseTotal()+v9PendingSubtotal(), fee = d.payNow&&d.paymentMethod==='card'?Math.round(base*.03*100)/100:0;
  content.innerHTML = `<div class="counter-grid"><div>
    <div class="v8-intake-head">
      <div class="pos-card v8-customer-card"><h3>${icon('search',17)} Customer Lookup</h3>
        ${selectedCust ? `<div class="selected-customer-card"><div class="avatar" style="width:42px;height:42px;font-size:14px">${selectedCust.initials}</div><div style="flex:1"><div style="font-weight:800;font-size:15px">${esc(selectedCust.name)} <span class="v9-customer-number">${esc(selectedCust.customerNumber||'')}</span></div><div style="font-size:11.5px;color:var(--ink-secondary)">${esc(selectedCust.phone)}${selectedCust.addresses?.[0]?` · ${esc(v8AddressText(selectedCust.addresses[0]))}`:''}</div></div><button class="btn btn-ghost btn-sm" onclick="posClearCustomer()">Change</button></div>
          ${selectedCust.garmentPrefs?.notes?`<div class="warn-banner" style="background:var(--brand-tint-1);border-color:var(--brand-tint-2);color:var(--brand-deep)">${icon('shirt',15)}<span>${esc(selectedCust.garmentPrefs.notes)}</span></div>`:''}`:
        `<div class="customer-search-box"><input class="text-input v8-customer-search" placeholder="Search name, customer #, phone, address, ticket or tag…" value="${esc(posCustomerSearch)}" oninput="posCustomerSearchInput(this.value)">${results.length?`<div class="customer-results">${results.map(c=>`<div class="customer-result-row" onclick="posPickCustomer('${c.id}')"><div class="avatar" style="width:32px;height:32px;font-size:11px">${c.initials}</div><div><div style="font-size:13px;font-weight:700">${esc(c.name)} <span class="v9-customer-number">${esc(c.customerNumber||'')}</span></div><div style="font-size:11px;color:var(--ink-secondary)">${esc(c.phone)}${c.addresses?.[0]?` · ${esc(c.addresses[0].line1)}`:''}</div></div></div>`).join('')}</div>`:''}</div><div style="display:flex;gap:10px;align-items:center"><input class="text-input" style="flex:1" placeholder="Guest name (optional)" value="${esc(d.guestName)}" oninput="posSetGuestName(this.value)"><button class="btn btn-secondary" onclick="posOpenNewCustomer()">${icon('plus',14)} New Customer</button></div>`}
      </div>
      <div class="pos-card v8-ai-card"><div class="v8-ai-head"><h3>${icon('sparkle',17)} AI Voice Intake</h3><button type="button" id="v3-mic-btn" class="v3-mic-btn ${d.aiListening?'listening':''}" onclick="posToggleAiVoice()" ${posVoiceSupported()?'':'disabled'}>${icon('mic',19)}</button></div><div class="v2-note" id="v3-mic-status" style="margin-bottom:7px">Speak naturally. Garments, quantities, colors, special materials, laundry preferences and alterations can be mixed in one sentence.</div><textarea id="v3-ai-transcript" oninput="counterDraft.aiTranscript=this.value" placeholder="Example: one long silk dress, 3 pants black navy and white, and 17 pounds wash & fold low dry no softener black bag…">${esc(d.aiTranscript||'')}</textarea><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="v3VoiceParse()">${icon('sparkle',14)} Interpret & Add Separate Drafts</button>${v10AiReviewHTML()}</div>
    </div>

    <div class="pos-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">Add Services</h3><span class="v2-badge">${v9VisitTicketCount()} ticket${v9VisitTicketCount()===1?'':'s'} in this visit</span></div>
      <div class="v4-service-tabs"><div class="v4-service-tab ${d.serviceMode==='dryclean'?'active':''}" onclick="v4SetService('dryclean')">Dry Cleaning</div><div class="v4-service-tab ${d.serviceMode==='washfold'?'active':''}" onclick="v4SetService('washfold')">Wash & Fold</div><div class="v4-service-tab ${d.serviceMode==='shirts'?'active':''}" onclick="v4SetService('shirts')">Laundered Shirts</div><div class="v4-service-tab ${d.serviceMode==='alterations'?'active':''}" onclick="v4SetService('alterations')">Alterations</div></div>
      ${d.serviceMode==='dryclean'?`
        <span class="field-label">1. Garment</span><div class="v4-popular-grid" style="margin-bottom:12px">${(state.interfaceSettings?.drycleanOrder||[]).slice(0,6).map(id=>{const g=garmentById(id);return g?`<div class="v4-garment-btn ${d.builder.garmentId===id?'selected':''}" onclick="posSetBuilderGarment('${id}')"><strong>${esc(g.name)}</strong><span>${money(g.basePrice)}</span></div>`:''}).join('')}</div>
        <details style="margin-bottom:14px"><summary style="cursor:pointer;font-weight:800">All Garments</summary><div class="v4-popular-grid" style="margin-top:8px">${(state.interfaceSettings?.drycleanOrder||[]).map(id=>{const g=garmentById(id);return g?`<div class="v4-garment-btn ${d.builder.garmentId===id?'selected':''}" onclick="posSetBuilderGarment('${id}')"><strong>${esc(g.name)}</strong><span>${money(g.basePrice)}</span></div>`:''}).join('')}</div></details>
        <span class="field-label">2. Color</span><div class="color-grid" style="margin-bottom:12px">${GARMENT_COLORS.map(c=>`<div class="color-tile ${d.builder.colorId===c.id?'selected':''}" onclick="posSetBuilderColor('${c.id}')"><span class="color-swatch" style="background:${c.sw}"></span>${c.name}</div>`).join('')}</div>
        <details class="v8-special-details"><summary>Details / Upcharges <span class="v8-optional">only when needed</span></summary><div style="margin-top:12px"><span class="field-label">Special Material / Upcharge</span><div class="v3-quick" style="margin-bottom:12px"><div class="chip ${['standard','cotton'].includes(d.builder.materialId)?'selected':''}" onclick="posSetBuilderMaterial('standard')">No special material</div>${v8UpchargeMaterials().map(m=>`<div class="chip ${d.builder.materialId===m.id?'selected':''}" onclick="posSetBuilderMaterial('${m.id}')">${m.name} · ×${m.multiplier.toFixed(2)}</div>`).join('')}</div>${v8IsPants(d.builder.garmentId)?`<span class="field-label">Pants pressing <span class="v8-optional">only if specified</span></span><div class="v3-quick" style="margin-bottom:12px"><div class="chip ${!d.crease?'selected':''}" onclick="v4SetCrease('')">No preference</div><div class="chip ${d.crease==='crease'?'selected':''}" onclick="v4SetCrease('crease')">Crease</div><div class="chip ${d.crease==='nocrease'?'selected':''}" onclick="v4SetCrease('nocrease')">No Crease</div></div>`:''}<span class="field-label">Special buttons</span><div class="v3-btn-attr" style="margin-bottom:10px">${BUTTON_TYPES.map(bt=>`<div class="chip ${d.builder.buttonType===bt.id?'selected':''}" onclick="v3SetButtonType('${bt.id}')">${bt.name}</div>`).join('')}</div><input class="text-input" placeholder="Stain, damage, missing button or garment-specific note" value="${esc(d.builder.garmentNote||'')}" oninput="v3SetGarmentNote(this.value)"></div></details>
        <div class="builder-preview"><div>${d.builder.garmentId?`<div style="font-weight:700;font-size:13.5px">${esc(garmentById(d.builder.garmentId).name)}</div><div style="font-size:11.5px;color:var(--ink-secondary)">${esc(colorById(d.builder.colorId).name)}${!['standard','cotton'].includes(d.builder.materialId)?` · ${esc(materialById(d.builder.materialId).name)}`:''} · ${money(garmentUnitPrice(d.builder.garmentId,d.builder.materialId))}</div>`:`<div style="font-size:12.5px;color:var(--ink-muted)">Choose a garment and color</div>`}</div><div style="display:flex;align-items:end;gap:10px"><label class="v9-builder-qty"><span>Quantity</span><input type="number" min="1" step="1" value="${esc(d.builder.qty)}" oninput="v9SetBuilderQty(this.value)"></label><button class="btn btn-primary btn-sm" ${!d.builder.garmentId?'disabled':''} onclick="posAddGarmentToTicket()">${icon('plus',14)} Add to Visit</button></div></div>`:
      d.serviceMode==='washfold'?`<div class="v3-ticket-head"><div><span class="field-label">Pounds</span><input class="text-input" type="number" step=".1" placeholder="13.0" value="${esc(d.wf.pounds)}" oninput="v4SetWfField('pounds',this.value)"></div><div><span class="field-label">Bag Color</span><select class="text-input" onchange="v4SetWfField('bagColor',this.value)">${BAG_COLORS.map(c=>`<option ${d.wf.bagColor===c?'selected':''}>${c}</option>`).join('')}</select></div></div><span class="field-label">Preferences / Upcharges</span><div class="v4-option-grid">${WF_UPCHARGES.map(o=>`<div class="v4-option ${d.wf.options.includes(o.id)?'on':''}" onclick="v4ToggleWfOption('${o.id}')">${o.name}${o.price?` · +${money(o.price)}`:''}</div>`).join('')}</div><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="v4AddWashFold()">Add Wash & Fold to Visit</button>`:
      d.serviceMode==='shirts'?`<div class="builder-preview" style="margin-bottom:12px"><div><strong>Laundered Shirts</strong><div class="row-sub">${d.shirts.packaging==='box'?'Boxed':'On hanger'}</div></div><label class="v9-builder-qty"><span>Quantity</span><input type="number" min="1" step="1" value="${esc(d.shirts.qty)}" oninput="v9SetShirtQty(this.value)"></label></div><span class="field-label">Packaging</span><div class="v3-quick" style="margin-bottom:12px"><div class="chip ${d.shirts.packaging==='hanger'?'selected':''}" onclick="v4SetShirtPackaging('hanger')">On Hanger</div><div class="chip ${d.shirts.packaging==='box'?'selected':''}" onclick="v4SetShirtPackaging('box')">Boxed</div></div><span class="field-label">Starch</span><div class="v3-quick">${STARCH_LEVELS.map(s=>`<div class="chip ${d.shirts.starch===s?'selected':''}" onclick="v4SetStarch('${s}')">${s}</div>`).join('')}</div><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="v4AddLaunderedShirts()">Add Shirts to Visit</button>`:
      `<span class="field-label">Alteration work</span><div class="v4-popular-grid">${(state.interfaceSettings?.alterationOrder||[]).map(id=>{const a=ALTERATION_VARIANTS.find(x=>x.id===id);return a?`<div class="v4-garment-btn ${d.alteration.variantId===id?'selected':''}" onclick="v4SetAlterVariant('${id}')"><strong>${a.garment} — ${a.name}</strong><span>${a.price?money(a.price):'Quote'}</span></div>`:''}).join('')}</div><div class="builder-preview" style="margin-top:12px"><div><strong>${ALTERATION_VARIANTS.find(x=>x.id===d.alteration.variantId)?.name||'Alteration'}</strong></div><label class="v9-builder-qty"><span>Quantity</span><input type="number" min="1" step="1" value="${esc(d.alteration.qty)}" oninput="v9SetAlterQty(this.value)"></label></div><textarea style="margin-top:10px" rows="2" placeholder="Exact alteration instructions…" oninput="v9SetAlterInfo(this.value)">${esc(d.alteration.additionalInfo)}</textarea><div class="pref-row" style="margin-top:10px"><div><div class="pr-label">Dry clean this garment also</div><div class="pr-sub">Creates a separate linked dry-cleaning ticket</div></div><div class="switch ${d.alteration.dryCleanAlso?'on':''}" onclick="v5ToggleAlterDryClean()"></div></div>${d.alteration.dryCleanAlso?`<div style="margin-top:10px"><span class="field-label">Garment to dry clean</span><select class="text-input" onchange="v5SetAlterDryGarment(this.value)">${(state.interfaceSettings?.drycleanOrder||[]).map(id=>{const g=garmentById(id);return g?`<option value="${id}" ${d.alteration.dryCleanGarmentId===id?'selected':''}>${g.name} · ${money(g.basePrice)}</option>`:''}).join('')}</select></div>`:''}<button class="btn btn-primary btn-block" style="margin-top:12px" onclick="v4AddAlteration()">Add Alteration${d.alteration.dryCleanAlso?' + Separate Dry Cleaning Ticket':''} to Visit</button>`}
      <div class="v3-quick" style="margin-top:14px"><div class="chip ${d.fulfillment==='pickup'?'selected':''}" onclick="v3SetFulfillment('pickup')">${icon('box',14)} Customer Pickup</div><div class="chip ${d.fulfillment==='delivery'?'selected':''}" onclick="v3SetFulfillment('delivery')">${icon('truck',14)} Return Delivery</div></div>
    </div>
    <div class="pos-card"><h3>Special Instructions & Photos</h3><div class="chip-row" style="margin-bottom:12px">${INSTRUCTION_TAGS.map(t=>`<div class="chip ${d.tags.includes(t.id)?'selected':''}" onclick="posToggleTag('${t.id}')">${icon(t.icon,14)} ${t.label}</div>`).join('')}</div><textarea rows="2" placeholder="Notes for production…" oninput="posSetNotes(this.value)">${esc(d.notes)}</textarea><div class="photo-grid" style="margin-top:10px">${d.photos.map(p=>photoThumbHTML(p,`posRemoveCounterPhoto('${p.id}')`)).join('')}<label class="photo-add-btn">${icon('camera',20)}<span>Add Photo</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="posCaptureCounterPhoto(event)"></label></div></div>
  </div>
  <div class="ticket-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">This Customer Visit</h3><button class="btn btn-ghost btn-sm" style="color:var(--status-critical)" onclick="v3VoidDraftTicket()">Void</button></div><div class="ticket-num" id="v9-visit-ticket-count" style="margin-top:6px">${v9VisitTicketCount()?`${v9VisitTicketCount()} separate ticket${v9VisitTicketCount()===1?'':'s'} in progress`:'Add services to begin'}</div><div id="v9-pending-slot">${v9PendingDraftHTML()}</div>${groups.map((group,index)=>{const subtotal=v8ServiceSubtotal(group.items), next=state.nextTicket+index;return `<div class="v8-ticket-group"><div class="v8-ticket-group-head"><div><strong>#${String(next).padStart(6,'0')} · ${V8_SERVICE_NAMES[group.service]}</strong><div class="row-sub">${group.items.length} line${group.items.length===1?'':'s'} · ${money(subtotal)}</div></div>${v8DraftTagHTML(group.service,group.items)}</div><span class="field-label" style="margin-top:8px">Due date for this ticket</span><input class="text-input" type="date" value="${v8DraftDue(group.service)}" onchange="v8SetDraftDue('${group.service}',this.value)"></div>`}).join('')}${d.items.length?d.items.map(v8TicketItemHTML).join(''):`<div class="ticket-empty">${icon('receipt',26)}<div style="margin-top:8px">Your current selection appears above. Add it, or choose another garment/service to preserve it automatically.</div></div>`}
    ${d.items.length?`<div class="price-line" style="margin-top:10px"><span>Service subtotal</span><strong id="v9-visit-subtotal">${money(base)}</strong></div>${fee?`<div class="price-line v8-fee-row"><span>Card convenience fee (3%)</span><strong id="v9-visit-fee">${money(fee)}</strong></div>`:''}<div class="price-line"><span class="pl-total">Visit Total</span><span class="pl-total" id="v9-visit-total">${money(base+fee)}</span></div><span class="field-label" style="margin-top:12px">Payment</span><div class="segmented" style="margin-bottom:10px"><div class="seg ${!d.payNow?'selected':''}" onclick="posSetPayNow(false)">Pay Later</div><div class="seg ${d.payNow?'selected':''}" onclick="posSetPayNow(true)">Pay Now</div></div>${d.payNow?`<div class="chip-row" style="margin-bottom:12px"><div class="chip ${d.paymentMethod==='card'?'selected':''}" onclick="posSetPayMethod('card')">${icon('creditcard',14)} Card +3%</div><div class="chip ${d.paymentMethod==='cash'?'selected':''}" onclick="posSetPayMethod('cash')">${icon('cash',14)} Cash</div></div>`:''}<div class="v8-secure-note">Each customer ticket prints on the 80mm Star receipt roll with its own barcode, due date and price. Physical garment tags are assigned afterward in Tag Assign, once the customer has left.</div><button class="btn btn-primary btn-block" onclick="posCompleteDropOff()">${icon('checkcircle',17)} Create ${v9VisitTicketCount()} Ticket${v9VisitTicketCount()===1?'':'s'} & Print</button>`:''}
  </div></div>`;
};

function v9LineMatches(a,b) {
  return a.serviceType===b.serviceType && a.garmentId===b.garmentId && a.materialId===b.materialId && a.colorId===b.colorId && (a.buttonType||'')===(b.buttonType||'') && (a.garmentNote||'')===(b.garmentNote||'');
}
function v9AddOrMergeLine(line) {
  const match = counterDraft.items.find(item => v9LineMatches(item,line));
  if (match) match.qty = Number(match.qty || 0) + Number(line.qty || 0);
  else counterDraft.items.push(line);
}
function v9RefreshVisitDraft() {
  const slot=document.getElementById('v9-pending-slot');if(slot)slot.innerHTML=v9PendingDraftHTML();
  const count=v9VisitTicketCount(),countEl=document.getElementById('v9-visit-ticket-count');if(countEl)countEl.textContent=count?`${count} separate ticket${count===1?'':'s'} in progress`:'Add services to begin';
  const subtotal=v8DraftBaseTotal()+v9PendingSubtotal(),fee=counterDraft.payNow&&counterDraft.paymentMethod==='card'?Math.round(subtotal*.03*100)/100:0;
  const subtotalEl=document.getElementById('v9-visit-subtotal'),feeEl=document.getElementById('v9-visit-fee'),totalEl=document.getElementById('v9-visit-total');
  if(subtotalEl)subtotalEl.textContent=money(subtotal);if(feeEl)feeEl.textContent=money(fee);if(totalEl)totalEl.textContent=money(subtotal+fee);
  const createButton=document.querySelector('button[onclick="posCompleteDropOff()"]');if(createButton)createButton.innerHTML=`${icon('checkcircle',17)} Create ${count} Ticket${count===1?'':'s'} & Print`;
}
function v9SetBuilderQty(value) { counterDraft.builder.qty=v9PositiveNumber(value);v9RefreshVisitDraft(); }
function v9SetLineQty(index,value,decimal=false) { const line=counterDraft.items[index];if(!line)return;line.qty=v9PositiveNumber(value,1,decimal);const price=document.getElementById(`v9-line-price-${index}`);if(price)price.textContent=money(line.unitPrice*line.qty);v9RefreshVisitDraft(); }
function v9SetShirtQty(value) { counterDraft.shirts.qty=v9PositiveNumber(value);counterDraft.shirts.touched=true;v9RefreshVisitDraft(); }
function v9SetAlterQty(value) { counterDraft.alteration.qty=v9PositiveNumber(value);counterDraft.alteration.touched=true;v9RefreshVisitDraft(); }
function v9SetAlterInfo(value) { counterDraft.alteration.additionalInfo=value;counterDraft.alteration.touched=true;v9RefreshVisitDraft(); }
function v9ClearPending() {
  const service=counterDraft.serviceMode;
  if(service==='dryclean'){counterDraft.builder={tab:'garment',garmentId:null,materialId:'standard',colorId:counterDraft.builder?.colorId||'black',qty:1,buttonType:'standard',garmentNote:''};counterDraft.crease='';}
  if(service==='washfold')counterDraft.wf={pounds:'',bagColor:'Black',options:[],touched:false};
  if(service==='shirts')counterDraft.shirts={qty:1,packaging:'hanger',starch:'None',touched:false};
  if(service==='alterations')counterDraft.alteration={variantId:'pants_hem',qty:1,additionalInfo:'',dryCleanAlso:false,dryCleanGarmentId:'g_pants',touched:false};
  renderPosContent();
}
function v9CommitDryCleaning(render=true) {
  const b=counterDraft.builder;if(!b?.garmentId)return false;
  const notes=[b.garmentNote||''];
  if(v8IsPants(b.garmentId)&&counterDraft.crease)notes.push(counterDraft.crease==='nocrease'?'No crease':'Crease');
  const line={garmentId:b.garmentId,materialId:b.materialId||'standard',colorId:b.colorId||'black',qty:v9PositiveNumber(b.qty),unitPrice:garmentUnitPrice(b.garmentId,b.materialId||'standard'),buttonType:b.buttonType||'standard',garmentNote:notes.filter(Boolean).join(' · '),serviceType:'dryclean'};
  if(Number.isInteger(b.editingIndex))counterDraft.items[b.editingIndex]=line;else v9AddOrMergeLine(line);
  counterDraft.builder={tab:'garment',garmentId:null,materialId:'standard',colorId:b.colorId||'black',qty:1,buttonType:'standard',garmentNote:''};counterDraft.crease='';counterDraft.serviceDueDates.dryclean||=v8DefaultDue('dryclean');
  if(render)renderPosContent();return true;
}
function v9CommitWashFold(render=true,force=false) {
  const line=v9WashFoldLine();if(!line||(!force&&!counterDraft.wf.touched))return false;
  counterDraft.items.push(line);counterDraft.wf={pounds:'',bagColor:'Black',options:[],touched:false};counterDraft.serviceDueDates.washfold||=v8DefaultDue('washfold');
  if(render)renderPosContent();return true;
}
function v9CommitShirts(render=true,force=false) {
  if(!force&&!counterDraft.shirts.touched)return false;const line=v9ShirtLine();if(!line)return false;
  v9AddOrMergeLine(line);counterDraft.shirts={qty:1,packaging:'hanger',starch:'None',touched:false};counterDraft.serviceDueDates.shirts||=v8DefaultDue('shirts');
  if(render)renderPosContent();return true;
}
function v9CommitAlterations(render=true,force=false) {
  if(!force&&!counterDraft.alteration.touched)return false;const lines=v9AlterationLines();if(!lines.length)return false;
  lines.forEach(v9AddOrMergeLine);counterDraft.alteration={variantId:'pants_hem',qty:1,additionalInfo:'',dryCleanAlso:false,dryCleanGarmentId:'g_pants',touched:false};counterDraft.serviceDueDates.alterations||=v8DefaultDue('alterations');if(lines.some(x=>x.serviceType==='dryclean'))counterDraft.serviceDueDates.dryclean||=v8DefaultDue('dryclean');
  if(render)renderPosContent();return true;
}
function v9CommitPendingCurrentService(render=false,force=false) {
  const service=counterDraft.serviceMode;
  if(service==='dryclean')return v9CommitDryCleaning(render);
  if(service==='washfold')return v9CommitWashFold(render,force);
  if(service==='shirts')return v9CommitShirts(render,force);
  if(service==='alterations')return v9CommitAlterations(render,force);
  return false;
}
posSetBuilderGarment = function v9SetBuilderGarment(id) {
  const current=counterDraft.builder?.garmentId;
  if(current&&current!==id)v9CommitDryCleaning(false);
  counterDraft.builder.garmentId=id;counterDraft.builder.qty=v9PositiveNumber(counterDraft.builder.qty);
  if(!v8IsPants(id))counterDraft.crease='';
  renderPosContent();
};
v3EditLine = function v8EditLine(idx) {
  const it=counterDraft.items[idx]; if(!it)return;
  const editableNote=String(it.garmentNote||'').split(' · ').filter(part=>!/^(?:No crease|Crease)$/i.test(part.trim())).join(' · ');
  counterDraft.builder={tab:'garment',garmentId:it.garmentId,materialId:it.materialId||'standard',colorId:it.colorId||'black',qty:it.qty,buttonType:it.buttonType||'standard',garmentNote:editableNote,editingIndex:idx};
  counterDraft.serviceMode=v8ServiceForItem(it);
  if(v8IsPants(it.garmentId)) counterDraft.crease=/No crease/i.test(it.garmentNote||'')?'nocrease':/(^|·)\s*Crease/i.test(it.garmentNote||'')?'crease':'';
  renderPosContent();
};
v3SaveBuilderLine = function v9SaveBuilderLine() { return v9CommitDryCleaning(true); };
v4SetService = function v9SetService(service) { if(counterDraft.serviceMode!==service)v9CommitPendingCurrentService(false,false);counterDraft.serviceMode=service;renderPosContent(); };
v4SetWfField = function v9SetWfField(key,value) { counterDraft.wf[key]=value;counterDraft.wf.touched=true;v9RefreshVisitDraft(); };
v4ToggleWfOption = function v9ToggleWfOption(id) { const values=counterDraft.wf.options,index=values.indexOf(id);if(index>=0)values.splice(index,1);else values.push(id);counterDraft.wf.touched=true;renderPosContent(); };
v4SetShirtPackaging = function v9SetShirtPackaging(value) { counterDraft.shirts.packaging=value;counterDraft.shirts.touched=true;renderPosContent(); };
v4SetStarch = function v9SetStarch(value) { counterDraft.shirts.starch=value;counterDraft.shirts.touched=true;renderPosContent(); };
v4SetShirtQty = function v9AdjustShirtQty(delta) { counterDraft.shirts.qty=Math.max(1,Number(counterDraft.shirts.qty||1)+delta);counterDraft.shirts.touched=true;renderPosContent(); };
v4SetAlterVariant = function v9SetAlterVariant(id) { counterDraft.alteration.variantId=id;counterDraft.alteration.touched=true;renderPosContent(); };
v4SetAlterQty = function v9AdjustAlterQty(delta) { counterDraft.alteration.qty=Math.max(1,Number(counterDraft.alteration.qty||1)+delta);counterDraft.alteration.touched=true;renderPosContent(); };
v5ToggleAlterDryClean = function v9ToggleAlterDryClean() { counterDraft.alteration.dryCleanAlso=!counterDraft.alteration.dryCleanAlso;counterDraft.alteration.touched=true;renderPosContent(); };
v5SetAlterDryGarment = function v9SetAlterDryGarment(id) { counterDraft.alteration.dryCleanGarmentId=id;counterDraft.alteration.touched=true;renderPosContent(); };
v4AddWashFold = function v9AddWashFold() { if(!v9CommitWashFold(true,true))toast('Enter wash & fold pounds',false,'alerttriangle'); };
v4AddLaunderedShirts = function v9AddLaunderedShirts() { v9CommitShirts(true,true); };
v4AddAlteration = function v9AddAlteration() { v9CommitAlterations(true,true); };
v3SetGarmentNote = function v9SetGarmentNote(value) { counterDraft.builder.garmentNote=value;v9RefreshVisitDraft(); };

const V10_NUMBER_WORDS={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const V10_GARMENT_ALIASES=[
  {id:'g_shirt_dc',source:'(?:dress\\s+shirts?|button[ -]?down\\s+shirts?)'},
  {id:'g_suit2',source:'(?:two|2)[ -]?piece\\s+suits?'},
  {id:'g_pants',source:'(?:pants?|trousers?|slacks?)'},
  {id:'g_blouse',source:'blouses?'},{id:'g_sweater',source:'(?:sweaters?|cardigans?)'},
  {id:'g_dress',source:'(?:dresses|dress)'},{id:'g_skirt',source:'skirts?'},
  {id:'g_suit2',source:'suits?'},{id:'g_jacket',source:'(?:jackets?|blazers?)'},
  {id:'g_coat',source:'(?:coats?|overcoats?)'},{id:'g_tie',source:'(?:ties|tie)'},
  {id:'g_scarf',source:'(?:scarves|scarf)'},{id:'g_shorts',source:'shorts'},
  {id:'g_vest',source:'vests?'},{id:'g_comforter',source:'comforters?'},
  {id:'g_blanket',source:'blankets?'},{id:'g_bathrug',source:'(?:bath\\s+rugs?|bathmats?)'},
  {id:'g_curtains',source:'(?:curtains?|drapes?)'},{id:'g_shirt_dc',source:'shirts?'}
];
const V10_COLOR_ALIASES=[
  ['lightblue',/\blight\s+blue\b/gi],['white',/\bwhite\b/gi],['ivory',/\bivory\b/gi],['beige',/\bbeige\b/gi],['tan',/\btan\b/gi],['brown',/\bbrown\b/gi],['black',/\bblack\b/gi],['gray',/\bgr[ae]y\b/gi],['navy',/\bnavy(?:\s+blue)?\b/gi],['blue',/\bblue\b/gi],['green',/\bgreen\b/gi],['olive',/\bolive\b/gi],['purple',/\bpurple\b/gi],['pink',/\bpink\b/gi],['red',/\bred\b/gi],['orange',/\borange\b/gi],['yellow',/\byellow\b/gi],['print',/\b(?:print|patterned|multi-?color(?:ed)?)\b/gi]
];
const V10_MATERIAL_ALIASES=[['cashmere',/\bcashmere\b/i],['leather',/\b(?:leather|suede)\b/i],['viscose',/\bviscose\b/i],['rayon',/\brayon\b/i],['linen',/\blinen\b/i],['wool',/\bwool(?:en)?\b/i],['silk',/\bsilk(?:en)?\b/i],['synthetic',/\b(?:synthetic|polyester|nylon)\b/i]];

function v10NormalizeVoice(text){return String(text||'').toLowerCase().replace(/[&+]/g,' and ').replace(/\bwash\s+(?:n|and)\s+full\b/g,'wash and fold').replace(/\bwash\s+n\s+fold\b/g,'wash and fold').replace(/\bsoftner\b/g,'softener').replace(/\s+/g,' ').trim();}
function v10NumberMatches(text){
  const words=Object.keys(V10_NUMBER_WORDS).join('|'),matches=[...String(text||'').matchAll(new RegExp(`\\b(\\d+(?:\\.\\d+)?|${words})\\b`,'gi'))];
  return matches.map(match=>({index:match.index,value:/^\d/.test(match[1])?Number(match[1]):V10_NUMBER_WORDS[match[1].toLowerCase()],raw:match[1]}));
}
function v10QuantityBefore(text){const matches=v10NumberMatches(text);return matches.length?{value:matches.at(-1).value,explicit:true}:{value:1,explicit:false};}
function v10FindColors(text){
  const found=[];V10_COLOR_ALIASES.forEach(([id,re])=>{re.lastIndex=0;for(const match of String(text||'').matchAll(re))found.push({id,index:match.index,end:match.index+match[0].length});});
  found.sort((a,b)=>a.index-b.index||(b.end-b.index)-(a.end-a.index));const kept=[];found.forEach(entry=>{if(!kept.some(prev=>entry.index<prev.end&&entry.end>prev.index))kept.push(entry);});return kept.map(x=>x.id);
}
function v10FindMaterial(text){for(const [id,re] of V10_MATERIAL_ALIASES)if(re.test(text))return id;return 'standard';}
function v10TrimAtService(text){const match=String(text||'').match(/\b(?:wash\s*(?:and|n)?\s*fold|laundry\s+by\s+the\s+pound|laundered\s+shirts?|shirt\s+laundry|alterations?|tailoring|dry\s*clean(?:ing)?)\b/i);return match?text.slice(0,match.index):text;}
function v10GarmentMatches(text){
  const candidates=[];V10_GARMENT_ALIASES.forEach(alias=>{for(const match of text.matchAll(new RegExp(`\\b${alias.source}\\b`,'gi')))candidates.push({id:alias.id,index:match.index,end:match.index+match[0].length,text:match[0]});});
  candidates.sort((a,b)=>a.index-b.index||(b.end-b.index)-(a.end-a.index));
  return candidates.filter((candidate,index,all)=>!all.slice(0,index).some(kept=>candidate.index<kept.end&&candidate.end>kept.index));
}
function v10IsNonDryGarmentContext(text,match){
  const before=text.slice(Math.max(0,match.index-45),match.index),after=text.slice(match.end,Math.min(text.length,match.end+35));
  if(/(?:hem|hemming|alter|tailor|zipper|waist|repair|seam|shorten|lengthen)\s*(?:\w+\s*){0,3}$/i.test(before))return true;
  if(/^\s*(?:hem|hemming|alteration|zipper|waist|repair|seam|shorten|lengthen)\b/i.test(after))return true;
  if(match.id==='g_shirt_dc'&&/(?:laundered|washed|boxed|on\s+hanger|starch)\s*(?:\w+\s*){0,3}$/i.test(before))return true;
  return false;
}
function v10GarmentModifiers(text){
  const mods=[];[['Long',/\b(?:long|full[ -]?length|maxi)\b/i],['Short',/\b(?:short|mini)\b/i],['Beaded',/\bbead(?:ed|ing)?\b/i],['Sequined',/\bsequin(?:ed|s)?\b/i],['Pleated',/\bpleat(?:ed|s)?\b/i],['Lined',/\blined\b/i],['Delicate',/\bdelicate\b/i]].forEach(([label,re])=>{if(re.test(text))mods.push(label);});
  if(/\bno\s+crease\b/i.test(text))mods.push('No crease');else if(/\bcrease\b/i.test(text))mods.push('Crease');return mods;
}
function v10ButtonType(text){if(/mother\s+of\s+pearl/i.test(text))return'motherofpearl';if(/\bmetal\s+buttons?/i.test(text))return'metal';if(/\b(?:horn|faux\s+horn)\s+buttons?/i.test(text))return'horn';if(/\bcovered\s+buttons?/i.test(text))return'covered';return'standard';}
function v10ParseDryGarments(text,warnings){
  const matches=v10GarmentMatches(text),items=[];
  matches.forEach((match,index)=>{
    if(v10IsNonDryGarmentContext(text,match))return;
    const prevEnd=index?matches[index-1].end:0,nextStart=index<matches.length-1?matches[index+1].index:text.length;
    const prefix=text.slice(prevEnd,match.index),suffix=v10TrimAtService(text.slice(match.end,nextStart));
    const quantity=v10QuantityBefore(prefix),context=`${prefix} ${suffix}`,materialId=v10FindMaterial(context),g=garmentById(match.id);if(!g)return;
    let colors=v10FindColors(suffix);if(!colors.length)colors=v10FindColors(prefix);
    let qty=Math.max(1,Math.round(quantity.value||1));
    if(!quantity.explicit&&colors.length>1){qty=colors.length;warnings.push(`${g.name}: quantity inferred as ${qty} from the ${qty} colors stated.`);}
    const notes=v10GarmentModifiers(context),buttonType=v10ButtonType(context),baseNote=[...notes,'AI voice'].join(' · ');
    const add=(colorId,lineQty,note='')=>items.push({garmentId:g.id,materialId,colorId,qty:lineQty,unitPrice:garmentUnitPrice(g.id,materialId),buttonType,garmentNote:[baseNote,note].filter(Boolean).join(' · '),serviceType:'dryclean'});
    if(colors.length>1){
      colors.slice(0,qty).forEach(color=>add(color,1));
      if(colors.length<qty){add('print',qty-colors.length,'Color not stated — verify');warnings.push(`${g.name}: ${qty-colors.length} piece${qty-colors.length===1?'':'s'} still need a color.`);}
      if(colors.length>qty)warnings.push(`${g.name}: more colors than quantity were heard; only the first ${qty} were used.`);
    }else if(colors.length===1)add(colors[0],qty);else{add('print',qty,'Color not stated — verify');warnings.push(`${g.name}: color was not stated.`);}
  });
  return items;
}
function v10WashFoldSegment(text){
  const marker=text.match(/\b(?:wash\s*(?:and|n)?\s*fold|wash\s*fold|laundry\s+by\s+the\s+pound)\b/i),weight=text.match(/\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:lb|lbs|pounds?)\b/i);
  if(!marker&&!weight)return'';const start=Math.max(0,Math.min(marker?.index??text.length,weight?.index??text.length)-25),tail=text.slice(start),next=tail.slice(5).search(/\b(?:dry\s*clean(?:ing)?|laundered\s+shirts?|shirt\s+laundry|alterations?|tailoring)\b/i);return next>=0?tail.slice(0,next+5):tail;
}
function v10ParseWashFold(text,warnings,tags){
  const segment=v10WashFoldSegment(text);if(!segment)return[];
  const weight=segment.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:lb|lbs|pounds?)\b/i);
  if(!weight){warnings.push('Wash & Fold was heard, but no weight was found.');return[];}
  const lbs=/^\d/.test(weight[1])?Number(weight[1]):V10_NUMBER_WORDS[weight[1].toLowerCase()],g=garmentById('g_wf');if(!g||!lbs)return[];
  const bagMatch=segment.match(/\b(black|white|blue|green|red|gr[ae]y|clear)\s+bag\b|\bbag(?:\s+color)?\s+(black|white|blue|green|red|gr[ae]y|clear)\b/i),bagRaw=(bagMatch?.[1]||bagMatch?.[2]||'Black').replace(/^./,c=>c.toUpperCase()).replace('Grey','Gray');
  const optionIds=[];if(/\b(?:low\s+dry|low\s+heat|dry\s+low)\b/i.test(segment))optionIds.push('lowdry');if(/\bno\s+(?:fabric\s+)?softener\b/i.test(segment))optionIds.push('nosoftener');if(/\bdelicate(?:\s+cycle)?\b/i.test(segment))optionIds.push('delicate');if(/\bhang\s+dry\b/i.test(segment))optionIds.push('hangdry');if(/\bseparate\s+(?:darks?|colors?)\s*(?:and|from|\/)\s*(?:whites?|lights?)\b/i.test(segment))optionIds.push('separate');
  if(/\bfragrance[ -]?free\b|\bno\s+fragrance\b/i.test(segment)&&!tags.includes('fragrancefree'))tags.push('fragrancefree');
  const extras=optionIds.map(id=>WF_UPCHARGES.find(x=>x.id===id)).filter(Boolean),extraTotal=extras.reduce((sum,x)=>sum+Number(x.price||0),0),belowMin=Number(g.minWeight||0)&&lbs<Number(g.minWeight||0),baseCharge=belowMin?Number(g.minCharge||0):lbs*Number(g.basePrice||0);
  return [{garmentId:g.id,materialId:'standard',colorId:'print',qty:lbs,unitPrice:(baseCharge+extraTotal)/lbs,buttonType:'none',garmentNote:[`Bag: ${bagRaw}`,...extras.map(x=>x.name),'AI voice'].join(' · '),serviceType:'washfold'}];
}
function v10ParseShirts(text){
  const candidates=[...text.matchAll(/\b(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+)?(?:(laundered|washed)\s+)?shirts?\b/gi)];
  for(const match of candidates){const context=text.slice(Math.max(0,match.index-30),Math.min(text.length,match.index+match[0].length+45));if(!match[2]&&!/\b(?:box(?:ed)?|hanger|starch)\b/i.test(context))continue;const qty=match[1]?(/^\d/.test(match[1])?Number(match[1]):V10_NUMBER_WORDS[match[1].toLowerCase()]):1,boxed=/\bbox(?:ed)?\b/i.test(context),g=garmentById(boxed?'g_lshirt_box':'g_lshirt');if(!g)return[];const starch=(context.match(/\b(none|no|light|medium|heavy)\s+starch\b/i)?.[1]||'None').replace(/^./,c=>c.toUpperCase()).replace('No','None');return[{garmentId:g.id,materialId:'standard',colorId:'white',qty,unitPrice:g.basePrice,buttonType:'standard',garmentNote:`${boxed?'Boxed':'On hanger'} · Starch: ${starch} · AI voice`,serviceType:'shirts'}];}return[];
}
function v10ParseAlteration(text){
  if(!/\b(?:alter|tailor|hem|zipper|waist|seam|shorten|lengthen|button|patch|hook\s+and\s+eye)\b/i.test(text))return[];
  const items=[],g=garmentById('g_alteration');if(!g)return[];
  const matches=v10GarmentMatches(text).filter(match=>['g_pants','g_dress','g_skirt','g_jacket','g_coat','g_shirt_dc','g_blouse'].includes(match.id));
  matches.forEach((match,index)=>{
    const prevEnd=index?matches[index-1].end:0,nextStart=index<matches.length-1?matches[index+1].index:text.length,prefix=text.slice(prevEnd,match.index),suffix=v10TrimAtService(text.slice(match.end,nextStart)),context=`${prefix} ${suffix}`;
    if(!/\b(?:alter|tailor|hem|zipper|waist|seam|shorten|lengthen|button|patch|hook\s+and\s+eye)\b/i.test(context))return;
    const qty=Math.max(1,Math.round(v10QuantityBefore(prefix).value||1));let id='general_custom';
    if(/\bzipper\b/i.test(context))id=match.id==='g_dress'||match.id==='g_skirt'?'dress_zipper':match.id==='g_coat'?'coat_zipper':'pants_zipper';
    else if(/\bwaist\b/i.test(context))id='pants_waist';
    else if(/\bseam\b/i.test(context))id=match.id==='g_dress'||match.id==='g_skirt'?'dress_seam':['g_shirt_dc','g_blouse'].includes(match.id)?'shirt_seam':'pants_seam';
    else if(/\bhem\b|\blengthen\b/i.test(context))id=match.id==='g_dress'||match.id==='g_skirt'?'dress_hem':'pants_hem';
    else if(/\bshorten(?:\s+the)?\s+sleeves?\b/i.test(context)&&match.id==='g_jacket')id='jacket_sleeve';
    else if(/\bbutton\b/i.test(context))id=match.id==='g_jacket'?'jacket_button':'shirt_button';
    const a=ALTERATION_VARIANTS.find(x=>x.id===id);if(a)items.push({garmentId:g.id,materialId:'standard',colorId:'print',qty,unitPrice:a.price,buttonType:'none',garmentNote:`${a.garment} · ${a.name} · AI voice — verify exact measurement`,serviceType:'alterations',alterationVariantId:a.id});
  });
  if(!items.length){let id=/\bpatch\b/i.test(text)?'general_patch':/hook\s+and\s+eye/i.test(text)?'general_hook':'general_custom',a=ALTERATION_VARIANTS.find(x=>x.id===id);if(a)items.push({garmentId:g.id,materialId:'standard',colorId:'print',qty:1,unitPrice:a.price,buttonType:'none',garmentNote:`${a.garment} · ${a.name} · AI voice — verify exact measurement`,serviceType:'alterations',alterationVariantId:a.id});}
  return items;
}
function v10VoiceItemLabel(item){const g=garmentById(item.garmentId);if(item.serviceType==='washfold')return`${item.qty} lb Wash & Fold · ${item.garmentNote.replace(' · AI voice','')}`;const details=[g?.name||'Item',`× ${item.qty}`];if(item.colorId&&!['print'].includes(item.colorId))details.push(colorById(item.colorId).name);if(item.materialId&&!['standard','cotton'].includes(item.materialId))details.push(materialById(item.materialId).name);if(item.garmentNote)details.push(item.garmentNote.replace(/ · AI voice(?: — verify exact measurement)?/g,''));return details.filter(Boolean).join(' · ');}
function v10AiReviewHTML(){const review=counterDraft?.aiInterpretation;if(!review)return'';return`<div class="v10-ai-review"><div class="v10-ai-review-head">${icon('checkcircle',14)} <strong>Understood: ${esc(review.summary)}</strong></div>${review.lines.map(line=>`<div class="v10-ai-line">${esc(line)}</div>`).join('')}${review.warnings.length?`<div class="v10-ai-warnings"><strong>Please verify:</strong> ${review.warnings.map(esc).join(' ')}</div>`:'<div class="v10-ai-good">All stated quantities and variations were matched.</div>'}<div class="v10-ai-foot">Nothing is finalized. Edit quantities or remove any line in “This Customer Visit.”</div></div>`;}

v3VoiceParse = function v10VoiceParse() {
  const raw=(document.getElementById('v3-ai-transcript')?.value||counterDraft.aiTranscript||'').trim();if(!raw)return toast('Dictate or type the drop-off first',false,'alerttriangle');
  const text=v10NormalizeVoice(raw),warnings=[],tags=[],items=[...v10ParseDryGarments(text,warnings),...v10ParseWashFold(text,warnings,tags),...v10ParseShirts(text),...v10ParseAlteration(text)];
  if(!items.length)return toast('I could not identify a garment, Wash & Fold weight, shirt-laundry order or alteration. Try quantities plus garment names.',false,'alerttriangle');
  const replace=counterDraft.items.length?confirm('AI found new lines. OK replaces the current visit lines; Cancel adds these lines to the existing visit.'):true;
  if(replace)counterDraft.items=[];items.forEach(v9AddOrMergeLine);tags.forEach(tag=>{if(!counterDraft.tags.includes(tag))counterDraft.tags.push(tag);});counterDraft.aiTranscript=raw;
  const services=[...new Set(items.map(v8ServiceForItem))];services.forEach(service=>counterDraft.serviceDueDates[service]||=v8DefaultDue(service));counterDraft.serviceMode=services[0];
  const dryPieces=items.filter(x=>v8ServiceForItem(x)==='dryclean').reduce((sum,x)=>sum+Number(x.qty||0),0),wf=items.find(x=>x.serviceType==='washfold'),shirts=items.filter(x=>x.serviceType==='shirts').reduce((sum,x)=>sum+Number(x.qty||0),0),alterations=items.filter(x=>x.serviceType==='alterations').reduce((sum,x)=>sum+Number(x.qty||0),0),parts=[];
  if(dryPieces)parts.push(`${dryPieces} dry-clean piece${dryPieces===1?'':'s'}`);if(wf)parts.push(`${wf.qty} lb Wash & Fold`);if(shirts)parts.push(`${shirts} laundered shirt${shirts===1?'':'s'}`);if(alterations)parts.push(`${alterations} alteration${alterations===1?'':'s'}`);
  counterDraft.aiInterpretation={summary:`${parts.join(' + ')} across ${services.length} ticket${services.length===1?'':'s'}`,lines:items.map(v10VoiceItemLabel),warnings,at:v8NowISO()};counterDraft.notes=`AI intake transcript: ${raw}`;
  toast(`${services.length} separate ticket draft${services.length===1?'':'s'} created with ${items.length} reviewed line${items.length===1?'':'s'}`,true,'sparkle');renderPosContent();
};

posCompleteDropOff = function v8CompleteDropOff() {
  const d=counterDraft, groups=v8DraftGroups(); if(!groups.length)return;
  const customer=d.customerId?customerById(d.customerId):null;
  if(d.fulfillment==='delivery' && (!customer || !customer.addresses?.length)) return toast('Return delivery requires a customer profile with an address',false,'alerttriangle');
  const batchId=uid('visit_'), created=[];
  groups.forEach(({service,items})=>{
    const ticket=state.nextTicket++, dueDate=v8DraftDue(service), subtotal=v8ServiceSubtotal(items), surcharge=d.payNow&&d.paymentMethod==='card'?Math.round(subtotal*.03*100)/100:0;
    const pieceCount=v8PieceCount(items,service);
    const order={id:`HC-${ticket}`,ticket:String(ticket),barcode:v8MakeBarcode(ticket),channel:d.fulfillment==='delivery'?'delivery':'counter',fulfillment:d.fulfillment,customerId:d.customerId,customerName:d.customerId?null:(d.guestName.trim()||'Walk-in Guest'),address:d.fulfillment==='delivery'?customer.addresses[0].id:null,items:`${V8_SERVICE_NAMES[service]} · ${pieceCount}${service==='washfold'?' bag':' piece'+(pieceCount===1?'':'s')}`,services:[service],serviceType:service,total:subtotal,subtotal,surcharge,amountCharged:d.payNow?subtotal+surcharge:null,lineItems:items.map(it=>({...it})),itemsDetail:items.map(it=>({...it})),status:d.fulfillment==='delivery'?'in_cleaning':'dropped_off',stageIndex:d.fulfillment==='delivery'?2:0,rack:null,placedLabel:'Today',dateLabel:'Today',createdAt:v8NowISO(),dueDate,paid:false,paymentMethod:null,pointsAwarded:false,notes:d.notes,tags:d.tags.slice(),garmentPhotos:d.photos.slice(),deliveryPhotos:[],assignedDriverId:null,invoiced:false,intakeBatchId:batchId,pieceCount,tagNumber:null,tagNumbers:[],tagColor:null,tagColorHex:null,tagAssignedAt:null,register:state.session?.register||'Front Counter',createdBy:v6CurrentStaff()?.name||'Staff',activity:[]};
    if(d.payNow){order.paymentMethod=d.paymentMethod;finalizePayment(order);}
    v8AddActivity(order,'created',`${V8_SERVICE_NAMES[service]} ticket created · awaiting physical tag assignment`,{dueDate,barcode:order.barcode});
    state.orders.unshift(order);created.push(order);
    recordSync(`Ticket #${ticket} created · ${V8_SERVICE_NAMES[service]} · awaiting tag assignment · Due ${dueDate}`);
  });
  saveState();
  const visitTotal=created.reduce((s,o)=>s+o.total+(o.surcharge||0),0);
  counterDraft=v8FreshCounterDraft();posCustomerSearch='';state.posNav='orders';renderPosContent();
  openPosModal(`<h3>${icon('checkcircle',17)} ${created.length} Separate Tickets Created</h3><p class="pm-sub">One customer visit · ${money(visitTotal)} total${created.some(o=>o.surcharge)?' including 3% card convenience fee':''}</p>${created.map(o=>`<div class="v5-subticket"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong>#${o.ticket} · ${V8_SERVICE_NAMES[o.serviceType]}</strong><div class="row-sub">Due ${o.dueDate} · ${money(o.total+(o.surcharge||0))} · Barcode ${o.barcode}</div></div><span class="v8-tag-chip v12-awaiting-tag">Assign tag after intake</span></div></div>`).join('')}<button class="btn btn-primary btn-block" onclick="v8PrintCreatedBatch('${batchId}')">${icon('printer',16)} Print All on Star TSP100IV</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Done</button>`);
  toast(`${created.length} ticket${created.length===1?'':'s'} created with unique barcodes`,true,'checkcircle');
};

const v9BaseCompleteDropOff=posCompleteDropOff;
posCompleteDropOff=function v9CompleteDropOff(){
  v9CommitPendingCurrentService(false,false);
  return v9BaseCompleteDropOff();
};

v3FindOrderByScan = function v8FindOrderByScan(raw) {
  const clean=String(raw||'').trim().toUpperCase(); if(!clean)return null;
  const compact=clean.replace(/\s/g,'');
  let o=state.orders.find(x=>[x.id,x.ticket,x.barcode,x.tagNumber,...(x.tagNumbers||[])].filter(Boolean).some(v=>String(v).toUpperCase().replace(/\s/g,'')===compact));
  if(o)return o;
  const digits=clean.replace(/\D/g,'');
  if(!digits)return null;
  return state.orders.find(x=>String(x.ticket||'').replace(/\D/g,'')===digits || String(x.id||'').replace(/\D/g,'')===digits || String(x.barcode||'').replace(/\D/g,'')===digits) || null;
};
function v8OrderHasLocation(order){return !!(order.rack || order.conveyorNumber);}
function v8OrderLocation(order){return order.rack?`Rack ${order.rack}`:order.conveyorNumber?`Conveyor ${order.conveyorNumber}`:'Unassigned';}
function v8SetReady(order, sourceLabel) {
  const stages=getStages(order), readyIndex=stages.findIndex(s=>s.id==='ready'), firstReady=!order.readyAt;
  order.stageIndex=readyIndex>=0?readyIndex:order.stageIndex;order.status='ready';order.readyAt=order.readyAt||v8NowISO();
  v8AddActivity(order,'ready',`${sourceLabel} · marked ready`,{location:v8OrderLocation(order)});
  if(firstReady && order.customerId && order.fulfillment!=='delivery' && order.channel!=='delivery'){
    order.customerReadyUpdatedAt=v8NowISO();
    fireAutomatedText('orderReady',customerById(order.customerId),{order});
    return true;
  }
  return false;
}
function v8RackSetSearch(v){state.rackUi.search=v;renderPosContent();}
function v8RackSetDate(v){state.rackUi.createdDate=v;renderPosContent();}
function v8RackToggleAssigned(){state.rackUi.showAssigned=!state.rackUi.showAssigned;renderPosContent();}
function v8RackRows() {
  const q=String(state.rackUi.search||'').trim().toLowerCase(), date=state.rackUi.createdDate;
  let rows=state.orders.filter(o=>!['picked_up','delivered','voided'].includes(o.status));
  if(date)rows=rows.filter(o=>v8OrderCreatedDate(o)===date);
  if(q)rows=rows.filter(o=>`${o.id} ${o.ticket} ${o.barcode} ${o.tagNumber||''} ${(o.tagNumbers||[]).join(' ')} ${customerLabel(o)}`.toLowerCase().includes(q));
  else if(!state.rackUi.showAssigned)rows=rows.filter(o=>!v8OrderHasLocation(o));
  return rows.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
}

renderPosRack = function v8RenderPosRack(content) {
  v8EnsureData();
  const open=state.orders.filter(o=>!['picked_up','delivered','voided'].includes(o.status)), assigned=open.filter(v8OrderHasLocation), unassigned=open.filter(o=>!v8OrderHasLocation(o)), ready=open.filter(o=>o.status==='ready'), rows=v8RackRows();
  content.innerHTML=`<div class="v2-grid"><div class="v2-kpi"><small>Need Location</small><strong>${unassigned.length}</strong></div><div class="v2-kpi"><small>Assigned / Conveyor</small><strong>${assigned.length}</strong></div><div class="v2-kpi"><small>Ready</small><strong>${ready.length}</strong></div><div class="v2-kpi"><small>Search Results</small><strong>${rows.length}</strong></div></div>
    <div class="pos-card v8-scan-box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><h3 style="margin:0">${icon('box',17)} Scan to Conveyor · Mark Ready</h3>${conveyorScanState.scanned.length?`<button class="btn btn-ghost btn-sm" onclick="v3ClearConveyorBatch()">Clear Batch</button>`:''}</div><div class="v11-scanner-ready"><span></span>NADAMOO scanner input ready · CONVEYOR MODE</div><div class="v2-note" style="margin-bottom:10px">Scan the unique ticket barcode—or enter ticket/tag number. Pickup customers are notified when ready; return-delivery customers are not updated until proof-of-delivery is captured.</div><div style="display:flex;gap:10px"><input id="v3-conveyor-input" class="text-input v8-scan-input" style="flex:1" placeholder="Scan barcode, ticket or tag (example 3-821)" value="${esc(conveyorScanState.input)}" oninput="conveyorScanState.input=this.value" onkeydown="v3ConveyorInputKeydown(event)" autocomplete="off"><button class="btn btn-primary" onclick="v3SubmitConveyorScan()">${icon('checkcircle',15)} Mark Ready</button></div><div style="margin-top:12px">${v3ConveyorBatchGroupedHTML()}</div></div>
    <div class="pos-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><h3 style="margin:0">${icon('mappin',17)} Assign Rack / Location</h3><div class="v2-note">Assigned tickets disappear automatically. Search retrieves any ticket, including an already assigned one.</div></div><button class="btn btn-secondary btn-sm" onclick="v8RackToggleAssigned()">${state.rackUi.showAssigned?'Hide Assigned':'Show Assigned'}</button></div>
      <div class="v8-rack-toolbar"><div><span class="field-label">Look up ticket / barcode / tag / customer</span><input class="text-input" placeholder="Example: 3-821, HAT-004821, Raber" value="${esc(state.rackUi.search)}" oninput="v8RackSetSearch(this.value)"></div><div><span class="field-label">Ticket created date</span><input class="text-input" type="date" value="${esc(state.rackUi.createdDate)}" onchange="v8RackSetDate(this.value)"></div><button class="btn btn-ghost" onclick="state.rackUi.search='';state.rackUi.createdDate='';renderPosContent()">Clear Filters</button></div>
      <div class="v2-note" style="margin-bottom:10px">Default view: only tickets that still need a rack or conveyor location. Use Show Assigned or search a ticket/tag to recall an existing location.</div>
      ${rows.length?`<table class="pos-table"><thead><tr><th>Ticket / Tag</th><th>Customer</th><th>Created</th><th>Current Location / Recall</th><th>Assign Rack 1–2000</th></tr></thead><tbody>${rows.map(o=>`<tr><td><strong>#${o.ticket||o.id}</strong><div class="row-sub">${esc(o.barcode||'')} · ${v8TagBadgeHTML(o)}</div></td><td>${esc(customerLabel(o))}<div class="row-sub">${V8_SERVICE_NAMES[v8OrderService(o)]||''}</div></td><td>${v8OrderCreatedDate(o)||'—'}</td><td><strong>${esc(v8OrderLocation(o))}</strong><div class="row-sub">${o.status==='ready'?'Ready '+v8TimeLabel(o.readyAt):getStages(o)[o.stageIndex??0]?.title||o.status}</div>${v8OrderHasLocation(o)?`<button class="btn btn-ghost btn-sm v9-recall-btn" onclick="v9RecallRackLocation('${o.id}')">${icon('rotateccw',13)} Recall Location</button>`:''}</td><td><div class="v6-rack-entry"><input id="rack-input-${o.id}" class="text-input" inputmode="numeric" placeholder="Type 1–2000" value="${o.rack||''}" oninput="v6RackTyping('${o.id}',this.value)"><button class="btn btn-secondary btn-sm" onclick="v6AssignTypedRack('${o.id}')">Assign & Ready</button></div><div id="rack-warn-${o.id}">${v6RackCollisionHTML(o.rack||'',o.id)}</div></td></tr>`).join('')}</tbody></table>`:`<div class="table-empty">${state.rackUi.search||state.rackUi.createdDate?'No matching tickets.':'Everything is assigned.'}</div>`}
    </div>`;
  setTimeout(()=>document.getElementById('v3-conveyor-input')?.focus(),0);
};
function v8TagBadgeHTML(order){return order.tagNumber?`<span class="v8-tag-chip"><span class="v8-tag-dot" style="background:${order.tagColorHex||'#fff'}"></span>${esc((order.tagNumbers||[order.tagNumber]).join(' · '))} · ${esc(order.tagColor||'Tag')}</span>`:`<span class="v8-tag-chip v12-awaiting-tag">Awaiting tag assignment</span>`;}

v2AssignRack = function v8AssignRack(orderId,rack) {
  const o=state.orders.find(x=>x.id===orderId);if(!o||!rack)return;
  const old=v8OrderLocation(o);o.rack=String(rack);o.conveyorNumber=null;
  const notified=v8SetReady(o,`Assigned to Rack ${rack}`);
  recordSync(`Rack assigned · ${o.id} · ${old} → Rack ${rack} · ready${notified?' · customer notified':''}`);
  saveState();toast(`${o.id} → Rack ${rack} · Ready${notified?' · customer text/app updated':o.fulfillment==='delivery'?' · delivery customer held until proof photo':''}`,true,'box');renderPosContent();
};
function v9RecallRackLocation(orderId) {
  const order=state.orders.find(o=>o.id===orderId);if(!order)return;
  const priorLocation=v8OrderLocation(order);
  if(!v8OrderHasLocation(order))return toast('This ticket has no rack or conveyor location to recall',false,'alerttriangle');
  const reason=prompt(`Recall #${order.ticket||order.id} from ${priorLocation}?`,`Production correction / re-clean`);
  if(!reason)return;
  order.rackRecallHistory=order.rackRecallHistory||[];
  order.rackRecallHistory.unshift({at:v8NowISO(),location:priorLocation,reason,by:v6CurrentStaff()?.name||'System'});
  order.lastReadyAt=order.readyAt||order.lastReadyAt||null;
  order.rack=null;order.conveyorNumber=null;order.readyAt=null;order.rackRecalledAt=v8NowISO();order.rackRecallReason=reason;
  const stages=getStages(order),cleaningIndex=stages.findIndex(stage=>stage.id==='in_cleaning');
  order.stageIndex=cleaningIndex>=0?cleaningIndex:order.stageIndex;order.status='in_cleaning';
  if(order.driverRouteReady){order.driverRouteReady=false;order.deliveryScanStatus='recalled';order.deliveryRecalledAt=order.rackRecalledAt;}
  if(order.customerId)order.customerReadyRecalledAt=order.rackRecalledAt;
  v8AddActivity(order,'rack_recall',`Recalled from ${priorLocation} · ${reason}`,{priorLocation,reason});
  recordSync(`Rack/location recalled · ${order.id} · ${priorLocation} → In Cleaning · ${reason}`);
  saveState();toast(`#${order.ticket||order.id} recalled from ${priorLocation}; status returned to In Cleaning`,true,'refresh');renderPosContent();
}
v6AssignTypedRack = function v8AssignTypedRack(orderId) {
  const input=document.getElementById(`rack-input-${orderId}`);if(!input)return;
  const rack=input.value.replace(/\D/g,'');if(!rack||Number(rack)<1||Number(rack)>2000)return toast('Enter a rack number from 1–2000',false,'alerttriangle');
  const hits=v6RackOccupants(rack,orderId),warn=document.getElementById(`rack-warn-${orderId}`);if(hits.length){if(warn)warn.innerHTML=v6RackCollisionHTML(rack,orderId);return;}v2AssignRack(orderId,rack);
};
v3SubmitConveyorScan = function v8SubmitConveyorScan() {
  const raw=conveyorScanState.input,order=v3FindOrderByScan(raw);
  if(!order){toast(`No ticket or tag found for "${String(raw).trim()}"`,false,'alerttriangle');conveyorScanState.input='';renderPosContent();return;}
  if(['picked_up','delivered','voided'].includes(order.status)){toast(order.status==='voided'?'That ticket is voided':'That ticket is already completed',false,'alerttriangle');conveyorScanState.input='';renderPosContent();return;}
  if(!order.conveyorNumber)order.conveyorNumber=state.nextConveyorNumber++;order.rack=null;
  const firstBatch=!conveyorScanState.scanned.includes(order.id);if(firstBatch)conveyorScanState.scanned.push(order.id);
  const notified=v8SetReady(order,`Scanned to Conveyor ${order.conveyorNumber}`);
  recordSync(`Conveyor scan · ${order.id} · ${order.barcode} · Conveyor ${order.conveyorNumber}`);saveState();conveyorScanState.input='';
  toast(`#${order.ticket||order.id} → Conveyor ${order.conveyorNumber} · Ready${notified?' · customer notified':order.fulfillment==='delivery'?' · no customer update until delivery photo':''}`,true,'checkcircle');renderPosContent();setTimeout(()=>document.getElementById('v3-conveyor-input')?.focus(),0);
};

function v8DeliverySetInput(v){state.deliveryUi.input=v;}
function v8DeliveryInputKeydown(e){if(e.key==='Enter'){e.preventDefault();v8SubmitDeliveryScan();}}
function v8SubmitDeliveryScan(){
  const raw=state.deliveryUi.input,order=v3FindOrderByScan(raw);state.deliveryUi.input='';
  if(!order){toast(`No ticket or tag found for "${String(raw).trim()}"`,false,'alerttriangle');renderPosContent();return;}
  if(order.fulfillment!=='delivery'&&order.channel!=='delivery')return toast('That ticket is customer pickup—not delivery',false,'alerttriangle');
  if(['delivered','picked_up','voided'].includes(order.status))return toast(order.status==='voided'?'That ticket is voided':'That ticket is already completed',false,'alerttriangle');
  if(order.status!=='ready'&&!order.readyAt)return toast('Mark this ticket ready in Rack before scanning for delivery',false,'alerttriangle');
  if(!state.deliveryUi.scanned.includes(order.id))state.deliveryUi.scanned.push(order.id);
  order.deliveryScannedAt=v8NowISO();order.deliveryScanStatus='scanned';
  v8AddActivity(order,'delivery_scan','Scanned for delivery',{barcode:order.barcode});
  recordSync(`Scanned for delivery · ${order.id} · ${order.barcode} · ${v8TimeLabel(order.deliveryScannedAt)}`);saveState();toast(`#${order.ticket||order.id} scanned for delivery at ${v8TimeLabel(order.deliveryScannedAt)}`,true,'truck');renderPosContent();setTimeout(()=>document.getElementById('v8-delivery-scan')?.focus(),0);
}
function v8ClearDeliveryBatch(){state.deliveryUi.scanned=[];saveState();renderPosContent();}
function v8ScannedDeliveryOrders(){return state.deliveryUi.scanned.map(id=>state.orders.find(o=>o.id===id)).filter(order=>order&&order.status!=='voided');}
function v8DeliveryGroupsHTML(orders){
  if(!orders.length)return '<div class="helper-text">Nothing scanned yet. Scan each ticket barcode before printing the delivery route.</div>';
  const groups={};orders.forEach(o=>{const a=v8AddressForOrder(o),building=a?.building||a?.street||v6OrderBuilding(o);(groups[building]=groups[building]||[]).push({o,a});});
  return `<div class="v8-delivery-batch">${Object.keys(groups).sort().map(building=>`<div class="v8-delivery-building">${icon('mappin',13)} ${esc(building)} · ${groups[building].length} ticket${groups[building].length===1?'':'s'}</div>${groups[building].map(({o,a})=>`<div class="v8-delivery-address"><div><strong>${esc(customerLabel(o))} · #${o.ticket||o.id}</strong><small>${esc(v8AddressText(a))} · Tag ${esc(o.tagNumber||'—')}</small></div><div style="text-align:right"><strong>${v8TimeLabel(o.deliveryScannedAt)}</strong><small>${esc(o.barcode||'')}</small></div></div>`).join('')}`).join('')}</div>`;
}
function v8DeliveryManifestHTML(batch,orders){
  const driver=driverById(batch.driverId),groups={};orders.forEach(o=>{const a=v8AddressForOrder(o),building=a?.building||a?.street||v6OrderBuilding(o);(groups[building]=groups[building]||[]).push({o,a});});
  return `<div class="v8-print-ticket"><div class="rt-center"><strong>HATTAN CLEANERS</strong></div><div class="rt-center"><strong>DELIVERY MANIFEST ${esc(batch.id)}</strong></div><div class="rt-center">${v8TimeLabel(batch.createdAt)} · ${esc(driver?.name||'Unassigned Driver')}</div><div class="rt-hr"></div>${Object.keys(groups).sort().map(building=>`<div style="font-weight:900;border:2px solid #000;padding:4px;margin:8px 0 4px">${esc(building)}</div>${groups[building].map(({o,a},idx)=>`<div style="border-bottom:1px dashed #000;padding:5px 0"><strong>${idx+1}. ${esc(customerLabel(o))}</strong><br>${esc(v8AddressText(a))}<br>Phone: ${esc(customerById(o.customerId)?.phone||'—')}<br>Ticket #${esc(o.ticket||o.id)} · Tag ${esc(o.tagNumber||'—')}<br>${esc(o.items||'')}</div>`).join('')}`).join('')}<div class="rt-hr"></div><div class="rt-row rt-total"><span>TOTAL TICKETS</span><span>${orders.length}</span></div>${v8BarcodeHTML(batch.id)}</div>`;
}
function v8PrintDeliveryBatch(){
  const orders=v8ScannedDeliveryOrders();if(!orders.length)return toast('Scan at least one delivery ticket first',false,'alerttriangle');
  const driverId=state.deliveryUi.driverId||state.drivers?.[0]?.id;if(!driverId)return toast('Choose a driver',false,'alerttriangle');
  const batch={id:`DEL-${String(state.nextDeliveryBatch++).padStart(4,'0')}`,driverId,createdAt:v8NowISO(),orderIds:orders.map(o=>o.id),status:'on_driver_app'};
  orders.forEach(o=>{o.assignedDriverId=driverId;o.driverRouteReady=true;o.deliveryManifestedAt=batch.createdAt;o.deliveryBatchId=batch.id;o.deliveryScanStatus='manifested';v8AddActivity(o,'delivery_manifest',`Added to ${batch.id} and sent to driver app`,{driverId});});
  state.deliveryBatches.unshift(batch);state.deliveryUi.scanned=[];recordSync(`Delivery manifest printed · ${batch.id} · ${orders.length} tickets · ${driverById(driverId)?.name}`);saveState();
  document.getElementById('print-area').innerHTML=v8DeliveryManifestHTML(batch,orders);toast(`${batch.id} printed and sent to ${driverById(driverId)?.name}'s delivery app`,true,'printer');renderPosContent();setTimeout(()=>window.print(),80);
}

renderPosDelivery = function v8RenderPosDelivery(content){
  v8EnsureData();const orders=state.orders.filter(o=>(o.fulfillment==='delivery'||o.channel==='delivery')&&o.status!=='voided'),scanned=v8ScannedDeliveryOrders(),routeReady=orders.filter(o=>o.driverRouteReady&&!['delivered'].includes(o.status)),deliveredToday=orders.filter(o=>o.status==='delivered'&&String(o.deliveredAt||'').slice(0,10)===v8TodayISO());
  content.innerHTML=`<div class="stat-row"><div class="stat-tile"><div class="st-label">Scanned This Batch</div><div class="st-value">${scanned.length}</div></div><div class="stat-tile"><div class="st-label">On Driver Apps</div><div class="st-value">${routeReady.length}</div></div><div class="stat-tile"><div class="st-label">Delivered Today</div><div class="st-value">${deliveredToday.length}</div></div><div class="stat-tile"><div class="st-label">Active Drivers</div><div class="st-value">${state.drivers.length}</div></div></div>
    <div class="pos-card v8-scan-box"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><h3 style="margin:0">${icon('truck',17)} Scan for Delivery</h3><div class="v2-note">Scan every ticket. No customer status or text is sent at this stage.</div></div>${scanned.length?`<button class="btn btn-ghost btn-sm" onclick="v8ClearDeliveryBatch()">Clear Batch</button>`:''}</div><div class="v11-scanner-ready"><span></span>NADAMOO scanner input ready · DELIVERY MODE</div><div style="display:flex;gap:10px;margin-top:10px"><input id="v8-delivery-scan" class="text-input v8-scan-input" style="flex:1" placeholder="Scan unique barcode, ticket or tag" value="${esc(state.deliveryUi.input)}" oninput="v8DeliverySetInput(this.value)" onkeydown="v8DeliveryInputKeydown(event)" autocomplete="off"><button class="btn btn-primary" onclick="v8SubmitDeliveryScan()">${icon('plus',15)} Add</button></div>${v8DeliveryGroupsHTML(scanned)}${scanned.length?`<div class="v3-ticket-head" style="margin-top:12px"><div><span class="field-label">Send route to driver</span><select class="text-input" onchange="state.deliveryUi.driverId=this.value">${state.drivers.map(d=>`<option value="${d.id}" ${state.deliveryUi.driverId===d.id?'selected':''}>${esc(d.name)} · ${esc(d.vehicle)}</option>`).join('')}</select></div><div style="display:flex;align-items:end"><button class="btn btn-primary btn-block" onclick="v8PrintDeliveryBatch()">${icon('printer',15)} Print Delivery & Update App</button></div></div>`:''}</div>
    <div class="pos-card"><h3>${icon('navigation',17)} Active Delivery Routes</h3>${state.drivers.map(d=>{const stops=routeReady.filter(o=>o.assignedDriverId===d.id);return `<div style="border-bottom:1px solid var(--hairline);padding:10px 0"><div style="display:flex;justify-content:space-between"><strong>${esc(d.name)} · ${esc(d.vehicle)}</strong><span class="v2-badge">${stops.length} stops</span></div>${stops.length?stops.map(o=>`<div class="list-row" onclick="posOpenOrderDetail('${o.id}')"><div class="row-icon">${icon('truck',16)}</div><div class="row-body"><div class="row-title">${esc(customerLabel(o))} · #${o.ticket||o.id}</div><div class="row-sub">${esc(v8AddressText(v8AddressForOrder(o)))} · Scanned ${v8TimeLabel(o.deliveryScannedAt)}</div></div><button class="btn btn-ghost btn-sm" style="color:var(--status-critical)" onclick="event.stopPropagation();posRecallDelivery('${o.id}')">Recall</button></div>`).join(''):'<div class="helper-text">No active stops.</div>'}</div>`}).join('')}</div>
    <div class="pos-card"><h3>Recent Delivery Manifests</h3>${(state.deliveryBatches||[]).slice(0,8).map(b=>`<div class="list-row"><div class="row-icon">${icon('receipt',16)}</div><div class="row-body"><div class="row-title">${esc(b.id)} · ${b.orderIds.length} tickets</div><div class="row-sub">${v8TimeLabel(b.createdAt)} · ${esc(driverById(b.driverId)?.name||'Unassigned')}</div></div><span class="v2-badge">${b.status==='on_driver_app'?'On driver app':esc(b.status)}</span></div>`).join('')||'<div class="helper-text">No manifests yet.</div>'}</div>`;
  setTimeout(()=>document.getElementById('v8-delivery-scan')?.focus(),0);
};

posRecallDelivery = function v8RecallDelivery(orderId){
  const o=state.orders.find(x=>x.id===orderId);if(!o)return;
  o.driverRouteReady=false;o.deliveryRecalledAt=v8NowISO();o.deliveryScanStatus='recalled';
  v8AddActivity(o,'delivery_recall','Recalled from delivery route',{batchId:o.deliveryBatchId||''});
  recordSync(`Delivery recalled · ${o.id} · ${v8TimeLabel(o.deliveryRecalledAt)} · prior batch ${o.deliveryBatchId||'—'}`);saveState();toast(`#${o.ticket||o.id} recalled; audit history retained`,true,'alerttriangle');renderPosContent();
};

renderDriverRoute = function v8RenderDriverRoute(content){
  const d=driverById(state.driverSession.driverId);if(!d)return;
  const my=state.orders.filter(o=>(o.fulfillment==='delivery'||o.channel==='delivery')&&o.assignedDriverId===d.id),pickups=my.filter(o=>o.status==='scheduled'&&!o.driverRouteReady),dropoffs=my.filter(o=>o.driverRouteReady&&o.status!=='delivered'),done=my.filter(o=>o.status==='delivered');
  content.innerHTML=`<div class="stat-row"><div class="stat-tile"><div class="st-label">Pickups</div><div class="st-value">${pickups.length}</div></div><div class="stat-tile"><div class="st-label">Deliveries</div><div class="st-value">${dropoffs.length}</div></div><div class="stat-tile"><div class="st-label">Completed</div><div class="st-value">${done.length}</div></div></div>${pickups.length?`<div class="pos-card"><h3>${icon('mappin',16)} Pickups</h3>${pickups.map(driverStopCardHTML).join('')}</div>`:''}${dropoffs.length?`<div class="pos-card"><h3>${icon('navigation',16)} Delivery Route</h3><div class="v8-secure-note">A delivery becomes visible to the customer only after you capture proof and confirm delivery.</div>${dropoffs.map(driverStopCardHTML).join('')}</div>`:''}${done.length?`<div class="pos-card"><h3>${icon('checkcircle',16)} Completed</h3>${done.map(driverStopCardHTML).join('')}</div>`:''}${!my.length?'<div class="pos-card"><div class="table-empty">No stops assigned.</div></div>':''}`;
};

driverOpenStop = function v8DriverOpenStop(orderId){
  const o=state.orders.find(x=>x.id===orderId);if(!o)return;const c=o.customerId?customerById(o.customerId):null,a=v8AddressForOrder(o),isPickup=o.status==='scheduled'&&!o.driverRouteReady,isDelivery=o.driverRouteReady&&o.status!=='delivered',key=isPickup?'garmentPhotos':'deliveryPhotos',photos=o[key]||[];
  openDriverModal(`<h3>${esc(customerLabel(o))}</h3><p class="pm-sub">#${o.ticket||o.id} · ${esc(v8AddressText(a))}</p><div class="pos-card" style="padding:14px;margin-bottom:14px"><div class="price-line"><span>${esc(o.items)}</span><span>${money(o.total+(o.surcharge||0))}</span></div>${c?`<div class="price-line"><span>Phone</span><span>${esc(c.phone)}</span></div>`:''}<div class="price-line"><span>Barcode</span><span>${esc(o.barcode||'—')}</span></div></div><span class="field-label">${isPickup?'Pickup photo':'Proof-of-delivery photo'} (${photos.length})</span><div class="photo-grid" style="margin-bottom:16px">${photos.map(p=>photoThumbHTML(p,null)).join('')}<label class="photo-add-btn">${icon('camera',20)}<span>Take Photo</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="driverCapturePhoto(event,'${o.id}','${isPickup?'garment':'delivery'}')"></label></div>${isPickup?`<button class="btn btn-primary btn-block" onclick="driverMarkPickedUp('${o.id}')">Confirm Pickup</button>`:''}${isDelivery?`${!photos.length?`<div class="warn-banner v8-proof-required">${icon('camera',15)}<span>Take a delivery photo before notifying the customer.</span></div>`:''}<button class="btn btn-primary btn-block" ${photos.length?'':'disabled'} onclick="driverMarkDelivered('${o.id}')">${icon('checkcircle',16)} Confirm Delivery & Notify Customer</button>`:''}<button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closeDriverModal()">Close</button>`);
};

driverMarkDelivered = function v8DriverMarkDelivered(orderId){
  const o=state.orders.find(x=>x.id===orderId);if(!o)return;
  if(!(o.deliveryPhotos||[]).length)return toast('Take a proof-of-delivery photo first',false,'camera');
  const idx=DELIVERY_STAGES.findIndex(s=>s.id==='delivered');o.stageIndex=idx;o.status='delivered';o.driverRouteReady=false;o.deliveredAt=v8NowISO();o.customerDeliveryUpdatedAt=o.deliveredAt;
  v8AddActivity(o,'delivered','Delivered with photo proof',{photoCount:o.deliveryPhotos.length});recordSync(`Delivered with proof · ${o.id} · ${v8TimeLabel(o.deliveredAt)} · customer notified`);
  if(o.customerId){const c=customerById(o.customerId);fireAutomatedText('orderDelivered',c,{order:o});fireAutomatedText('reviewRequest',c,{order:o});}
  saveState();toast(`${o.id} delivered — photo and exact time published to customer`,true,'checkcircle');closeDriverModal();renderDriverContent();
};

function v8LinePrintDescription(it){
  const g=garmentById(it.garmentId),parts=[];
  if(!g)return {name:'Service item',detail:''};
  if(it.colorId&&!['print'].includes(it.colorId))parts.push(colorById(it.colorId).name);
  if(it.materialId&&!['standard','cotton'].includes(it.materialId))parts.push(materialById(it.materialId).name);
  if(it.garmentNote)parts.push(it.garmentNote);
  return {name:`${g.name} × ${it.qty}`,detail:parts.join(' · ')};
}
function v11TicketNumber(raw){
  const digits=String(raw||'').replace(/\D/g,'');
  if(!digits)return String(raw||'NO-TICKET').toUpperCase();
  const six=digits.padStart(6,'0').slice(-6);
  return `${six.slice(0,3)}-${six.slice(3)}`;
}
function v11ReceiptCustomerName(order,customer){
  const raw=String(customer?.name||order.customerName||customerLabel(order)||'WALK-IN GUEST').trim();
  if(raw.includes(','))return raw.toUpperCase();
  const words=raw.split(/\s+/).filter(Boolean);
  return words.length>1?`${words.pop()}, ${words.join(' ')}`.toUpperCase():raw.toUpperCase();
}
function v11ReceiptDateTime(value){
  const d=new Date(value||Date.now());
  if(Number.isNaN(d.getTime()))return String(value||'');
  const date=d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
  const time=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  return `${date} ${time}`;
}
function v11ReadyDate(order){
  const raw=order.dueDate;
  if(!raw)return 'DATE NOT SET';
  const d=new Date(`${raw}T12:00:00`);
  if(Number.isNaN(d.getTime()))return String(raw).toUpperCase();
  const weekday=d.toLocaleDateString('en-US',{weekday:'short'});
  const date=d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
  return `${weekday}. ${date}`;
}
function v11ReceiptItemHTML(it,service){
  const g=garmentById(it.garmentId),qty=Number(it.qty)||1,d=v8LinePrintDescription(it);
  const qtyText=service==='washfold'?`${qty} LB`:Number.isInteger(qty)?String(qty):String(qty);
  const itemName=String(g?.name||d.name||'SERVICE ITEM').replace(/\s*[×x]\s*[\d.]+$/i,'').toUpperCase();
  const lineTotal=(Number(it.unitPrice)||0)*qty;
  return `<div class="v11-item-line"><div class="rt-row"><strong>${esc(qtyText)} - ${esc(itemName)}</strong><strong>${money(lineTotal)}</strong></div>${d.detail?`<div class="v11-item-detail">${esc(d.detail.toUpperCase())}</div>`:''}</div>`;
}
receiptTicketHTML = function v8ReceiptTicketHTML(o){
  const c=o.customerId?customerById(o.customerId):null,a=v8AddressForOrder(o),serviceId=v8OrderService(o),service=V8_SERVICE_NAMES[serviceId]||'Cleaning';
  const subtotal=Number(o.subtotal??o.total??0),fee=Number(o.surcharge||0),tax=Number(o.tax||0),grand=subtotal+fee+tax;
  const prepaid=Math.min(grand,Math.max(0,Number(o.amountCharged??(o.paid?grand:0))||0)),balance=Math.max(0,grand-prepaid),isPaid=balance<0.005;
  const isDelivery=o.fulfillment==='delivery'||o.channel==='delivery',apt=String(a?.apartment||'').replace(/^#\s*/,'').trim(),topUnit=isDelivery?(apt||'DELIVERY'):'';
  const ticket=v11TicketNumber(o.ticket||o.id),createdEvent=(o.activity||[]).find(e=>e.type==='created'),staff=createdEvent?.by||v6CurrentStaff()?.name||'Staff',register=state.session?.register||'R1';
  const lines=(o.lineItems||[]).map(it=>v11ReceiptItemHTML(it,serviceId)).join('')||`<div class="v11-item-line"><div class="rt-row"><strong>${esc(String(o.items||service).toUpperCase())}</strong><strong>${money(subtotal)}</strong></div></div>`;
  const action=`** ${isPaid?'PAID':'BALANCE DUE'} / ${isDelivery?'DELIVER':'PICKUP'} **`;
  return `<section class="v8-print-ticket v11-photo-ticket">${topUnit?`<div class="v11-unit">${esc(topUnit.toUpperCase())}</div>`:''}<div class="v11-store-name">Hattan Cleaners</div><div class="v11-store-line">141 3RD AVENUE</div><div class="v11-store-line">BET. 14TH &amp; 15TH</div><div class="v11-store-line">212 477 1740</div><div class="v11-ticket-number">${esc(ticket)}</div><div class="v11-customer-name">${esc(v11ReceiptCustomerName(o,c))}</div>${isDelivery&&a?`<div class="v11-address">${esc(String(a.street||a.line1||'').toUpperCase())}</div>${apt?`<div class="v11-address">#${esc(apt.toUpperCase())}</div>`:''}`:''}<div class="v11-meta">${esc(c?.customerNumber||'WALK-IN')} (${esc(o.register||register)}) ${esc(o.createdBy||staff)} <span>${esc(v11ReceiptDateTime(o.createdAt))}</span></div><div class="rt-hr"></div><div class="v11-service-row"><strong>${esc(service.toUpperCase())}</strong></div>${lines}${o.notes?`<div class="v11-notes"><strong>NOTES:</strong> ${esc(String(o.notes).toUpperCase())}</div>`:''}<div class="rt-hr"></div><div class="v11-totals"><div class="v11-piece-count">${serviceId==='washfold'?`${esc(String((o.lineItems||[])[0]?.qty||o.pieceCount||1))} lb`:`${esc(String(o.pieceCount||1))} pc`}</div><div><div class="rt-row"><span>Sub.T</span><strong>${money(subtotal)}</strong></div><div class="rt-row"><span>Tax</span><strong>${money(tax)}</strong></div>${fee?`<div class="rt-row"><span>Card Fee 3%</span><strong>${money(fee)}</strong></div>`:''}<div class="rt-row rt-total"><span>G.Total</span><strong>${money(grand)}</strong></div><div class="rt-row"><span>PrePay</span><strong>${money(prepaid)}</strong></div><div class="rt-row rt-total"><span>Balance</span><strong>${money(balance)}</strong></div></div></div><div class="v11-hours">MON-FRI 8:00 AM - 6:00 PM<br>SATURDAY 9:00 AM - 4:00 PM</div><div class="v11-action">${esc(action)}</div>${isDelivery?'<div class="v11-pickup-warning">** THIS TICKET IS NOT VALID FOR PICK UP **</div>':''}<div class="v11-ready-line"><span>Ready</span><strong>${esc(v11ReadyDate(o))}</strong><span>After ${esc(o.dueTime||'04:00 PM')}</span></div><div class="v11-bottom-ticket">${esc(ticket)}</div>${v8BarcodeHTML(o.barcode||v8MakeBarcode(o.ticket||o.id))}</section>`;
};
function v8PrintOrders(orders,label){
  if(!orders.length)return;
  document.getElementById('print-area').innerHTML=orders.map(receiptTicketHTML).join('');
  orders.forEach(o=>{v8AddActivity(o,'print',`${label||'Ticket'} printed`,{printer:'Star TSP100IV / browser print'});recordSync(`Ticket printed · #${o.ticket||o.id} · ${o.barcode}`);});
  saveState();closePosModal();toast(`Sending ${orders.length} ticket${orders.length===1?'':'s'} to Star TSP100IV print dialog…`,true,'printer');setTimeout(()=>window.print(),80);
}
function v8PrintCreatedBatch(batchId){v8PrintOrders(state.orders.filter(o=>o.intakeBatchId===batchId).sort((a,b)=>Number(a.ticket)-Number(b.ticket)),'Intake ticket');}
posDoPrint = function v8DoPrint(orderId){const o=state.orders.find(x=>x.id===orderId);if(o)v8PrintOrders([o],'Ticket');};
v5PrintMasterOrder = function v8PrintMasterOrder(orderId){const o=state.orders.find(x=>x.id===orderId);if(!o)return;const batch=o.intakeBatchId?state.orders.filter(x=>x.intakeBatchId===o.intakeBatchId):[o];v8PrintOrders(batch.sort((a,b)=>Number(a.ticket)-Number(b.ticket)),'Service ticket');};
posPrintReceipt = function v8PrintReceipt(orderId){
  const o=state.orders.find(x=>x.id===orderId);if(!o)return;
  openPosModal(`<h3>${icon('printer',17)} Print Star TSP100IV Ticket</h3><p class="pm-sub">80mm thermal roll · black ink · long Code 128 barcode</p><div class="receipt-preview">${receiptTicketHTML(o)}</div><button class="btn btn-primary btn-block" style="margin-top:16px" onclick="posDoPrint('${o.id}')">${icon('printer',16)} Print Ticket</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="posOpenOrderDetail('${o.id}')">Back</button>`);
};

function v8HistoryLineItems(order){
  const items=order.lineItems||order.itemsDetail||[];
  if(!items.length)return `<div class="row-sub" style="margin-top:6px">${esc(order.items||'No detailed garment lines recorded on this older ticket.')}</div>`;
  return `<div style="margin-top:7px">${items.map(it=>{const d=v8LinePrintDescription(it);return `<div style="font-size:11px;padding:4px 0;border-top:1px dotted var(--hairline)"><strong>${esc(d.name)}</strong>${d.detail?`<br><span style="color:var(--ink-secondary)">${esc(d.detail)}</span>`:''}<span style="float:right">${money((it.unitPrice||0)*(it.qty||0))}</span></div>`}).join('')}</div>`;
}
function v8ActivityHTML(order){
  const rows=(order.activity||[]).slice(0,8);if(!rows.length)return '';
  return `<div class="v8-activity"><div class="field-label">Ticket activity</div>${rows.map(e=>`<div class="v8-activity-row"><time>${v8TimeLabel(e.at)}</time><span>${esc(e.label)}${e.by?` · ${esc(e.by)}`:''}</span></div>`).join('')}</div>`;
}
function v8TicketCard(order){
  const due=Number(order.total||0)-Number(order.discount||0)+Number(order.surcharge||0),complete=['picked_up','delivered'].includes(order.status);
  return `<div class="v7-ticket-card"><div class="top"><div style="min-width:0"><strong>#${esc(order.ticket||order.id)} · ${esc(V8_SERVICE_NAMES[v8OrderService(order)]||'Service')}</strong><div class="v7-ticket-meta">${esc(order.items||'')}<br>Status: ${esc(order.status||'—')} · ${esc(v8OrderLocation(order))} · Due ${esc(order.dueDate||'—')}<br>Barcode ${esc(order.barcode||'—')} · ${v8TagBadgeHTML(order)}</div></div><div>${order.paid?'<span class="v7-balance good">Paid</span>':`<span class="v7-balance bad">${money(due)} due</span>`}</div></div>${v8HistoryLineItems(order)}${order.deliveryScannedAt?`<div class="warn-banner" style="margin-top:8px">${icon('truck',14)}<span>Scanned for delivery ${v8TimeLabel(order.deliveryScannedAt)}${order.deliveryRecalledAt?` · Recalled ${v8TimeLabel(order.deliveryRecalledAt)}`:''}${order.deliveredAt?` · Delivered with photo ${v8TimeLabel(order.deliveredAt)}`:''}</span></div>`:''}${v8ActivityHTML(order)}<div class="v7-actions">${!complete?`<button class="btn btn-secondary btn-sm" onclick="v7EditOpenTicket('${order.id}')">Edit Ticket</button>`:''}${order.fulfillment!=='delivery'&&!complete?`<button class="btn btn-primary btn-sm" onclick="v7PickUpOrder('${order.id}')">Pick Up</button>`:''}${!order.paid?`<button class="btn btn-gold btn-sm" onclick="v7RecordPayment('${order.id}')">Mark Paid</button>`:''}<button class="btn btn-ghost btn-sm" onclick="posPrintReceipt('${order.id}')">Print</button></div></div>`;
}

v7PickUpOrder = function v8PickUpOrder(orderId){const o=state.orders.find(x=>x.id===orderId);if(!o)return;const stages=getStages(o),idx=stages.findIndex(s=>s.id==='picked_up');if(idx>=0){o.stageIndex=idx;o.status='picked_up';}o.rack='';o.conveyorNumber=null;o.pickedUpAt=v8NowISO();v8AddActivity(o,'pickup','Customer picked up ticket');recordSync(`Customer pickup · ${o.id} · ${v8TimeLabel(o.pickedUpAt)}`);saveState();toast('Order marked picked up; location cleared',true,'checkcircle');renderV7CustomerProfile();};
const v8BaseEditOpenTicket=v7EditOpenTicket;
v7EditOpenTicket=function v8EditOpenTicket(orderId){const o=state.orders.find(x=>x.id===orderId),before=o?.total;v8BaseEditOpenTicket(orderId);if(o&&o.total!==before){v8AddActivity(o,'edit',`Ticket total edited from ${money(before)} to ${money(o.total)}`);saveState();}};
v7RecordPayment=function v8RecordPayment(orderId){const o=state.orders.find(x=>x.id===orderId);if(!o)return;o.paid=true;o.paymentMethod=o.paymentMethod||'manual payment';o.paidAt=v8NowISO();v8AddActivity(o,'payment',`Payment recorded · ${money((o.total||0)+(o.surcharge||0))}`);recordSync(`Balance marked paid · ${o.id}`);saveState();renderV7CustomerProfile();};

renderV7CustomerProfile = function v8RenderCustomerProfile(){
  const content=document.getElementById('pos-content');if(!content)return;const c=customerById(state.v7CustomerId);if(!c){renderPosCustomers(content);return;}
  const rank=v7AnnualRank(c),open=v7OpenTickets(c.id),previous=v7PreviousTickets(c.id),delivered=v7DeliveredTickets(c.id),balance=v7Outstanding(c.id),memo=(state.customerMemos||{})[c.id]||'',tab=state.v7CustomerTab||'overview';
  const cards=arr=>arr.length?arr.map(v8TicketCard).join(''):'<div class="helper-text">No tickets in this section.</div>';
  content.innerHTML=`<div class="v7-profile-head"><div class="v7-profile-main"><div class="v6-section-title"><div><h2 style="margin:0">${esc(c.name)} <span class="v9-customer-number">${esc(c.customerNumber||'—')}</span></h2><div class="row-sub">${esc(c.phone)}${c.email?' · '+esc(c.email):''}</div>${c.addresses?.length?`<div class="row-sub" style="margin-top:3px">${c.addresses.map(a=>esc(v8AddressText(a))).join('<br>')}</div>`:''}</div><button class="btn btn-ghost btn-sm" onclick="v7CloseCustomerProfile()">Back to Customers</button></div><div class="v4-due-kpis"><div><small>Open Tickets</small><strong>${open.length}</strong></div><div><small>Outstanding</small><strong>${money(balance)}</strong></div><div><small>Store Credit</small><strong>${money(c.storeCredit||0)}</strong></div></div><div class="v7-actions"><button class="btn btn-secondary btn-sm" onclick="v7AddStoreCredit('${c.id}')">Add Store Credit</button><button class="btn btn-secondary btn-sm" onclick="v8OpenAddCard('${c.id}')">${icon('creditcard',14)} Add Card Securely</button>${balance>0?`<button class="btn btn-gold btn-sm" onclick="posOpenStatement('${c.id}')">View A/R</button>`:''}</div></div><div class="v7-rank"><small>Year Spend Rank</small><strong>#${rank.rank||'—'}</strong><div>${money(rank.spend)} spent · ${rank.total} customers</div></div></div>
    <div class="v7-customer-tabs">${['overview','open','previous','delivered','payments','notes'].map(t=>`<div class="v7-customer-tab ${tab===t?'active':''}" onclick="v7SetCustomerTab('${t}')">${({overview:'Overview',open:'Open Tickets',previous:'Previous Tickets',delivered:'Delivered',payments:'Payments & A/R',notes:'Notes'})[t]}</div>`).join('')}</div>
    ${tab==='overview'?`<div class="pos-card"><h3>Open Tickets</h3>${cards(open)}</div><div class="pos-card"><h3>Recent History</h3>${cards(previous.slice(0,5))}</div><div class="pos-card"><h3>Customer Memo</h3><div class="v7-note-box">${memo?esc(memo):'<span class="muted">No memo yet.</span>'}</div><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="v7AddMemo('${c.id}')">Edit Memo</button></div>`:tab==='open'?`<div class="pos-card"><h3>Open Tickets</h3>${cards(open)}</div>`:tab==='previous'?`<div class="pos-card"><h3>Previous Tickets</h3>${cards(previous)}</div>`:tab==='delivered'?`<div class="pos-card"><h3>Delivered Tickets</h3>${cards(delivered)}</div>`:tab==='payments'?`<div class="pos-card"><h3>Payments & A/R</h3><div class="price-line"><span>Outstanding balance</span><strong>${money(balance)}</strong></div><div class="price-line"><span>Store credit</span><strong>${money(c.storeCredit||0)}</strong></div><div class="price-line"><span>Cards on file</span><span>${(c.paymentMethods||[]).map(p=>`${esc(p.brand)} •••• ${esc(p.last4)}`).join(', ')||'None'}</span></div><div class="v8-secure-note">Full card numbers and expiration dates are not stored or displayed. Production charges use processor tokens.</div><button class="btn btn-secondary btn-sm" onclick="v8OpenAddCard('${c.id}')">Add Card Securely</button>${cards(state.orders.filter(o=>o.customerId===c.id))}</div>`:`<div class="pos-card"><h3>Customer Notes</h3><div class="v7-note-box">${memo?esc(memo):'<span class="muted">No memo yet.</span>'}</div><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="v7AddMemo('${c.id}')">Edit Memo</button></div>`}`;
};

function v11HardwareTestTicketHTML(){
  return `<section class="v8-print-ticket v11-photo-ticket v11-test-ticket"><div class="v11-unit">TEST</div><div class="v11-store-name">Hattan Cleaners</div><div class="v11-store-line">STAR TSP100IV · 80MM · 203 DPI</div><div class="v11-ticket-number">000-001</div><div class="v11-customer-name">PRINTER / SCANNER TEST</div><div class="rt-hr"></div><div class="v11-item-line"><div class="rt-row"><strong>1 - ALIGNMENT TEST</strong><strong>$0.00</strong></div><div class="v11-item-detail">BLACK INK · SCALE 100% · NO BROWSER HEADERS</div></div><div class="v11-test-rule"></div><div class="v11-action">** PRINT HARDWARE TEST **</div><div class="v11-pickup-warning">SCAN THE BARCODE IN SETTINGS</div><div class="v11-bottom-ticket">000-001</div>${v8BarcodeHTML('HAT-004821')}<div class="rt-center v11-test-foot">Expected scanner value: HAT-004821<br>The white hanger design requires preprinted ticket stock.</div></section>`;
}
function v11PrintHardwareTest(){
  const area=document.getElementById('print-area');if(!area)return;
  area.innerHTML=v11HardwareTestTicketHTML();
  recordSync('Star TSP100IV hardware test ticket opened');
  toast('Opening the Star TSP100IV 80mm print dialog…',true,'printer');
  setTimeout(()=>window.print(),80);
}
function v11ScannerTestKeydown(event){
  if(event.key!=='Enter')return;
  event.preventDefault();
  const value=String(event.currentTarget.value||'').trim(),result=document.getElementById('v11-scanner-test-result');
  if(result)result.innerHTML=value?`<strong>Scanner passed.</strong> Received <code>${esc(value)}</code> plus Enter.`:'No barcode text was received. Check the USB connection and Enter suffix.';
  result?.classList.toggle('passed',!!value);
  if(value)toast(`Scanner test passed · ${value}`,true,'checkcircle');
  event.currentTarget.select();
}
const v11BaseRenderPosSettings=renderPosSettings;
renderPosSettings=function v11RenderPosSettings(content){
  v11BaseRenderPosSettings(content);
  content.insertAdjacentHTML('afterbegin',`<div class="pos-card v11-hardware-card"><div class="v11-hardware-head"><div><h3>${icon('printer',17)} Counter Hardware Profile</h3><div class="v2-note">Configured around the equipment and ticket sample provided for this counter.</div></div><span class="v2-badge">V12 WORKFLOW READY</span></div><div class="v11-hardware-grid"><div><small>PRINTER</small><strong>Star TSP100IV / TSP143IV-UEWB</strong><span>80mm thermal · 203 dpi · Ethernet/Wi-Fi capable</span></div><div><small>SCANNER</small><strong>NADAMOO USB 1D</strong><span>Keyboard mode · barcode text + Enter</span></div><div><small>BARCODE</small><strong>Code 128-B</strong><span>Long, compact barcode at ticket bottom</span></div><div><small>TICKET STOCK</small><strong>80mm preprinted roll</strong><span>White hanger art comes from the paper, not thermal ink</span></div></div><div class="v11-hardware-actions"><button class="btn btn-primary" onclick="v11PrintHardwareTest()">${icon('printer',15)} Print Hardware Test Ticket</button><div class="v11-scanner-test"><input class="text-input" autocomplete="off" placeholder="Click here, then scan the test barcode" onkeydown="v11ScannerTestKeydown(event)"><div id="v11-scanner-test-result">Waiting for a scan ending in Enter.</div></div></div><div class="v11-print-instructions"><strong>First print setup:</strong> choose the Star TSP100IV in the browser print window, paper size 80mm receipt, scale 100%, margins None, headers/footers Off. Browser testing uses this print window; fully silent Wi-Fi printing later requires Star WebPRNT/CloudPRNT or a small local print bridge.</div></div>`);
};

let v11ScannerBuffer='',v11ScannerLastKey=0;
function v11GlobalScannerKeydown(event){
  if(!state.session?.loggedIn||!['rack','delivery'].includes(state.posNav))return;
  if(document.getElementById('pos-modal-overlay')?.classList.contains('show'))return;
  const target=event.target,tag=String(target?.tagName||'').toUpperCase();
  if(['INPUT','TEXTAREA','SELECT'].includes(tag)||target?.isContentEditable)return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const now=performance.now();
  if(event.key==='Enter'){
    const value=v11ScannerBuffer.trim();v11ScannerBuffer='';
    if(value.length<3||now-v11ScannerLastKey>600)return;
    event.preventDefault();
    if(state.posNav==='rack'){conveyorScanState.input=value;v3SubmitConveyorScan();}
    else{state.deliveryUi.input=value;v8SubmitDeliveryScan();}
    return;
  }
  if(event.key.length===1){
    if(now-v11ScannerLastKey>250)v11ScannerBuffer='';
    v11ScannerBuffer+=event.key;v11ScannerLastKey=now;
  }
}
document.addEventListener('keydown',v11GlobalScannerKeydown,true);

/* Make the upgraded version visible and migrate seed/saved records before first render. */
const v8BasePosShellHTML=posShellHTML;
posShellHTML=function v11PosShellHTML(){return v8BasePosShellHTML().replace('<small>Staff POS</small>','<small>Staff POS · V11 Hardware</small>');};
v8EnsureData();
saveState();
if(typeof renderPosContent==='function')renderPosContent();

/* ============================================================================
   HATTAN OPS V12 — POST-INTAKE TAGS, TICKET LEDGER & INDEPENDENT PUNCH CLOCK
   ============================================================================ */

const V12_TAG_COLORS = [
  { name:'White', hex:'#ffffff' }, { name:'Yellow', hex:'#f5d76e' },
  { name:'Pink', hex:'#f2a7bc' }, { name:'Blue', hex:'#9cc9ee' },
  { name:'Green', hex:'#9ed7ae' }, { name:'Orange', hex:'#f3b26f' },
  { name:'Red', hex:'#e88383' }, { name:'Purple', hex:'#c5a8e4' },
  { name:'Black', hex:'#222222' }
];

function v12EnsureData(){
  state.tagUi = state.tagUi || { filter:'needs', search:'', createdDate:'' };
  state.ledgerUi = state.ledgerUi || { filter:'all', search:'', from:'', to:'' };
  state.hardwareProfile = state.hardwareProfile || {};
  state.hardwareProfile.printer = 'Star Micronics TSP100IV / TSP143IV-UEWB';
  state.clockLog = state.clockLog || [];
  state.clockLog.forEach((entry,index)=>{
    entry.id = entry.id || `punch_${index}_${String(entry.staffName||'staff').replace(/\W/g,'').toLowerCase()}`;
    entry.staffId = entry.staffId || state.staff.find(staff=>staff.name===entry.staffName)?.id || null;
    entry.clockInAt = entry.clockInAt || null;
    entry.clockOutAt = entry.clockOutAt || null;
  });
  state.orders.forEach(order=>{
    order.tagNumbers = Array.isArray(order.tagNumbers) ? order.tagNumbers.filter(Boolean).map(String) : (order.tagNumber ? [String(order.tagNumber)] : []);
    order.tagNumber = order.tagNumbers[0] || null;
    if(order.status==='quality_check')order.status='in_cleaning';
    if(order.status!=='voided'){
      const stages=getStages(order),index=stages.findIndex(stage=>stage.id===order.status);
      if(index>=0)order.stageIndex=index;
    }
  });
}

try{
  const v12Stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  if(v12Stored.tagUi)state.tagUi=v12Stored.tagUi;
  if(v12Stored.ledgerUi)state.ledgerUi=v12Stored.ledgerUi;
}catch(error){ /* Optional V12 interface state can safely reset. */ }

const v12BaseSaveState=saveState;
saveState=function v12SaveState(){
  v12BaseSaveState();
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    raw.tagUi=state.tagUi||{};
    raw.ledgerUi=state.ledgerUi||{};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(raw));
  }catch(error){ /* Browser storage unavailable. */ }
};

function v12IsClosed(order){return ['picked_up','delivered'].includes(order.status);}
function v12IsOpen(order){return !v12IsClosed(order)&&order.status!=='voided';}
function v12OrderBalance(order){return order.paid?0:Math.max(0,Number(order.total||0)-Number(order.discount||0)+Number(order.surcharge||0));}
function v12DateTime(value){
  if(!value)return '—';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return esc(String(value));
  return date.toLocaleString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit',hour:'numeric',minute:'2-digit'});
}
function v12StatusLabel(order){
  if(order.status==='voided')return 'Voided';
  const stage=getStages(order).find(item=>item.id===order.status);
  return stage?.title||String(order.status||'Open').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function v12OrderSearchBlob(order){
  const customer=order.customerId?customerById(order.customerId):null;
  return [order.id,order.ticket,order.barcode,order.serviceType,order.items,order.status,order.register,
    order.tagNumber,...(order.tagNumbers||[]),order.rack,order.conveyorNumber,
    customer?.customerNumber,customer?.name,customer?.phone,customerLabel(order)].filter(Boolean).join(' ').toLowerCase();
}
function v12RestoreInput(selector,value){
  const input=document.querySelector(selector);if(!input)return;
  input.focus();
  try{input.setSelectionRange(String(value||'').length,String(value||'').length);}catch(error){ /* Non-text input. */ }
}

/* Keep both customer lookups focused while their result lists refresh. */
posCustomerSearchInput=function v12CounterCustomerSearchInput(value){
  posCustomerSearch=value;renderPosContent();v12RestoreInput('.v8-customer-search',value);
};
posCustDirSearch=function v12DirectoryCustomerSearchInput(value){
  state.posCustSearch=value;renderPosContent();v12RestoreInput('#v12-customer-directory-search',value);
};
const v12BaseRenderPosCustomers=renderPosCustomers;
renderPosCustomers=function v12RenderPosCustomers(content){
  v12BaseRenderPosCustomers(content);
  const input=content.querySelector?.('.filter-tabs .pos-search input');
  if(input){input.id='v12-customer-directory-search';input.autocomplete='off';}
};

/* -------------------------- POST-INTAKE TAG ASSIGN -------------------------- */
function v12TagColor(order){
  if(order.tagColor){const existing=V12_TAG_COLORS.find(color=>color.name===order.tagColor);if(existing)return existing;}
  const suggested=v8TagStyle(v8OrderService(order),order.dueDate);
  return V12_TAG_COLORS.find(color=>color.name===suggested.name)||V12_TAG_COLORS[0];
}
function v12TagRows(){
  const ui=state.tagUi||{},query=String(ui.search||'').trim().toLowerCase();
  let rows=state.orders.filter(order=>order.status!=='voided');
  if(ui.filter==='needs')rows=rows.filter(order=>v12IsOpen(order)&&!(order.tagNumbers||[]).length);
  if(ui.filter==='assigned')rows=rows.filter(order=>(order.tagNumbers||[]).length);
  if(ui.createdDate)rows=rows.filter(order=>v8OrderCreatedDate(order)===ui.createdDate);
  if(query)rows=rows.filter(order=>v12OrderSearchBlob(order).includes(query));
  return rows.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
}
function v12TagFilter(filter){state.tagUi.filter=filter;saveState();renderPosContent();}
function v12TagDate(value){state.tagUi.createdDate=value;saveState();renderPosContent();}
function v12TagSearch(value){state.tagUi.search=value;renderPosContent();v12RestoreInput('#v12-tag-search',value);}
function v12TagInputId(order,index){return `v12-tag-${String(order.id).replace(/[^a-z0-9_-]/gi,'_')}-${index}`;}
function v12TagColorId(order){return `v12-tag-color-${String(order.id).replace(/[^a-z0-9_-]/gi,'_')}`;}
function v12TagScan(event){
  if(event.key!=='Enter')return;event.preventDefault();
  const value=String(event.currentTarget.value||'').trim();if(!value)return;
  const order=v3FindOrderByScan(value);
  state.tagUi.filter='all';state.tagUi.search=order?(order.ticket||order.id):value;renderPosContent();
  if(order)setTimeout(()=>document.getElementById(v12TagInputId(order,0))?.focus(),0);
  else{toast(`No ticket found for ${value}`,false,'alerttriangle');v12RestoreInput('#v12-tag-scan',value);}
}
function v12NormalizeTag(value){return String(value||'').trim().toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9-]/g,'').slice(0,18);}
function v12SaveTags(orderId){
  const order=state.orders.find(item=>item.id===orderId);if(!order)return;
  const tags=[];
  for(let index=0;index<5;index++){
    const tag=v12NormalizeTag(document.getElementById(v12TagInputId(order,index))?.value);
    if(tag&&!tags.includes(tag))tags.push(tag);
  }
  if(!tags.length)return toast('Enter or scan at least one physical tag number',false,'alerttriangle');
  const collision=state.orders.find(other=>other.id!==order.id&&(other.tagNumbers||[other.tagNumber]).filter(Boolean).some(tag=>tags.includes(String(tag).toUpperCase())));
  if(collision)return toast(`${tags.find(tag=>(collision.tagNumbers||[collision.tagNumber]).map(String).map(value=>value.toUpperCase()).includes(tag))} is already assigned to #${collision.ticket||collision.id}`,false,'alerttriangle');
  const colorName=document.getElementById(v12TagColorId(order))?.value||v12TagColor(order).name;
  const color=V12_TAG_COLORS.find(item=>item.name===colorName)||V12_TAG_COLORS[0];
  const oldTags=(order.tagNumbers||[]).join(', ');
  order.tagNumbers=tags;order.tagNumber=tags[0];order.tagColor=color.name;order.tagColorHex=color.hex;
  order.tagAssignedAt=v8NowISO();order.tagAssignedBy=v6CurrentStaff()?.name||'Staff';
  order.tagHistory=order.tagHistory||[];
  order.tagHistory.unshift({at:order.tagAssignedAt,by:order.tagAssignedBy,from:oldTags||null,to:tags.slice(),color:color.name});
  v8AddActivity(order,'tag_assign',`${oldTags?'Tags updated':'Physical tags assigned'} · ${tags.join(', ')} · ${color.name}`);
  recordSync(`Tag assignment · #${order.ticket||order.id} · ${tags.join(', ')} · ${color.name}`);
  saveState();toast(`#${order.ticket||order.id} tags saved; removed from Need Tags`,true,'tag');renderPosContent();
}
function v12ClearTags(orderId){
  const order=state.orders.find(item=>item.id===orderId);if(!order||!order.tagNumber)return;
  const reason=prompt(`Recall tags from #${order.ticket||order.id}?`,'Tag replaced / ticket reorganized');if(!reason)return;
  const previous=(order.tagNumbers||[order.tagNumber]).filter(Boolean);
  order.tagHistory=order.tagHistory||[];order.tagHistory.unshift({at:v8NowISO(),by:v6CurrentStaff()?.name||'Staff',from:previous.slice(),to:[],reason});
  order.tagNumbers=[];order.tagNumber=null;order.tagColor=null;order.tagColorHex=null;order.tagAssignedAt=null;
  v8AddActivity(order,'tag_recall',`Tags recalled · ${previous.join(', ')} · ${reason}`);
  recordSync(`Tags recalled · #${order.ticket||order.id} · ${previous.join(', ')} · ${reason}`);
  saveState();toast(`#${order.ticket||order.id} returned to Need Tags`,true,'refresh');renderPosContent();
}
function v12RenderTags(content){
  v12EnsureData();const ui=state.tagUi,rows=v12TagRows(),needCount=state.orders.filter(order=>v12IsOpen(order)&&!(order.tagNumbers||[]).length).length;
  content.innerHTML=`
    <div class="pos-card v12-tag-scan-card">
      <div class="v12-section-head"><div><h3>${icon('tag',17)} Tag Assign — after the customer leaves</h3><div class="v2-note">Scan the printed ticket barcode, then scan or type the physical garment tags. New customer tickets never print a tag number.</div></div><span class="v12-count-badge">${needCount} need tags</span></div>
      <div class="v12-tag-scan-row"><input id="v12-tag-scan" class="text-input v8-scan-input" autocomplete="off" placeholder="Scan ticket barcode or type ticket #, then press Enter" onkeydown="v12TagScan(event)"><div class="v11-scanner-ready"><span></span>NADAMOO TICKET SCAN</div></div>
    </div>
    <div class="filter-tabs v12-tag-toolbar">
      ${[['needs','Need Tags'],['assigned','Assigned'],['all','All / Search']].map(([id,label])=>`<button class="filter-tab ${ui.filter===id?'active':''}" onclick="v12TagFilter('${id}')">${label}</button>`).join('')}
      <div class="pos-search"><span class="search-ic">${icon('search',15)}</span><input id="v12-tag-search" autocomplete="off" placeholder="Ticket, customer, customer # or tag…" value="${esc(ui.search||'')}" oninput="v12TagSearch(this.value)"></div>
      <label class="v12-date-filter"><span>Created date</span><input class="text-input" type="date" value="${esc(ui.createdDate||'')}" onchange="v12TagDate(this.value)"></label>
    </div>
    <div class="pos-table-wrap v12-wide-table">
      ${rows.length?`<table class="pos-table v12-tag-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Type / Due</th><th>Qty</th><th>Tag Color</th><th>Physical Tags 1–5</th><th></th></tr></thead><tbody>${rows.map(order=>{
        const selected=v12TagColor(order),tags=order.tagNumbers||[];
        return `<tr><td><strong>#${esc(order.ticket||order.id)}</strong><div class="row-sub">${esc(order.barcode||'')}</div></td><td><strong>${esc(customerLabel(order))}</strong><div class="row-sub">${esc(customerById(order.customerId)?.customerNumber||'Walk-in')}</div></td><td>${esc(V8_SERVICE_NAMES[v8OrderService(order)]||'Service')}<div class="row-sub">Due ${esc(order.dueDate||'—')}</div></td><td><strong>${esc(order.pieceCount||1)}</strong></td><td><select id="${v12TagColorId(order)}" class="text-input v12-tag-color">${V12_TAG_COLORS.map(color=>`<option ${color.name===selected.name?'selected':''}>${color.name}</option>`).join('')}</select></td><td><div class="v12-tag-inputs">${Array.from({length:5},(_,index)=>`<input id="${v12TagInputId(order,index)}" class="text-input" autocomplete="off" placeholder="Tag ${index+1}" value="${esc(tags[index]||'')}">`).join('')}</div>${order.tagAssignedAt?`<div class="row-sub">Assigned ${v12DateTime(order.tagAssignedAt)} · ${esc(order.tagAssignedBy||'Staff')}</div>`:'<div class="row-sub">Not assigned during customer intake</div>'}</td><td><div class="v12-row-actions"><button class="btn btn-primary btn-sm" onclick="v12SaveTags('${order.id}')">Save Tags</button>${order.tagNumber?`<button class="btn btn-ghost btn-sm" onclick="v12ClearTags('${order.id}')">Recall</button>`:''}</div></td></tr>`;
      }).join('')}</tbody></table>`:`<div class="table-empty">${ui.filter==='needs'?'Every open ticket has its physical tags assigned.':'No tickets match this tag search.'}</div>`}
    </div>`;
  setTimeout(()=>document.getElementById('v12-tag-scan')?.focus(),0);
}

/* ------------------------------ TO BE DONE BOARD ----------------------------- */
function v12DueToday(order){return v12IsOpen(order)&&order.dueDate===v8TodayISO();}
function v12Overdue(order){return v12IsOpen(order)&&order.dueDate&&order.dueDate<v8TodayISO();}
function v12TodoRoute(route){
  if(route==='tags'){state.posNav='tags';state.tagUi.filter='needs';}
  else if(route==='rack'){state.posNav='rack';state.rackUi.showAssigned=false;}
  else{state.posNav='orders';state.ledgerUi.filter=route;}
  saveState();renderPosContent();
}
function v12TodoTile(label,value,sub,route,tone=''){
  return `<button class="v12-todo-tile ${tone}" onclick="v12TodoRoute('${route}')"><span class="v12-todo-value">${value}</span><span><strong>${label}</strong><small>${sub}</small></span>${icon('chevronright',17)}</button>`;
}
function v12RenderTodo(content){
  const open=state.orders.filter(v12IsOpen),pickup=open.filter(order=>order.fulfillment!=='delivery'&&order.channel!=='delivery'),delivery=state.orders.filter(order=>(order.fulfillment==='delivery'||order.channel==='delivery')&&order.status!=='delivered'&&order.status!=='voided');
  const ready=state.orders.filter(order=>order.status==='ready'),needTags=open.filter(order=>!(order.tagNumbers||[]).length),needLocation=open.filter(order=>!v8OrderHasLocation(order)&&order.status!=='scheduled'),dueToday=open.filter(v12DueToday),overdue=open.filter(v12Overdue),unpaidDelivery=delivery.filter(order=>!order.paid),subjectChange=open.filter(order=>order.subjectToChange),followup=open.filter(order=>order.pendingCustomerFollowup);
  content.innerHTML=`<div class="v12-todo-head"><div><h2>To Be Done</h2><p>Live operational exceptions and work queues. Select a tile to open the exact ticket list.</p></div><div>${new Date().toLocaleString('en-US',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div></div>
    <div class="v12-todo-grid">
      ${v12TodoTile('Incomplete Pickup Orders',pickup.length,'Open counter tickets','pickup')}
      ${v12TodoTile('Undelivered Tickets',delivery.length,`${ready.filter(order=>order.fulfillment==='delivery'||order.channel==='delivery').length} ready`,'undelivered')}
      ${v12TodoTile('Incomplete Tickets Due Today',dueToday.length,'Due before close','due_today',dueToday.length?'warn':'')}
      ${v12TodoTile('Subject to Change',subjectChange.length,'Pricing or scope flagged','subject_change')}
      ${v12TodoTile('Need Physical Tags',needTags.length,'Assign after intake','tags',needTags.length?'warn':'')}
      ${v12TodoTile('Tickets Overdue',overdue.length,`Before ${v8TodayISO()}`,'overdue',overdue.length?'danger':'')}
      ${v12TodoTile('Unpaid Delivery / COD',unpaidDelivery.length,'Collect or charge','unpaid')}
      ${v12TodoTile('Need Rack / Conveyor',needLocation.length,'Physical location unassigned','rack')}
      ${v12TodoTile('Ready Tickets',ready.length,'Pickup and delivery','ready')}
      ${v12TodoTile('Pending Customer Follow-up',followup.length,'Manual contact required','followup')}
    </div>`;
}

/* -------------------------- SEARCHABLE TICKET LEDGER ------------------------- */
function v12LedgerRows(){
  const ui=state.ledgerUi,query=String(ui.search||'').trim().toLowerCase();let rows=[...state.orders];
  if(ui.filter==='open')rows=rows.filter(v12IsOpen);
  if(ui.filter==='due_today')rows=rows.filter(v12DueToday);
  if(ui.filter==='overdue')rows=rows.filter(v12Overdue);
  if(ui.filter==='ready')rows=rows.filter(order=>order.status==='ready');
  if(ui.filter==='completed')rows=rows.filter(v12IsClosed);
  if(ui.filter==='delivery')rows=rows.filter(order=>order.fulfillment==='delivery'||order.channel==='delivery');
  if(ui.filter==='undelivered')rows=rows.filter(order=>(order.fulfillment==='delivery'||order.channel==='delivery')&&order.status!=='delivered'&&order.status!=='voided');
  if(ui.filter==='pickup')rows=rows.filter(order=>v12IsOpen(order)&&order.fulfillment!=='delivery'&&order.channel!=='delivery');
  if(ui.filter==='subject_change')rows=rows.filter(order=>v12IsOpen(order)&&order.subjectToChange);
  if(ui.filter==='followup')rows=rows.filter(order=>v12IsOpen(order)&&order.pendingCustomerFollowup);
  if(ui.filter==='unpaid')rows=rows.filter(order=>!order.paid&&order.status!=='voided');
  if(ui.filter==='voided')rows=rows.filter(order=>order.status==='voided');
  if(ui.from)rows=rows.filter(order=>!order.createdAt||String(order.createdAt).slice(0,10)>=ui.from);
  if(ui.to)rows=rows.filter(order=>!order.createdAt||String(order.createdAt).slice(0,10)<=ui.to);
  if(query)rows=rows.filter(order=>v12OrderSearchBlob(order).includes(query));
  return rows.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
}
function v12LedgerFilter(value){state.ledgerUi.filter=value;saveState();renderPosContent();}
function v12LedgerDate(field,value){state.ledgerUi[field]=value;saveState();renderPosContent();}
function v12LedgerSearch(value){state.ledgerUi.search=value;renderPosContent();v12RestoreInput('#v12-ledger-search',value);}
function v12VoidTicket(orderId){
  const order=state.orders.find(item=>item.id===orderId);if(!order||order.status==='voided')return;
  const reason=prompt(`Void #${order.ticket||order.id}? This keeps the full history.`,'Entered in error');if(!reason)return;
  const previous={status:order.status,stageIndex:order.stageIndex,location:v8OrderLocation(order)};
  order.voidHistory=order.voidHistory||[];order.voidHistory.unshift({at:v8NowISO(),by:v6CurrentStaff()?.name||'Staff',reason,previous});
  order.status='voided';order.voidedAt=v8NowISO();order.voidReason=reason;order.rack=null;order.conveyorNumber=null;order.driverRouteReady=false;
  v8AddActivity(order,'void',`Ticket voided · ${reason}`,previous);recordSync(`Ticket voided · #${order.ticket||order.id} · ${reason}`);
  saveState();toast(`#${order.ticket||order.id} voided; history retained`,true,'alerttriangle');renderPosContent();
}
function v12BacktrackTicket(orderId){
  const order=state.orders.find(item=>item.id===orderId);if(!order)return;
  const reason=prompt(`Return #${order.ticket||order.id} to In Cleaning?`,'Production correction / re-clean');if(!reason)return;
  const previousStatus=order.status,previousLocation=v8OrderLocation(order),stages=getStages(order),cleaningIndex=stages.findIndex(stage=>stage.id==='in_cleaning');
  order.backtrackHistory=order.backtrackHistory||[];order.backtrackHistory.unshift({at:v8NowISO(),by:v6CurrentStaff()?.name||'Staff',from:previousStatus,location:previousLocation,reason});
  order.status='in_cleaning';order.stageIndex=cleaningIndex>=0?cleaningIndex:0;order.rack=null;order.conveyorNumber=null;order.readyAt=null;order.driverRouteReady=false;order.deliveryScanStatus=order.deliveryScanStatus==='scanned'?'recalled':order.deliveryScanStatus;
  if(previousStatus==='voided'){order.restoredAt=v8NowISO();order.voidedAt=null;}
  v8AddActivity(order,'backtrack',`Backtracked from ${previousStatus} / ${previousLocation} · ${reason}`);
  recordSync(`Ticket backtracked · #${order.ticket||order.id} · ${previousStatus} → In Cleaning · ${reason}`);
  saveState();toast(`#${order.ticket||order.id} returned to In Cleaning`,true,'refresh');renderPosContent();
}
function v12RenderTicketLedger(content){
  const ui=state.ledgerUi,rows=v12LedgerRows();
  content.innerHTML=`<div class="pos-card v12-ledger-head"><div class="v12-section-head"><div><h3>${icon('receipt',17)} Complete Ticket List</h3><div class="v2-note">Search every current and previous ticket by ticket number, barcode, customer number, customer, tag or location.</div></div><span class="v12-count-badge">${rows.length} tickets</span></div>
    <div class="v12-ledger-controls"><div class="pos-search"><span class="search-ic">${icon('search',15)}</span><input id="v12-ledger-search" autocomplete="off" placeholder="Ticket, barcode, customer #, name, phone, tag or rack…" value="${esc(ui.search||'')}" oninput="v12LedgerSearch(this.value)"></div><select class="text-input" onchange="v12LedgerFilter(this.value)">${[['all','All Tickets'],['open','Open'],['pickup','Incomplete Pickup'],['due_today','Due Today'],['overdue','Overdue'],['ready','Ready'],['completed','Completed'],['delivery','All Delivery'],['undelivered','Undelivered'],['unpaid','Unpaid'],['subject_change','Subject to Change'],['followup','Follow-up'],['voided','Voided']].map(([id,label])=>`<option value="${id}" ${ui.filter===id?'selected':''}>${label}</option>`).join('')}</select><label><span>From</span><input class="text-input" type="date" value="${esc(ui.from||'')}" onchange="v12LedgerDate('from',this.value)"></label><label><span>To</span><input class="text-input" type="date" value="${esc(ui.to||'')}" onchange="v12LedgerDate('to',this.value)"></label></div></div>
    <div class="pos-table-wrap v12-wide-table">${rows.length?`<table class="pos-table v12-ledger-table"><thead><tr><th>Ticket / Type</th><th>In Date & Time</th><th>Due</th><th>Out Date & Time</th><th>Total / Balance</th><th>Customer # / Name</th><th>Tag / Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(order=>{
      const customer=order.customerId?customerById(order.customerId):null,outAt=order.deliveredAt||order.pickedUpAt||order.voidedAt||null,balance=v12OrderBalance(order),tags=(order.tagNumbers||[]).join(', ');
      return `<tr class="${order.status==='voided'?'v12-voided-row':''}"><td><strong>#${esc(order.ticket||order.id)}</strong><div class="row-sub">${esc(V8_SERVICE_NAMES[v8OrderService(order)]||'Service')} · ${esc(order.register||'R1')}</div><div class="row-sub">${esc(order.barcode||'')}</div></td><td>${v12DateTime(order.createdAt)}</td><td><strong>${esc(order.dueDate||'—')}</strong></td><td>${v12DateTime(outAt)}</td><td><strong>${money(Number(order.total||0)+Number(order.surcharge||0))}</strong><div class="row-sub ${balance?'v12-balance-due':''}">${balance?money(balance)+' due':'Paid / $0.00'}</div></td><td><strong>${esc(customer?.customerNumber||'Walk-in')}</strong><div class="row-sub">${esc(customerLabel(order))}</div></td><td>${tags?`<strong>${esc(tags)}</strong><div class="row-sub">${esc(order.tagColor||'Tag')}</div>`:'<span class="v12-awaiting-text">Needs tag</span>'}<div class="row-sub">${esc(v8OrderLocation(order))}</div></td><td><span class="pill ${order.status==='voided'?'paid-no':v12IsClosed(order)?'stage-done':order.status==='ready'?'paid-yes':'stage-active'}">${esc(v12StatusLabel(order))}</span></td><td><div class="v12-row-actions"><button class="btn btn-ghost btn-sm" onclick="posOpenOrderDetail('${order.id}')">Detail</button><button class="btn btn-ghost btn-sm" onclick="posPrintReceipt('${order.id}')">Reprint</button>${order.status!=='voided'?`<button class="btn btn-secondary btn-sm" onclick="v12BacktrackTicket('${order.id}')">Backtrack</button><button class="btn btn-ghost btn-sm v12-danger-action" onclick="v12VoidTicket('${order.id}')">Void</button>`:`<button class="btn btn-secondary btn-sm" onclick="v12BacktrackTicket('${order.id}')">Restore</button>`}</div></td></tr>`;
    }).join('')}</tbody></table>`:`<div class="table-empty">No tickets match this search and date range.</div>`}</div>`;
}
renderPosOrders=function v12RenderPosOrders(content){v12RenderTicketLedger(content);};

/* ------------------------- INDEPENDENT EMPLOYEE PUNCH ------------------------ */
function v12OpenPunchForStaff(staff){return state.clockLog.find(entry=>!entry.clockOut&&(entry.staffId===staff.id||entry.staffName===staff.name));}
function v12PunchClockHTML(){
  const current=state.staff.map(staff=>({staff,open:v12OpenPunchForStaff(staff)}));
  return `<h3>${icon('clock',18)} Employee Punch Clock</h3><p class="pm-sub">Each employee uses their own PIN. Punching does not take over or sign out the counter register.</p><div class="v12-punch-summary"><strong>${current.filter(item=>item.open).length}</strong><span>of ${current.length} employees punched in</span></div><div class="v12-punch-list">${current.map(({staff,open})=>`<button class="v12-punch-person ${open?'in':''}" onclick="v12PunchPin('${staff.id}')"><span class="avatar">${esc(staff.initials||staff.name.slice(0,2).toUpperCase())}</span><span><strong>${esc(staff.name)}</strong><small>${open?`Punched in ${esc(open.clockIn)}`:'Punched out'}</small></span><b>${open?'Punch Out':'Punch In'}</b></button>`).join('')}</div><div class="v12-punch-note">Register access and time punches are separate. This test build stores punches in this browser; shared live punches across phones and multiple locations require the production cloud database.</div><button class="btn btn-ghost btn-block" style="margin-top:10px" onclick="closePosModal()">Close</button>`;
}
function v12OpenPunchClock(){openPosModal(v12PunchClockHTML());}
function v12PunchPin(staffId){
  const staff=staffById(staffId);if(!staff)return;const open=v12OpenPunchForStaff(staff),action=open?'Punch Out':'Punch In';
  openPosModal(`<h3>${action} · ${esc(staff.name)}</h3><p class="pm-sub">Enter ${esc(staff.name.split(' ')[0])}'s 4-digit employee PIN.</p><input id="v12-punch-pin" class="text-input v12-punch-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" onkeydown="if(event.key==='Enter')v12SubmitPunch('${staff.id}')"><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="v12SubmitPunch('${staff.id}')">${action}</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="v12OpenPunchClock()">Back</button>`);
  setTimeout(()=>document.getElementById('v12-punch-pin')?.focus(),0);
}
function v12SubmitPunch(staffId){
  const staff=staffById(staffId);if(!staff)return;const input=document.getElementById('v12-punch-pin'),pin=String(input?.value||'');
  if(pin!==String(staff.pin||'')){toast('Incorrect employee PIN',false,'alerttriangle');if(input){input.value='';input.focus();}return;}
  const now=new Date(),time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),open=v12OpenPunchForStaff(staff);
  if(open){open.clockOut=time;open.clockOutAt=now.toISOString();open.clockOutBy='Employee Punch Clock';recordSync(`Employee punch out · ${staff.name} · ${time}`);toast(`${staff.name} punched out at ${time}`,true,'clock');}
  else{state.clockLog.unshift({id:uid('punch_'),staffId:staff.id,staffName:staff.name,register:'Employee Punch Clock',clockIn:time,clockInAt:now.toISOString(),clockOut:null,clockOutAt:null});recordSync(`Employee punch in · ${staff.name} · ${time}`);toast(`${staff.name} punched in at ${time}`,true,'clock');}
  saveState();if(state.session?.loggedIn&&state.posNav==='team')renderPosContent();v12OpenPunchClock();
}
function v12TeamPunchCard(){
  const punched=state.staff.filter(staff=>v12OpenPunchForStaff(staff)).length;
  return `<div class="pos-card v12-team-punch-card"><div class="v12-section-head"><div><h3>${icon('clock',17)} Shared Employee Punch Station</h3><div class="v2-note">Any employee can punch in or out with their own PIN without changing the active counter user.</div></div><span class="v12-count-badge">${punched} punched in</span></div><button class="btn btn-primary" onclick="v12OpenPunchClock()">Open Employee Punch Clock</button></div>`;
}
const v12BaseRenderPosTeam=renderPosTeam;
renderPosTeam=function v12RenderPosTeam(content){
  v12BaseRenderPosTeam(content);
  content.innerHTML=content.innerHTML.replace(/<button class="btn btn-primary btn-block" onclick="posSignOut\(\)">Clock Out<\/button>/,'<button class="btn btn-primary btn-block" onclick="v12OpenPunchClock()">Open Punch Clock</button>');
  content.insertAdjacentHTML('afterbegin',v12TeamPunchCard());
};

const v12BasePosLoginHTML=posLoginHTML;
posLoginHTML=function v12PosLoginHTML(){
  const html=v12BasePosLoginHTML(),marker='\n    </div>\n  </div>',index=html.lastIndexOf(marker);
  if(index<0)return html;
  const punch=`<div class="v12-login-punch"><div><strong>${icon('clock',16)} Employee Punch Clock</strong><span>Punch in or out without opening a register</span></div><button class="btn btn-secondary btn-sm" onclick="v12OpenPunchClock()">Open Clock</button></div>`;
  return html.slice(0,index)+punch+html.slice(index);
};

/* Keep voided tickets out of customer balances while retaining them in history. */
v7OpenTickets=function v12OpenTickets(customerId){return state.orders.filter(order=>order.customerId===customerId&&v12IsOpen(order));};
v7PickupTickets=function v12PickupTickets(customerId){return state.orders.filter(order=>order.customerId===customerId&&order.fulfillment!=='delivery'&&v12IsOpen(order));};
v7PreviousTickets=function v12PreviousTickets(customerId){return state.orders.filter(order=>order.customerId===customerId&&(v12IsClosed(order)||order.status==='voided'));};
v7Outstanding=function v12Outstanding(customerId){return state.orders.filter(order=>order.customerId===customerId&&!order.paid&&order.status!=='voided').reduce((sum,order)=>sum+v12OrderBalance(order),0);};
arBalance=function v12ArBalance(customerId){return state.orders.filter(order=>order.customerId===customerId&&!order.paid&&order.status!=='voided').reduce((sum,order)=>sum+v12OrderBalance(order),0);};

/* Add the CleanBase-style work queues to navigation. */
if(!POS_NAV_ITEMS.some(item=>item.id==='todo'))POS_NAV_ITEMS.splice(1,0,{id:'todo',label:'To Be Done',icon:'alerttriangle'});
if(!POS_NAV_ITEMS.some(item=>item.id==='tags'))POS_NAV_ITEMS.splice(3,0,{id:'tags',label:'Tag Assign',icon:'tag'});
POS_TITLES.todo=['To Be Done','Operational exceptions, overdue work and pending assignments'];
POS_TITLES.tags=['Tag Assign','Assign and search physical garment tags after customer intake'];
POS_TITLES.orders=['Ticket List','Search, reprint, void, restore or backtrack every current and previous ticket'];

const v12BaseRenderPosContent=renderPosContent;
renderPosContent=function v12RenderPosContent(){
  if(!state.session?.loggedIn)return;
  if(!['todo','tags'].includes(state.posNav))return v12BaseRenderPosContent();
  const [title,sub]=POS_TITLES[state.posNav]||['Hattan Ops',''];
  const titleEl=document.getElementById('pos-title');if(titleEl)titleEl.textContent=title;
  const subEl=document.getElementById('pos-sub');if(subEl)subEl.innerHTML=sub;
  document.querySelectorAll('.pos-nav button').forEach((button,index)=>button.classList.toggle('active',POS_NAV_ITEMS[index]?.id===state.posNav));
  const content=document.getElementById('pos-content');if(!content)return;
  if(state.posNav==='todo')v12RenderTodo(content);else v12RenderTags(content);
};

const v12BasePosShellHTML=posShellHTML;
posShellHTML=function v12PosShellHTML(){return v12BasePosShellHTML().replace('Staff POS · V11 Hardware','Staff POS · V12 Workflow');};

v12EnsureData();
saveState();
renderPosRoot();
