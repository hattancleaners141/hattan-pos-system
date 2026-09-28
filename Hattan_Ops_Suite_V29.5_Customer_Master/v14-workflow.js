/* ============================================================================
   HATTAN OPS V14 — counter-speed, pickup, staff, AI and keyboard workflow
   Loaded after V12's operational engine and V13's Simple view.
============================================================================ */

const V14_SERVICE_INSTRUCTIONS = {
  dryclean: [
    { id:'stain', label:'Stain treatment' },
    { id:'delicate', label:'Delicate / hand finish' },
    { id:'nosteam', label:'No steam' },
    { id:'protectbuttons', label:'Protect special buttons' },
    { id:'call', label:'Call before extra work' },
  ],
  washfold: [
    { id:'fragrancefree', label:'Fragrance-free detergent' },
    { id:'separate', label:'Separate darks & whites' },
    { id:'nosoftener', label:'No fabric softener' },
    { id:'lowdry', label:'Low dry' },
    { id:'hangdry', label:'Hang dry selected pieces' },
  ],
  shirts: [
    { id:'nostarch', label:'No starch' },
    { id:'lightstarch', label:'Light starch' },
    { id:'heavystarch', label:'Heavy starch' },
    { id:'boxed', label:'Box shirts' },
    { id:'buttons', label:'Replace broken buttons' },
  ],
  alterations: [
    { id:'originalhem', label:'Keep original hem' },
    { id:'matchexisting', label:'Match existing thread' },
    { id:'call', label:'Call before extra work' },
    { id:'fitting', label:'Fitting required' },
    { id:'press', label:'Press after alteration' },
  ],
};

/* Icons used only by this additive layer. */
ICON_PATHS.chevronup = '<path d="m6 15 6-6 6 6"/>';
ICON_PATHS.list = '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>';

function v14CloneInstructionOrder() {
  return Object.fromEntries(Object.entries(V14_SERVICE_INSTRUCTIONS).map(([service, rows]) => [service, rows.map(row => row.id)]));
}
function v14EnsureData() {
  state.v14InstructionOrder = state.v14InstructionOrder || v14CloneInstructionOrder();
  Object.keys(V14_SERVICE_INSTRUCTIONS).forEach(service => {
    const valid = new Set(V14_SERVICE_INSTRUCTIONS[service].map(row => row.id));
    const current = (state.v14InstructionOrder[service] || []).filter(id => valid.has(id));
    V14_SERVICE_INSTRUCTIONS[service].forEach(row => { if (!current.includes(row.id)) current.push(row.id); });
    state.v14InstructionOrder[service] = current;
  });
  state.staff = state.staff || [];
  state.staff.forEach(staff => {
    staff.pin = String(staff.pin || '0000').replace(/\D/g, '').padStart(4, '0').slice(-4);
    staff.initials = staff.initials || String(staff.name || 'Staff').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  });
  if (counterDraft) v14EnsureDraft(counterDraft);
}
function v14EnsureDraft(draft) {
  if (!draft) return draft;
  draft.serviceInstructions = draft.serviceInstructions || { dryclean:[], washfold:[], shirts:[], alterations:[] };
  draft.serviceInstructionNotes = draft.serviceInstructionNotes || { dryclean:'', washfold:'', shirts:'', alterations:'' };
  draft.instructionOpen = draft.instructionOpen || {};
  draft.rushGroups = draft.rushGroups || [];
  draft.serviceDueDates = draft.serviceDueDates || {};
  return draft;
}

const v14BaseSaveState = saveState;
saveState = function v14SaveState() {
  v14BaseSaveState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.v14InstructionOrder = state.v14InstructionOrder || v14CloneInstructionOrder();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (error) { /* browser storage unavailable */ }
};
const v14BaseLoadState = loadState;
loadState = function v14LoadState() {
  v14BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.v14InstructionOrder) state.v14InstructionOrder = raw.v14InstructionOrder;
  } catch (error) { /* optional V14 preferences can reset */ }
  v14EnsureData();
};

const v14BaseFreshCounterDraft = v8FreshCounterDraft;
v8FreshCounterDraft = function v14FreshCounterDraft() { return v14EnsureDraft(v14BaseFreshCounterDraft()); };
freshCounterDraft = v8FreshCounterDraft;
v14EnsureData();

/* ------------------------- LOGIN, USERS AND EMPLOYEE PINS ------------------------- */
function v14Initials(name) {
  return String(name || 'Staff').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'ST';
}
function v14OpenAddUser(event) {
  event?.stopPropagation?.();
  openPosModal(`<h3>${icon('users',18)} Add Staff Member</h3>
    <p class="pm-sub">Available from the opening screen. A manager PIN authorizes new users.</p>
    <span class="field-label">Staff member name</span><input id="v14-new-staff-name" class="text-input" autocomplete="name" placeholder="First and last name" style="margin-bottom:10px">
    <span class="field-label">New 4-digit PIN</span><input id="v14-new-staff-pin" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" style="margin-bottom:10px">
    <label class="pref-row" style="cursor:pointer"><div><div class="pr-label">Manager access</div><div class="pr-sub">Only managers are labeled on the staff screen.</div></div><input id="v14-new-staff-manager" type="checkbox" style="width:22px;height:22px"></label>
    <span class="field-label" style="margin-top:12px">Manager authorization PIN</span><input id="v14-new-staff-manager-pin" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v14SaveNewUser()">Add Staff Member</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
  setTimeout(() => document.getElementById('v14-new-staff-name')?.focus(), 0);
}
function v14SaveNewUser() {
  const name = String(document.getElementById('v14-new-staff-name')?.value || '').trim();
  const pin = String(document.getElementById('v14-new-staff-pin')?.value || '').replace(/\D/g, '');
  const managerPin = String(document.getElementById('v14-new-staff-manager-pin')?.value || '').replace(/\D/g, '');
  const manager = !!document.getElementById('v14-new-staff-manager')?.checked;
  if (!name) return toast('Enter the staff member’s name', false, 'alerttriangle');
  if (!/^\d{4}$/.test(pin)) return toast('The employee PIN must be exactly 4 digits', false, 'alerttriangle');
  if (!(state.staff || []).some(staff => staff.manager && String(staff.pin) === managerPin)) return toast('Manager authorization PIN is incorrect', false, 'alerttriangle');
  const staff = { id:uid('st_'), name, initials:v14Initials(name), pin, role:manager ? 'Manager' : '', payRate:0, manager };
  state.staff.push(staff); saveState(); closePosModal(); renderPosRoot();
  toast(`${name} added to the staff list`, true, 'users');
}
function v14OpenChangePin(staffId, event) {
  event?.stopPropagation?.();
  const staff = staffById(staffId); if (!staff) return;
  openPosModal(`<h3>${icon('lock',18)} Change PIN · ${esc(staff.name)}</h3>
    <span class="field-label">Current PIN</span><input id="v14-pin-current" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" style="margin-bottom:10px" placeholder="••••">
    <span class="field-label">New 4-digit PIN</span><input id="v14-pin-new" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" style="margin-bottom:10px" placeholder="••••">
    <span class="field-label">Confirm new PIN</span><input id="v14-pin-confirm" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" onkeydown="if(event.key==='Enter')v14SaveChangedPin('${staff.id}')">
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v14SaveChangedPin('${staff.id}')">Save New PIN</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
  setTimeout(() => document.getElementById('v14-pin-current')?.focus(), 0);
}
function v14SaveChangedPin(staffId) {
  const staff = staffById(staffId); if (!staff) return;
  const current = String(document.getElementById('v14-pin-current')?.value || '').replace(/\D/g, '');
  const next = String(document.getElementById('v14-pin-new')?.value || '').replace(/\D/g, '');
  const confirmPin = String(document.getElementById('v14-pin-confirm')?.value || '').replace(/\D/g, '');
  if (current !== String(staff.pin)) return toast('Current PIN is incorrect', false, 'alerttriangle');
  if (!/^\d{4}$/.test(next)) return toast('New PIN must be exactly 4 digits', false, 'alerttriangle');
  if (next !== confirmPin) return toast('The new PIN entries do not match', false, 'alerttriangle');
  staff.pin = next; saveState(); closePosModal(); renderPosRoot(); toast(`${staff.name}’s PIN was changed`, true, 'lock');
}

posLoginHTML = function v14PosLoginHTML() {
  loginDraft.register = 'Store POS';
  const selected = loginDraft.staffId ? staffById(loginDraft.staffId) : null;
  const staffCards = state.staff.map(staff => `<div class="v14-staff-person ${loginDraft.staffId === staff.id ? 'selected' : ''}">
      <button type="button" class="v14-staff-select" onclick="posSelectStaff('${staff.id}')" aria-label="Sign in as ${esc(staff.name)}">
        <span class="avatar">${esc(staff.initials)}</span><span class="v14-staff-identity"><strong>${esc(staff.name)}</strong>${staff.manager ? '<span class="v14-manager-badge">Manager</span>' : ''}</span>
      </button>
      <div class="v14-staff-actions"><button type="button" class="v14-link-btn" onclick="v14OpenChangePin('${staff.id}',event)">Change PIN</button></div>
    </div>`).join('');
  return `<div class="pos-login-wrap"><div class="pos-login-card v14-login-card">
    <div class="pos-login-brand"><div class="logo-mark" style="margin:0 auto 10px"></div><h1>Hattan Cleaners</h1><p>${t('login.subtitle')}</p></div>
    <div class="pos-login-conn"><span class="conn-pill-slot">${connPillHTML()}</span></div>
    <div class="v13-lang-toggle" style="margin:12px 0"><button class="v13-lang-btn ${state.language !== 'es' ? 'active' : ''}" onclick="v13SetLanguage('en')">English</button><button class="v13-lang-btn ${state.language === 'es' ? 'active' : ''}" onclick="v13SetLanguage('es')">Español</button></div>
    <div class="v14-login-head"><span class="field-label">Staff Member</span><button class="btn btn-secondary btn-sm" onclick="v12OpenPunchClock()">${icon('clock',14)} Employee Punch Clock</button></div>
    <div class="v14-staff-grid">${staffCards}</div>
    <button class="v14-add-user" onclick="v14OpenAddUser(event)">${icon('plus',15)} Add New Staff Member</button>
    ${selected ? `<span class="field-label" style="margin-top:18px">Enter PIN for ${esc(selected.name.split(' ')[0])}</span><div class="pin-dots">${[0,1,2,3].map(i => `<i class="${i < loginDraft.pin.length ? 'filled' : ''}"></i>`).join('')}</div><div class="pin-pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button onclick="posPinPress('${n}')">${n}</button>`).join('')}<button onclick="posPinBack()" style="color:var(--ink-muted)">${icon('chevronleft',18)}</button><button onclick="posPinPress('0')">0</button><button style="visibility:hidden"></button></div>` : '<p class="helper-text" style="text-align:center;margin-top:14px">Choose your name to continue</p>'}
  </div></div>`;
};

/* Regular and Simple are staff choices; neither requires a manager gate. */
v13RequestFullMode = function v14ReturnToRegularMode() { state.simpleMode = false; saveState(); renderPosRoot(); };
const v14BaseSimpleShellHTML = v13SimpleShellHTML;
v13SimpleShellHTML = function v14SimpleShellHTML() {
  const label = state.language === 'es' ? 'Versión Regular' : 'Regular Version';
  return v14BaseSimpleShellHTML().replace(t('nav.more'), label).replace("Staff POS · V13", "Staff POS · V14");
};
const v14BasePosShellHTML = posShellHTML;
posShellHTML = function v14PosShellHTML() { return v14BasePosShellHTML().replace(/Staff POS · V13/g, 'Staff POS · V14'); };

/* ------------------------- NEW CUSTOMER: EVERYTHING OPTIONAL ------------------------- */
posOpenNewCustomer = function v14OpenNewCustomer() {
  ncDraft = { channel:'pickup', saveCard:false };
  openPosModal(`<h3>${icon('users',17)} New Customer</h3><p class="pm-sub">Add whatever the customer is comfortable sharing. Every field can be completed later; a customer number is assigned automatically.</p>
    <div class="v8-form-grid">
      <div class="wide"><span class="field-label">Full name <span class="v8-optional">optional</span></span><input class="text-input" id="nc-name" placeholder="Jordan Ramirez" autocomplete="name"></div>
      <div><span class="field-label">Country code <span class="v8-optional">optional</span></span><select class="text-input" id="nc-country" onchange="v8CountryChanged(this.value)">${v8CountryOptions()}</select><input class="text-input" id="nc-country-custom" style="display:none;margin-top:6px" placeholder="+33"></div>
      <div><span class="field-label">Phone number <span class="v8-optional">optional</span></span><input class="text-input" id="nc-phone" type="tel" inputmode="tel" placeholder="212 555 0100" autocomplete="tel-national"></div>
      <div class="wide"><span class="field-label">Email <span class="v8-optional">optional</span></span><input class="text-input" id="nc-email" type="email" placeholder="jordan@email.com" autocomplete="email"></div>
      <div class="wide"><span class="field-label">Street address <span class="v8-optional">optional</span></span><input class="text-input" id="nc-street" placeholder="201 East 17th Street" autocomplete="street-address"></div>
      <div><span class="field-label">Apartment / Unit <span class="v8-optional">optional</span></span><input class="text-input" id="nc-apartment" placeholder="8A"></div>
      <div><span class="field-label">ZIP code <span class="v8-optional">optional</span></span><input class="text-input" id="nc-zip" inputmode="numeric" placeholder="10003" autocomplete="postal-code"></div>
      <div><span class="field-label">City <span class="v8-optional">optional</span></span><input class="text-input" id="nc-city" placeholder="New York" autocomplete="address-level2"></div>
      <div><span class="field-label">State / Region <span class="v8-optional">optional</span></span><input class="text-input" id="nc-state" placeholder="NY" autocomplete="address-level1"></div>
    </div>
    <span class="field-label" style="margin-top:16px">Preferred service method</span><div class="segmented" style="margin-bottom:16px"><div class="seg selected" id="nc-seg-pickup" onclick="posSetNcChannel('pickup')">${icon('box',14)} Counter Pickup</div><div class="seg" id="nc-seg-delivery" onclick="posSetNcChannel('delivery')">${icon('truck',14)} Delivery</div></div>
    <div class="pref-row" style="padding-top:0"><div><div class="pr-label">Securely save a card on file</div><div class="pr-sub">Enter once; staff see only brand and last four afterward.</div></div><div class="switch" id="nc-card-switch" onclick="posToggleNcCard()"></div></div>
    <div id="nc-card-fields" style="display:none;margin:10px 0 8px"><div class="v8-secure-note"><strong>Prototype:</strong> use a test card. Production card fields go directly to Clover/Fiserv.</div><div class="v8-form-grid"><div class="wide"><span class="field-label">Card number</span><input class="text-input" id="nc-card-number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242"></div><div><span class="field-label">Expiration</span><input class="text-input" id="nc-card-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY"></div><div><span class="field-label">After saving</span><div class="v8-secure-note" style="margin:0">Only •••• last 4 remains visible.</div></div></div></div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="posSaveNewCustomer()">${icon('checkcircle',16)} Add Customer</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
};
posSaveNewCustomer = function v14SaveNewCustomer() {
  const get = id => String(document.getElementById(id)?.value || '').trim();
  const number = v9NextCustomerNumber();
  const enteredName = get('nc-name');
  const name = enteredName || `Customer ${number}`;
  let country = get('nc-country'); if (country === 'custom') country = get('nc-country-custom');
  const localPhone = get('nc-phone');
  const phone = localPhone ? v8FormatPhone(country || '+1', localPhone) : '';
  if (localPhone && phone.replace(/\D/g, '').length < 7) return toast('That phone number appears incomplete; leave it blank or enter the full number', false, 'alerttriangle');
  const email = get('nc-email'), street = get('nc-street'), apartment = get('nc-apartment'), city = get('nc-city'), region = get('nc-state').toUpperCase(), zip = get('nc-zip');
  const paymentMethods = [];
  if (ncDraft.saveCard) {
    const cardNumber = get('nc-card-number'), exp = get('nc-card-exp');
    if (!v8Luhn(cardNumber)) return toast('Enter a valid test card number or turn off Save Card', false, 'alerttriangle');
    if (!v8ValidExpiry(exp)) return toast('Enter a valid future expiration as MM/YY', false, 'alerttriangle');
    paymentMethods.push(v8TokenizeDemoCard(cardNumber));
  }
  const hasAddress = !!(street || apartment || city || region || zip);
  const addresses = hasAddress ? [{ id:uid('addr_'), label:'Home', street, apartment, city, state:region, postalCode:zip, line1:[street, apartment ? `Apt ${apartment}` : ''].filter(Boolean).join(', '), line2:[city, region, zip].filter(Boolean).join(' '), building:street || 'Address pending' }] : [];
  const customer = { id:uid('cust_'), customerNumber:number, name, initials:v14Initials(name), phone, email, memberSince:new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'}), points:0, storeCredit:0, preferredChannel:ncDraft.channel, addresses, paymentMethods, garmentPrefs:{starch:'light',fold:'hang',fragranceFree:false,notes:''} };
  state.customers.push(customer);
  /* Intentionally do not select this account at Counter. The next walk-in begins clean. */
  if (counterDraft) { counterDraft.customerId = null; counterDraft.guestName = ''; }
  posCustomerSearch = '';
  recordSync(`New customer created · ${name} · ${number}`); saveState(); closePosModal(); renderPosContent();
  toast(`${name} added as ${number}. No counter customer was selected.`, true, 'users');
  if (phone) fireAutomatedText('newCustomerWelcome', customer);
};

/* ------------------------- COUNTER HOME AND PICKUP WORKFLOW ------------------------- */
let v14CounterMode = 'home';
let v14PickupState = { query:'', customerId:null, selected:new Set(), stage:'select' };
function v14CounterHomeHTML(simple) {
  return `<div class="v14-counter-home"><div class="${simple ? 'v13-simple-head' : 'v6-section-title'}" style="justify-content:center;text-align:center"><div><h2 style="margin:0">Counter</h2><div class="v14-counter-kicker">Choose what the customer is here to do</div></div></div><div class="v14-counter-actions">
    <button class="v14-counter-action" onclick="v14OpenDropOff()"><span class="v14-action-icon">${icon('plus',42)}</span><strong>Drop Off</strong><span>Create one or multiple service tickets, set due dates, and print claim tickets.</span></button>
    <button class="v14-counter-action pickup" onclick="v14OpenPickup()"><span class="v14-action-icon">${icon('box',42)}</span><strong>Pick Up</strong><span>Find the customer, select finished tickets, collect any balance, and timestamp pickup.</span></button>
  </div></div>`;
}
function v14OpenDropOff() { v14CounterMode = 'dropoff'; if (!counterDraft) counterDraft = v8FreshCounterDraft(); renderPosContent(); }
function v14OpenPickup() { v14CounterMode = 'pickup'; v14PickupState = { query:'', customerId:null, selected:new Set(), stage:'select' }; renderPosContent(); setTimeout(() => document.getElementById('v14-pickup-search')?.focus(), 0); }
function v14CounterHome() { v14CounterMode = 'home'; v14PickupState = { query:'', customerId:null, selected:new Set(), stage:'select' }; renderPosContent(); }

const v14BasePosGoTo = posGoTo;
posGoTo = function v14PosGoTo(nav) { if (nav === 'counter') v14CounterMode = 'home'; return v14BasePosGoTo(nav); };

function v14PickupOrders() {
  if (!v14PickupState.customerId) return [];
  return state.orders.filter(order => order.customerId === v14PickupState.customerId && order.fulfillment !== 'delivery' && order.channel !== 'delivery' && v12IsOpen(order));
}
function v14PickupSelectedOrders() { const ids = v14PickupState.selected; return v14PickupOrders().filter(order => ids.has(order.id)); }
function v14PickupAmount(orders) { return orders.filter(order => !order.paid).reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.discount || 0) + Number(order.surcharge || 0)), 0); }
function v14PickupSearchInput(value) { v14PickupState.query = value; renderPosContent(); setTimeout(() => { const input=document.getElementById('v14-pickup-search'); if(input){input.focus();try{input.setSelectionRange(value.length,value.length);}catch(error){}} }, 0); }
function v14PickupSearchKeydown(event) {
  if (event.key !== 'Enter') return; event.preventDefault();
  const results = v8CustomerSearchResults(v14PickupState.query); if (results.length) v14ChoosePickupCustomer(results[0].id); else toast('No customer matched that search', false, 'alerttriangle');
}
function v14ChoosePickupCustomer(customerId) {
  v14PickupState.customerId = customerId; v14PickupState.stage = 'select'; v14PickupState.selected = new Set();
  v14PickupOrders().filter(order => order.status === 'ready' || order.readyAt || order.rack || order.conveyorNumber).forEach(order => v14PickupState.selected.add(order.id));
  renderPosContent();
}
function v14TogglePickupOrder(orderId) {
  if (v14PickupState.selected.has(orderId)) v14PickupState.selected.delete(orderId); else v14PickupState.selected.add(orderId);
  renderPosContent();
}
function v14PickupContinue() {
  const orders = v14PickupSelectedOrders(); if (!orders.length) return toast('Select at least one ticket to pick up', false, 'alerttriangle');
  if (v14PickupAmount(orders) > 0) { v14PickupState.stage = 'pay'; renderPosContent(); } else v14CompletePickup(null);
}
function v14CompletePickup(method) {
  const orders = v14PickupSelectedOrders(); if (!orders.length) return;
  const balance = v14PickupAmount(orders); if (balance > 0 && !method) return;
  const now = v8NowISO(), label = v8TimeLabel(now);
  orders.forEach(order => {
    if (!order.paid) {
      const base = Math.max(0, Number(order.total || 0) - Number(order.discount || 0) + Number(order.surcharge || 0));
      if (method === 'card') { order.surcharge = Math.round(Math.max(0, Number(order.total || 0) - Number(order.discount || 0)) * .03 * 100) / 100; order.amountCharged = Math.max(0, Number(order.total || 0) - Number(order.discount || 0)) + order.surcharge; }
      else order.amountCharged = base;
      order.paid = true; order.paymentMethod = method; order.paidAt = now;
      v8AddActivity(order, 'payment', `Payment recorded at pickup · ${method} · ${money(order.amountCharged || base)}`);
    }
    const stages = getStages(order), pickupIndex = stages.findIndex(stage => stage.id === 'picked_up');
    order.status = 'picked_up'; if (pickupIndex >= 0) order.stageIndex = pickupIndex;
    order.pickedUpAt = now; order.rack = null; order.conveyorNumber = null;
    v8AddActivity(order, 'pickup', `Picked up at counter · ${label}`);
  });
  recordSync(`Counter pickup · ${orders.map(order => '#' + (order.ticket || order.id)).join(', ')} · ${label}`); saveState();
  const customer = customerById(v14PickupState.customerId);
  openPosModal(`<h3>${icon('checkcircle',18)} Pickup Complete</h3><p class="pm-sub">${esc(customer?.name || 'Customer')} · ${orders.length} ticket${orders.length === 1 ? '' : 's'} · ${esc(label)}</p>${orders.map(order => `<div class="v5-subticket"><strong>#${esc(order.ticket || order.id)}</strong><div class="row-sub">Picked up · ${esc(label)} · ${order.paid ? 'Paid' : ''}</div></div>`).join('')}<button class="btn btn-primary btn-block" style="margin-top:12px" onclick="closePosModal();v14CounterHome()">Done</button>`);
  v14CounterMode = 'home';
}
function v14PickupHTML(simple) {
  const customer = v14PickupState.customerId ? customerById(v14PickupState.customerId) : null;
  const back = `<button class="btn btn-ghost v14-counter-back" onclick="v14CounterHome()">${icon('chevronleft',14)} Back to Counter</button>`;
  if (!customer) {
    const results = v14PickupState.query.trim() ? v8CustomerSearchResults(v14PickupState.query) : [];
    return `<div class="v14-pickup-shell">${back}<div class="pos-card"><h2 style="margin-top:0">Customer Pickup</h2><p class="v2-note">Search by name, customer number, phone, ticket, tag, or address. Press Enter to open the first match.</p><input id="v14-pickup-search" class="text-input v14-pickup-search" autocomplete="off" placeholder="Customer name, number, phone, ticket or tag…" value="${esc(v14PickupState.query)}" oninput="v14PickupSearchInput(this.value)" onkeydown="v14PickupSearchKeydown(event)"><div class="v14-pickup-results">${results.map(item => `<button class="v14-pickup-result" onclick="v14ChoosePickupCustomer('${item.id}')"><span class="avatar">${esc(item.initials)}</span><span style="flex:1"><strong>${esc(item.name)}</strong><small style="display:block;color:var(--ink-secondary)">${esc(item.customerNumber || '')}${item.phone ? ' · ' + esc(item.phone) : ''}</small></span>${icon('chevronright',18)}</button>`).join('')}</div></div></div>`;
  }
  const orders = v14PickupOrders(), selected = v14PickupSelectedOrders(), due = v14PickupAmount(selected), card = customer.paymentMethods?.find(method => method.default) || customer.paymentMethods?.[0];
  if (v14PickupState.stage === 'pay') {
    const cardFee = Math.round(due * .03 * 100) / 100;
    return `<div class="v14-pickup-shell">${back}<div class="pos-card"><h2 style="margin-top:0">Collect Payment</h2><div class="selected-customer-card"><span class="avatar">${esc(customer.initials)}</span><div><strong>${esc(customer.name)}</strong><div class="row-sub">${esc(customer.customerNumber || '')}${card ? ` · ${esc(card.brand)} •••• ${esc(card.last4)}` : ''}</div></div></div><div class="price-line"><span>Unpaid tickets</span><strong>${selected.filter(order => !order.paid).length}</strong></div><div class="price-line"><span>Balance</span><strong>${money(due)}</strong></div><div class="price-line"><span>Card convenience fee (3%)</span><strong>${money(cardFee)}</strong></div><div class="v14-pickup-total"><span>Card Total</span><strong>${money(due + cardFee)}</strong></div><div class="v14-pay-choice"><button class="v13-giant-btn primary" onclick="v14CompletePickup('cash')">${icon('cash',20)} Pay Cash · ${money(due)}</button><button class="v13-giant-btn primary" onclick="v14CompletePickup('card')">${icon('creditcard',20)} Pay Card · ${money(due + cardFee)}</button></div><button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="v14PickupState.stage='select';renderPosContent()">Back to Tickets</button></div></div>`;
  }
  return `<div class="v14-pickup-shell">${back}<div class="pos-card"><div class="v6-section-title"><div><h2 style="margin:0">${esc(customer.name)}</h2><div class="row-sub">${esc(customer.customerNumber || '')}${customer.phone ? ' · ' + esc(customer.phone) : ''}</div></div><button class="btn btn-ghost btn-sm" onclick="v14PickupState.customerId=null;v14PickupState.query='';renderPosContent()">Change Customer</button></div>${orders.length ? orders.map(order => { const checked=v14PickupState.selected.has(order.id), balance=v12OrderBalance(order); return `<label class="v14-pickup-ticket ${checked ? 'checked' : ''}"><input type="checkbox" ${checked ? 'checked' : ''} onchange="v14TogglePickupOrder('${order.id}')"><span><strong>#${esc(order.ticket || order.id)} · ${esc(V8_SERVICE_NAMES[v8OrderService(order)] || 'Service')}</strong><small>${esc(v8OrderLocation(order))} · ${esc(v12StatusLabel(order))} · Due ${esc(order.dueDate || '—')}</small></span><strong>${balance ? money(balance) + ' due' : 'Paid'}</strong></label>`; }).join('') : '<div class="table-empty">No open pickup tickets for this customer.</div>'}${orders.length ? `<div class="v14-pickup-total"><span>${selected.length} selected</span><strong>${due ? money(due) + ' due' : 'Paid'}</strong></div><button class="v13-giant-btn primary" onclick="v14PickupContinue()">${due ? `${icon('creditcard',20)} Continue to Payment` : `${icon('checkcircle',20)} Complete Pickup`}</button>` : ''}</div></div>`;
}

/* ------------------------- DUE DATES, RUSH AND SERVICE INSTRUCTIONS ------------------------- */
function v14DatePlus(days) { const date=new Date(); date.setDate(date.getDate()+days); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function v14GroupKey(group) { return group.key || group.service; }
function v14SetDueDate(key, value, rush) {
  v14EnsureDraft(counterDraft); counterDraft.serviceDueDates[key] = value;
  const rushGroups = new Set(counterDraft.rushGroups || []);
  if (rush) rushGroups.add(key); else rushGroups.delete(key);
  counterDraft.rushGroups = [...rushGroups]; renderPosContent();
}
function v14DuePanelHTML(group) {
  const key=v14GroupKey(group), date=counterDraft.serviceDueDates[key] || counterDraft.serviceDueDates[group.service] || v8DefaultDue(group.service), rush=(counterDraft.rushGroups||[]).includes(key);
  return `<div class="v14-due-panel"><div class="v14-due-title"><strong>Due date · ${esc(V8_SERVICE_NAMES[group.service] || group.service)}</strong>${rush?'<span class="v14-rush-chip">RUSH · SAME DAY</span>':''}</div><div class="v14-due-control"><input class="text-input v14-due-input" type="date" value="${esc(date)}" onchange="v14SetDueDate('${esc(key)}',this.value,false)"><button class="v14-rush-btn ${rush?'active':''}" onclick="v14SetDueDate('${esc(key)}','${v14DatePlus(0)}',true)">RUSH</button><button class="v14-tomorrow-btn" onclick="v14SetDueDate('${esc(key)}','${v14DatePlus(1)}',false)">Tomorrow</button></div></div>`;
}
function v14EnhanceDueDates(content, simple) {
  const groups=v8DraftGroups(); if (!groups.length) return;
  if (simple) {
    const visit=content.querySelector?.('.v13-visit-card'), total=visit?.querySelector?.('.v13-total-banner'); if(!visit||!total)return;
    const wrap=document.createElement('div'); wrap.className='v14-simple-due-wrap'; wrap.innerHTML=groups.map(v14DuePanelHTML).join(''); visit.insertBefore(wrap,total); return;
  }
  const groupEls=[...content.querySelectorAll?.('.v8-ticket-group')||[]];
  groupEls.forEach((groupEl,index)=>{
    const group=groups[index]; if(!group)return;
    const input=groupEl.querySelector('input[type="date"]'); if(!input)return;
    const key=v14GroupKey(group), rush=(counterDraft.rushGroups||[]).includes(key);
    input.classList.add('v14-due-input'); input.value=counterDraft.serviceDueDates[key]||counterDraft.serviceDueDates[group.service]||v8DefaultDue(group.service);
    input.onchange=()=>v14SetDueDate(key,input.value,false);
    const control=document.createElement('div'); control.className='v14-due-control'; input.replaceWith(control); control.appendChild(input);
    const rushButton=document.createElement('button'); rushButton.className=`v14-rush-btn ${rush?'active':''}`; rushButton.textContent='RUSH'; rushButton.onclick=()=>v14SetDueDate(key,v14DatePlus(0),true); control.appendChild(rushButton);
    const tomorrow=document.createElement('button'); tomorrow.className='v14-tomorrow-btn'; tomorrow.textContent='Tomorrow'; tomorrow.onclick=()=>v14SetDueDate(key,v14DatePlus(1),false); control.appendChild(tomorrow);
    groupEl.classList.add('v14-due-panel'); if(rush)groupEl.querySelector('.v8-ticket-group-head')?.insertAdjacentHTML('beforeend','<span class="v14-rush-chip">RUSH · SAME DAY</span>');
  });
}
function v14InstructionRows(service) {
  const source=new Map((V14_SERVICE_INSTRUCTIONS[service]||[]).map(row=>[row.id,row]));
  return (state.v14InstructionOrder?.[service]||[]).map(id=>source.get(id)).filter(Boolean);
}
function v14ServiceInstructionHTML(service) {
  v14EnsureDraft(counterDraft); const selected=counterDraft.serviceInstructions[service]||[], open=!!counterDraft.instructionOpen[service];
  return `<div class="v14-instructions"><div class="v14-instruction-head"><strong>Special instructions · ${esc(V8_SERVICE_NAMES[service]||service)}</strong><button class="v14-instruction-toggle" onclick="v14ToggleInstructionPanel('${service}')">${open?'Hide':'Add special instructions'}</button></div>${open?`<div class="v14-instruction-options">${v14InstructionRows(service).map(row=>`<button class="v14-instruction-chip ${selected.includes(row.id)?'selected':''}" onclick="v14ToggleInstruction('${service}','${row.id}')">${esc(row.label)}</button>`).join('')}</div><input class="text-input v14-instruction-custom" placeholder="Other ${esc(V8_SERVICE_NAMES[service]||service)} instruction…" value="${esc(counterDraft.serviceInstructionNotes[service]||'')}" oninput="v14SetInstructionNote('${service}',this.value)">`:''}</div>`;
}
function v14ToggleInstructionPanel(service) { v14EnsureDraft(counterDraft); counterDraft.instructionOpen[service]=!counterDraft.instructionOpen[service]; renderPosContent(); }
function v14ToggleInstruction(service,id) { v14EnsureDraft(counterDraft); const list=counterDraft.serviceInstructions[service]||[]; const index=list.indexOf(id); if(index>=0)list.splice(index,1);else list.push(id); renderPosContent(); }
function v14SetInstructionNote(service,value) { v14EnsureDraft(counterDraft); counterDraft.serviceInstructionNotes[service]=value; }
function v14InstructionText(service) {
  v14EnsureDraft(counterDraft); const ids=counterDraft.serviceInstructions[service]||[], labels=v14InstructionRows(service).filter(row=>ids.includes(row.id)).map(row=>row.label), custom=String(counterDraft.serviceInstructionNotes[service]||'').trim();
  return [...labels,custom].filter(Boolean).join(' · ');
}
function v14ReplaceInstructionCard(content, simple) {
  const service=counterDraft.serviceMode || 'dryclean';
  if(simple){const cards=[...content.querySelectorAll?.('.v13-scan-card')||[]], builder=cards.at(-1); if(builder&&!builder.querySelector('.v14-instructions'))builder.insertAdjacentHTML('beforeend',v14ServiceInstructionHTML(service));return;}
  const heading=[...content.querySelectorAll?.('.pos-card h3')||[]].find(node=>/Special Instructions/i.test(node.textContent||'')); const card=heading?.closest?.('.pos-card'); if(!card)return;
  card.innerHTML=`<h3>Service Instructions & Photos</h3>${v14ServiceInstructionHTML(service)}<div class="photo-grid" style="margin-top:12px">${(counterDraft.photos||[]).map(photo=>photoThumbHTML(photo,`posRemoveCounterPhoto('${photo.id}')`)).join('')}<label class="photo-add-btn">${icon('camera',20)}<span>Add Photo</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="posCaptureCounterPhoto(event)"></label></div>`;
}
function v14SimpleServiceOptions(content) {
  const service=counterDraft.serviceMode, cards=[...content.querySelectorAll?.('.v13-scan-card')||[]], builder=cards.at(-1); if(!builder)return;
  let html='';
  if(service==='dryclean')html=`<div class="v14-instructions" style="text-align:left"><div class="v14-instruction-head"><strong>Details / upcharges <span class="v8-optional">only when needed</span></strong></div><div class="v14-instruction-options"><button class="v14-instruction-chip ${['standard','cotton'].includes(counterDraft.builder.materialId)?'selected':''}" onclick="posSetBuilderMaterial('standard')">No special material</button>${v8UpchargeMaterials().map(material=>`<button class="v14-instruction-chip ${counterDraft.builder.materialId===material.id?'selected':''}" onclick="posSetBuilderMaterial('${material.id}')">${esc(material.name)} · ×${material.multiplier.toFixed(2)}</button>`).join('')}</div>${v8IsPants(counterDraft.builder.garmentId)?`<div class="v14-instruction-options"><button class="v14-instruction-chip ${!counterDraft.crease?'selected':''}" onclick="v4SetCrease('')">No preference</button><button class="v14-instruction-chip ${counterDraft.crease==='crease'?'selected':''}" onclick="v4SetCrease('crease')">Crease</button><button class="v14-instruction-chip ${counterDraft.crease==='nocrease'?'selected':''}" onclick="v4SetCrease('nocrease')">No crease</button></div>`:''}</div>`;
  if(service==='washfold')html=`<div class="v14-instructions" style="text-align:left"><strong>Wash & Fold preferences</strong><div class="v14-instruction-options">${WF_UPCHARGES.map(option=>`<button class="v14-instruction-chip ${counterDraft.wf.options.includes(option.id)?'selected':''}" onclick="v4ToggleWfOption('${option.id}')">${esc(option.name)}${option.price?' · +'+money(option.price):''}</button>`).join('')}</div><span class="field-label" style="margin-top:10px">Bag color</span><select class="text-input" onchange="v4SetWfField('bagColor',this.value)">${BAG_COLORS.map(color=>`<option ${counterDraft.wf.bagColor===color?'selected':''}>${esc(color)}</option>`).join('')}</select></div>`;
  if(service==='shirts')html=`<div class="v14-instructions" style="text-align:left"><strong>Shirt finish</strong><div class="v14-instruction-options"><button class="v14-instruction-chip ${counterDraft.shirts.packaging==='hanger'?'selected':''}" onclick="v4SetShirtPackaging('hanger')">On hanger</button><button class="v14-instruction-chip ${counterDraft.shirts.packaging==='box'?'selected':''}" onclick="v4SetShirtPackaging('box')">Boxed</button>${STARCH_LEVELS.map(level=>`<button class="v14-instruction-chip ${counterDraft.shirts.starch===level?'selected':''}" onclick="v4SetStarch('${level}')">${esc(level)} starch</button>`).join('')}</div></div>`;
  if(html)builder.insertAdjacentHTML('beforeend',html);
}
function v14SimpleAiCard(content) {
  if(content.querySelector?.('#v14-simple-ai'))return; const firstCard=content.querySelector?.('.v13-scan-card'); if(!firstCard)return;
  const card=document.createElement('div'); card.id='v14-simple-ai'; card.className='v13-scan-card'; card.style.textAlign='left'; card.innerHTML=`<div class="v8-ai-head"><h3 style="margin:0">${icon('sparkle',18)} AI Voice Intake</h3><button type="button" id="v3-mic-btn" class="v3-mic-btn ${counterDraft.aiListening?'listening':''}" onclick="posToggleAiVoice()" ${posVoiceSupported()?'':'disabled'}>${icon('mic',19)}</button></div><div class="v2-note" id="v3-mic-status">Handles multiple services, separate-ticket instructions, Wash & Press shirts, Press Only and No Charge.</div><textarea id="v3-ai-transcript" rows="3" oninput="counterDraft.aiTranscript=this.value" placeholder="Example: 5 shirts on hanger wash and press; on a separate ticket, two pants press only…">${esc(counterDraft.aiTranscript||'')}</textarea><button class="v13-giant-btn primary sm" style="margin-top:10px" onclick="v3VoiceParse()">${icon('sparkle',16)} Interpret & Create Drafts</button>${v10AiReviewHTML()}`; firstCard.insertAdjacentElement('afterend',card);
}
function v14MakeSimpleControlsAccessible(content) {
  content.querySelectorAll?.('.v13-tile,.v13-color-tile,.v13-cust-row').forEach(node=>{node.tabIndex=0;node.setAttribute('role','button');node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.click();}});});
  const customerInput=[...content.querySelectorAll?.('input')||[]].find(input=>/name or phone|nombre o teléfono/i.test(input.placeholder||'')); if(customerInput){customerInput.classList.add('v8-customer-search');customerInput.id='v14-simple-customer-search';}
}
function v14EnhanceCounter(content, simple) {
  content.insertAdjacentHTML?.('afterbegin',`<button class="btn btn-ghost v14-counter-back" onclick="v14CounterHome()">${icon('chevronleft',14)} Back to Counter</button>`);
  content.querySelectorAll?.('details.v8-special-details').forEach(details=>details.open=true);
  v14ReplaceInstructionCard(content,simple); if(simple){v14SimpleServiceOptions(content);v14SimpleAiCard(content);v14MakeSimpleControlsAccessible(content);}
  v14EnhanceDueDates(content,simple);
  const pending=content.querySelector?.('.v9-pending-card')||content.querySelector?.('.v13-visit-card'); if(pending&&!pending.querySelector?.('.v14-auto-note'))pending.insertAdjacentHTML('afterbegin','<p class="v14-auto-note">Selections move into this visit automatically when you choose the next garment/service or finish. “Add” is optional.</p>');
}

const v14BaseRenderPosCounter = renderPosCounter;
renderPosCounter = function v14RenderPosCounter(content) {
  if(v14CounterMode==='home'){content.innerHTML=v14CounterHomeHTML(false);return;}
  if(v14CounterMode==='pickup'){content.innerHTML=v14PickupHTML(false);return;}
  v14EnsureDraft(counterDraft);v14BaseRenderPosCounter(content);v14EnhanceCounter(content,false);
};
const v14BaseSimpleCounter = v13RenderSimpleCounter;
v13RenderSimpleCounter = function v14RenderSimpleCounter(content) {
  if(v14CounterMode==='home'){content.innerHTML=v14CounterHomeHTML(true);return;}
  if(v14CounterMode==='pickup'){content.innerHTML=v14PickupHTML(true);return;}
  v14EnsureDraft(counterDraft);v14BaseSimpleCounter(content);v14EnhanceCounter(content,true);
};

/* ------------------------- AI: WASH & PRESS, SEPARATE TICKETS, PRICE MODES ------------------------- */
const v14BaseParseShirts = v10ParseShirts;
v10ParseShirts = function v14ParseShirts(text) {
  const standard=v14BaseParseShirts(text); if(standard.length)return standard;
  if(!/\b(?:wash(?:ed)?\s+and\s+press(?:ed)?|wash\s*&\s*press|on\s+(?:a\s+)?hanger)\b/i.test(text)||!/\bshirts?\b/i.test(text))return[];
  const match=text.match(/\b(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+)?shirts?\b/i), before=text.slice(Math.max(0,(match?.index||0)-35),match?.index||0), beforeQty=before.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*$/i), raw=match?.[1]||beforeQty?.[1]||'1', qty=/^\d/.test(raw)?Number(raw):V10_NUMBER_WORDS[raw.toLowerCase()]||1, boxed=/\bbox(?:ed)?\b/i.test(text), garment=garmentById(boxed?'g_lshirt_box':'g_lshirt'); if(!garment)return[];
  const starch=(text.match(/\b(none|no|light|medium|heavy)\s+starch\b/i)?.[1]||'None').replace(/^./,c=>c.toUpperCase()).replace('No','None');
  return [{garmentId:garment.id,materialId:'standard',colorId:'white',qty,unitPrice:garment.basePrice,buttonType:'standard',garmentNote:`${boxed?'Boxed':'On hanger'} · Starch: ${starch} · Wash & Press · AI voice`,serviceType:'shirts'}];
};
v9LineMatches = function v14LineMatches(a,b) { return a.serviceType===b.serviceType&&a.garmentId===b.garmentId&&a.materialId===b.materialId&&a.colorId===b.colorId&&(a.buttonType||'')===(b.buttonType||'')&&(a.garmentNote||'')===(b.garmentNote||'')&&(a.ticketGroup||'')===(b.ticketGroup||''); };
v8DraftGroups = function v14DraftGroups() {
  const groups=new Map();(counterDraft?.items||[]).forEach(item=>{const service=v8ServiceForItem(item), ticketGroup=item.ticketGroup||'', key=ticketGroup?`${service}::${ticketGroup}`:service;if(!groups.has(key))groups.set(key,{service,key,items:[]});groups.get(key).items.push(item);});return [...groups.values()];
};
v9VisitTicketCount = function v14VisitTicketCount() { const saved=v8DraftGroups().length; if(!v9HasPendingDraft())return saved; const service=counterDraft.serviceMode; return saved+(v8DraftGroups().some(group=>group.service===service)?0:1)+(service==='alterations'&&counterDraft.alteration?.dryCleanAlso&&!v8DraftGroups().some(group=>group.service==='dryclean')?1:0); };
function v14ParseVoiceSegment(text,index,total,warnings,tags) {
  const shirtItems=v10ParseShirts(text), shirtCue=shirtItems.length&&/\b(?:wash(?:ed)?\s+and\s+press(?:ed)?|on\s+(?:a\s+)?hanger|laundered|boxed|starch)\b/i.test(text);
  let dry=v10ParseDryGarments(text,warnings); if(shirtCue)dry=dry.filter(item=>item.garmentId!=='g_shirt_dc');
  const items=[...dry,...v10ParseWashFold(text,warnings,tags),...shirtItems,...v10ParseAlteration(text)], group=total>1?`voice-${index+1}`:'';
  const noCharge=/\b(?:no\s+charge|complimentary|free\s+of\s+charge)\b/i.test(text), pressOnly=/\bpress(?:ing)?\s+only\b/i.test(text);
  items.forEach(item=>{if(group)item.ticketGroup=group;if(noCharge){item.unitPrice=0;item.garmentNote=[item.garmentNote,'NO CHARGE'].filter(Boolean).join(' · ');item.priceMode='no_charge';}else if(pressOnly&&v8ServiceForItem(item)==='dryclean'){item.unitPrice=Math.round(Number(item.unitPrice||0)*.60*100)/100;item.garmentNote=[item.garmentNote,'Press only · 60% price'].filter(Boolean).join(' · ');item.priceMode='press_only';}});
  return items;
}
v3VoiceParse = function v14VoiceParse() {
  const raw=String(document.getElementById('v3-ai-transcript')?.value||counterDraft.aiTranscript||'').trim();if(!raw)return toast('Dictate or type the drop-off first',false,'alerttriangle');
  const normalized=v10NormalizeVoice(raw), split=normalized.split(/\b(?:on\s+(?:a\s+)?)?separate\s+ticket(?:\s*,?\s*(?:put|add|include)(?:\s+the\s+following)?)?\b/i).map(part=>part.replace(/^[,;:\s]+|[,;:\s]+$/g,'')).filter(Boolean), segments=split.length?split:[normalized], warnings=[],tags=[],items=[];
  segments.forEach((segment,index)=>items.push(...v14ParseVoiceSegment(segment,index,segments.length,warnings,tags)));
  if(!items.length)return toast('I could not identify a garment, pound-laundry order, Wash & Press shirt order, or alteration.',false,'alerttriangle');
  const replace=counterDraft.items.length?confirm('AI found new lines. OK replaces the current visit lines; Cancel adds these lines to the existing visit.'):true;if(replace)counterDraft.items=[];
  items.forEach(v9AddOrMergeLine);tags.forEach(tag=>{if(!counterDraft.tags.includes(tag))counterDraft.tags.push(tag);});counterDraft.aiTranscript=raw;
  const groups=v8DraftGroups();groups.forEach(group=>counterDraft.serviceDueDates[group.key]||=v8DefaultDue(group.service));counterDraft.serviceMode=groups[0]?.service||'dryclean';
  const dryPieces=items.filter(item=>v8ServiceForItem(item)==='dryclean').reduce((sum,item)=>sum+Number(item.qty||0),0),wf=items.find(item=>item.serviceType==='washfold'),shirts=items.filter(item=>item.serviceType==='shirts').reduce((sum,item)=>sum+Number(item.qty||0),0),alterations=items.filter(item=>item.serviceType==='alterations').reduce((sum,item)=>sum+Number(item.qty||0),0),parts=[];
  if(dryPieces)parts.push(`${dryPieces} dry-clean/press piece${dryPieces===1?'':'s'}`);if(wf)parts.push(`${wf.qty} lb Wash & Fold`);if(shirts)parts.push(`${shirts} Wash & Press shirt${shirts===1?'':'s'}`);if(alterations)parts.push(`${alterations} alteration${alterations===1?'':'s'}`);
  if(segments.length>1)warnings.push(`“Separate ticket” was heard: ${groups.length} physical tickets will be created.`);
  counterDraft.aiInterpretation={summary:`${parts.join(' + ')} across ${groups.length} ticket${groups.length===1?'':'s'}`,lines:items.map(v10VoiceItemLabel),warnings,at:v8NowISO()};counterDraft.notes='';
  toast(`${groups.length} ticket draft${groups.length===1?'':'s'} created and ready to review`,true,'sparkle');renderPosContent();
};

/* ------------------------- CREATE DISTINCT TICKETS WITH DISTINCT DUE DATES ------------------------- */
posCompleteDropOff = function v14CompleteDropOff() {
  v9CommitPendingCurrentService(false,false);v14EnsureDraft(counterDraft);const draft=counterDraft,groups=v8DraftGroups();if(!groups.length)return;
  const customer=draft.customerId?customerById(draft.customerId):null;if(draft.fulfillment==='delivery'&&(!customer||!customer.addresses?.length))return toast('Return delivery needs an address on the customer profile',false,'alerttriangle');
  const batchId=uid('visit_'),created=[];
  groups.forEach(group=>{const service=group.service,key=v14GroupKey(group),ticket=state.nextTicket++,dueDate=draft.serviceDueDates[key]||draft.serviceDueDates[service]||v8DefaultDue(service),subtotal=v8ServiceSubtotal(group.items),surcharge=draft.payNow&&draft.paymentMethod==='card'?Math.round(subtotal*.03*100)/100:0,pieceCount=v8PieceCount(group.items,service),rush=(draft.rushGroups||[]).includes(key),instruction=v14InstructionText(service),notes=[rush?'RUSH — SAME DAY':'',instruction].filter(Boolean).join(' · ');
    const order={id:`HC-${ticket}`,ticket:String(ticket),barcode:v8MakeBarcode(ticket),channel:draft.fulfillment==='delivery'?'delivery':'counter',fulfillment:draft.fulfillment,customerId:draft.customerId,customerName:draft.customerId?null:(draft.guestName.trim()||'Walk-in Guest'),address:draft.fulfillment==='delivery'?customer.addresses[0].id:null,items:`${V8_SERVICE_NAMES[service]} · ${pieceCount}${service==='washfold'?' bag':' piece'+(pieceCount===1?'':'s')}`,services:[service],serviceType:service,total:subtotal,subtotal,surcharge,amountCharged:draft.payNow?subtotal+surcharge:null,lineItems:group.items.map(item=>({...item})),itemsDetail:group.items.map(item=>({...item})),status:draft.fulfillment==='delivery'?'in_cleaning':'dropped_off',stageIndex:draft.fulfillment==='delivery'?2:0,rack:null,placedLabel:'Today',dateLabel:'Today',createdAt:v8NowISO(),dueDate,dueTime:rush?'AS SOON AS POSSIBLE':'04:00 PM',rush,paid:false,paymentMethod:null,pointsAwarded:false,notes,tags:[...draft.tags.filter(tag=>tag!=='rush'),...(rush?['rush']:[])],garmentPhotos:draft.photos.slice(),deliveryPhotos:[],assignedDriverId:null,invoiced:false,intakeBatchId:batchId,pieceCount,tagNumber:null,tagNumbers:[],tagColor:null,tagColorHex:null,tagAssignedAt:null,register:state.session?.register||'Store POS',createdBy:v6CurrentStaff()?.name||'Staff',activity:[],aiTranscript:draft.aiTranscript||null,ticketGroup:key};
    if(draft.payNow){order.paymentMethod=draft.paymentMethod;finalizePayment(order);}v8AddActivity(order,'created',`${V8_SERVICE_NAMES[service]} ticket created · awaiting physical tag assignment`,{dueDate,barcode:order.barcode,rush});state.orders.unshift(order);created.push(order);recordSync(`Ticket #${ticket} created · ${V8_SERVICE_NAMES[service]} · Due ${dueDate}${rush?' · RUSH':''}`);
  });
  saveState();const visitTotal=created.reduce((sum,order)=>sum+order.total+(order.surcharge||0),0);counterDraft=v8FreshCounterDraft();posCustomerSearch='';state.posNav='orders';v14CounterMode='home';renderPosContent();
  openPosModal(`<h3>${icon('checkcircle',17)} ${created.length} Separate Ticket${created.length===1?'':'s'} Created</h3><p class="pm-sub">One customer visit · ${money(visitTotal)} total</p>${created.map(order=>`<div class="v5-subticket"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong>#${esc(order.ticket)} · ${esc(V8_SERVICE_NAMES[order.serviceType])}</strong><div class="row-sub">Due ${esc(order.dueDate)}${order.rush?' · RUSH':''} · ${money(order.total+(order.surcharge||0))} · ${esc(order.barcode)}</div></div><span class="v8-tag-chip v12-awaiting-tag">Assign tag after intake</span></div></div>`).join('')}<button class="btn btn-primary btn-block" onclick="v8PrintCreatedBatch('${batchId}')">${icon('printer',16)} Print All on Star TSP100IV</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Done</button>`);toast(`${created.length} ticket${created.length===1?'':'s'} created with unique barcodes`,true,'checkcircle');
};

/* ------------------------- KEYBOARD TICKET LIST + QUICK INLINE TAGS ------------------------- */
let v14LedgerSelectedId=null;
function v14QuickTag(orderId) {
  const order=state.orders.find(item=>item.id===orderId);if(!order)return;const input=document.getElementById(`v14-inline-tag-${orderId}`),select=document.getElementById(`v14-inline-color-${orderId}`),tag=v12NormalizeTag(input?.value);if(!tag)return toast('Type or scan a tag number',false,'alerttriangle');
  const collision=state.orders.find(other=>other.id!==order.id&&(other.tagNumbers||[other.tagNumber]).filter(Boolean).some(value=>String(value).toUpperCase()===tag));if(collision)return toast(`${tag} is already assigned to #${collision.ticket||collision.id}`,false,'alerttriangle');
  const color=V12_TAG_COLORS.find(item=>item.name===select?.value)||v12TagColor(order),old=(order.tagNumbers||[]).join(', ');order.tagNumbers=[tag];order.tagNumber=tag;order.tagColor=color.name;order.tagColorHex=color.hex;order.tagAssignedAt=v8NowISO();order.tagAssignedBy=v6CurrentStaff()?.name||'Staff';order.tagHistory=order.tagHistory||[];order.tagHistory.unshift({at:order.tagAssignedAt,by:order.tagAssignedBy,from:old||null,to:[tag],color:color.name});v8AddActivity(order,'tag_assign',`Quick tag assigned from Ticket List · ${tag} · ${color.name}`);recordSync(`Quick tag assignment · #${order.ticket||order.id} · ${tag} · ${color.name}`);saveState();toast(`#${order.ticket||order.id} → ${tag}`,true,'tag');renderPosContent();
}
function v14EnhanceLedger(content) {
  const head=content.querySelector?.('.v12-ledger-head .v2-note');if(head&&!content.querySelector?.('.v14-keyboard-hint'))head.insertAdjacentHTML('afterend','<div class="v14-keyboard-hint"><kbd>↑</kbd><kbd>↓</kbd> choose ticket <kbd>Enter</kbd> open details</div>');
  const orders=v12LedgerRows(),rows=[...content.querySelectorAll?.('.v12-ledger-table tbody tr')||[]];
  rows.forEach((row,index)=>{const order=orders[index];if(!order)return;row.tabIndex=0;row.dataset.orderId=order.id;if(order.id===v14LedgerSelectedId)row.classList.add('v14-ledger-selected');
    row.addEventListener('focus',()=>{v14LedgerSelectedId=order.id;rows.forEach(item=>item.classList.toggle('v14-ledger-selected',item===row));});
    row.addEventListener('click',event=>{if(event.target.closest('button,input,select'))return;row.focus();});
    row.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));rows[next]?.focus();rows[next]?.scrollIntoView?.({block:'nearest'});}else if(event.key==='Enter'){event.preventDefault();posOpenOrderDetail(order.id);}});
    if(!(order.tagNumbers||[]).length&&order.status!=='voided'){const cell=row.children?.[6];if(cell&&!cell.querySelector('.v14-inline-tag')){const suggested=v12TagColor(order);cell.insertAdjacentHTML('beforeend',`<div class="v14-inline-tag"><select id="v14-inline-color-${order.id}" aria-label="Tag color">${V12_TAG_COLORS.map(color=>`<option ${color.name===suggested.name?'selected':''}>${esc(color.name)}</option>`).join('')}</select><input id="v14-inline-tag-${order.id}" aria-label="Tag number" autocomplete="off" placeholder="Tag #" onkeydown="if(event.key==='Enter'){event.preventDefault();v14QuickTag('${order.id}')}"/><button onclick="v14QuickTag('${order.id}')">Assign Tag</button></div>`);}}
  });
}
const v14BaseTicketLedger=v12RenderTicketLedger;
v12RenderTicketLedger=function v14RenderTicketLedger(content){v14BaseTicketLedger(content);v14EnhanceLedger(content);};

/* ------------------------- RACK ENTER-TO-ASSIGN ------------------------- */
const v14BaseRenderRack=renderPosRack;
renderPosRack=function v14RenderRack(content){v14BaseRenderRack(content);content.querySelectorAll?.('input[id^="rack-input-"]').forEach(input=>{input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const orderId=input.id.replace('rack-input-','');v6AssignTypedRack(orderId);setTimeout(()=>content.querySelector('input[id^="rack-input-"]')?.focus(),0);}});});};
const v14BaseAssignTypedRack=v6AssignTypedRack;
v6AssignTypedRack=function v14AssignTypedRack(orderId){const result=v14BaseAssignTypedRack(orderId);setTimeout(()=>document.querySelector?.('input[id^="rack-input-"]')?.focus(),0);return result;};

/* ------------------------- DELIVERY QUEUE: TIMESTAMP ONLY WHEN DONE ------------------------- */
v8SubmitDeliveryScan=function v14QueueDeliveryScan(){const raw=state.deliveryUi.input,order=v3FindOrderByScan(raw);state.deliveryUi.input='';if(!order){toast(`No ticket or tag found for "${String(raw).trim()}"`,false,'alerttriangle');renderPosContent();return;}if(order.fulfillment!=='delivery'&&order.channel!=='delivery')return toast('That ticket is customer pickup—not delivery',false,'alerttriangle');if(['delivered','picked_up','voided'].includes(order.status))return toast(order.status==='voided'?'That ticket is voided':'That ticket is already completed',false,'alerttriangle');if(order.status!=='ready'&&!order.readyAt)return toast('Mark this ticket ready in Rack before scanning for delivery',false,'alerttriangle');if(!state.deliveryUi.scanned.includes(order.id))state.deliveryUi.scanned.push(order.id);else toast(`#${order.ticket||order.id} is already in this batch`,false,'alerttriangle');order.deliveryQueuedAt=v8NowISO();saveState();renderPosContent();setTimeout(()=>{document.getElementById('v8-delivery-scan')?.focus();document.getElementById('v13-delivery-scan')?.focus();},0);};
v8DeliveryGroupsHTML=function v14DeliveryGroupsHTML(orders){if(!orders.length)return'<div class="helper-text">Nothing scanned yet. Scan each ticket barcode before pressing Done.</div>';const groups={};orders.forEach(order=>{const address=v8AddressForOrder(order),building=address?.building||address?.street||v6OrderBuilding(order);(groups[building]=groups[building]||[]).push({order,address});});return`<div class="v8-delivery-batch">${Object.keys(groups).sort().map(building=>`<div class="v8-delivery-building">${icon('mappin',13)} ${esc(building)} · ${groups[building].length} ticket${groups[building].length===1?'':'s'}</div>${groups[building].map(({order,address})=>`<div class="v8-delivery-address"><div><strong>${esc(customerLabel(order))} · #${order.ticket||order.id}</strong><small>${esc(v8AddressText(address))} · Tag ${esc(order.tagNumber||'—')}</small></div><div style="text-align:right"><strong>Queued</strong><small>Timestamp when Done</small></div></div>`).join('')}`).join('')}</div>`;};
const v14BasePrintDeliveryBatch=v8PrintDeliveryBatch;
v8PrintDeliveryBatch=function v14FinishDeliveryBatch(){const orders=v8ScannedDeliveryOrders();if(!orders.length)return toast('Scan at least one delivery ticket first',false,'alerttriangle');const doneAt=v8NowISO();orders.forEach(order=>{order.deliveryScannedAt=doneAt;order.deliveryScanStatus='scanned';delete order.deliveryQueuedAt;v8AddActivity(order,'delivery_scan',`Delivery batch completed · ${v8TimeLabel(doneAt)}`,{barcode:order.barcode});recordSync(`Scanned for delivery · ${order.id} · ${order.barcode} · ${v8TimeLabel(doneAt)}`);});saveState();return v14BasePrintDeliveryBatch();};
V13_I18N.en['simple.delivery.print']='Done — Print & Send';V13_I18N.es['simple.delivery.print']='Listo — Imprimir y Enviar';
const v14BaseRenderDelivery=renderPosDelivery;
renderPosDelivery=function v14RenderDelivery(content){v14BaseRenderDelivery(content);const button=content.querySelector?.('button[onclick="v8PrintDeliveryBatch()"]');if(button){button.classList.add('v14-done-delivery');button.innerHTML=`${icon('checkcircle',16)} Done — Timestamp, Print & Update App`;}const scanCard=content.querySelector?.('.v8-scan-box');if(scanCard&&state.deliveryUi.scanned.length)scanCard.insertAdjacentHTML('beforeend',`<div class="v14-batch-pending">${icon('clock',14)} ${state.deliveryUi.scanned.length} ticket${state.deliveryUi.scanned.length===1?'':'s'} queued. No POS delivery timestamp is recorded until Done.</div>`);};

/* ------------------------- SETTINGS: ORDER SERVICE INSTRUCTIONS ------------------------- */
function v14MoveInstruction(service,index,direction){const list=state.v14InstructionOrder[service]||[],target=index+direction;if(target<0||target>=list.length)return;[list[index],list[target]]=[list[target],list[index]];saveState();renderPosContent();}
function v14InstructionSettingsHTML(){return`<div class="pos-card"><h3>${icon('list',17)} Special Instruction Order</h3><div class="v2-note" style="margin-bottom:12px">Each service shows only its own instructions. Use the arrows to control the order staff see.</div><div class="v14-settings-grid">${Object.keys(V14_SERVICE_INSTRUCTIONS).map(service=>`<div class="v14-settings-service"><h4>${esc(V8_SERVICE_NAMES[service])}</h4>${v14InstructionRows(service).map((row,index)=>`<div class="v14-settings-row"><span>${esc(row.label)}</span><button aria-label="Move up" onclick="v14MoveInstruction('${service}',${index},-1)">${icon('chevronup',13)}</button><button aria-label="Move down" onclick="v14MoveInstruction('${service}',${index},1)">${icon('chevrondown',13)}</button></div>`).join('')}</div>`).join('')}</div></div>`;}
const v14BaseRenderSettings=renderPosSettings;
renderPosSettings=function v14RenderSettings(content){v14BaseRenderSettings(content);content.insertAdjacentHTML('beforeend',v14InstructionSettingsHTML());};

/* Final V14 state migration and visible version marker. */
v14EnsureData();saveState();if(typeof renderPosRoot==='function')renderPosRoot();
