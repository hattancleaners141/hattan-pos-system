/* ============================================================================
   HATTAN OPS V16.2 — Star receipt-length fix + secure live foundation

   The browser receives only public processor configuration. Clover's private
   token, Supabase's service key, PIN hashes and payment vault identifiers stay
   inside Netlify Functions / Supabase. Shared state uses optimistic versioning
   plus Supabase Realtime notifications so multiple counters update together.
============================================================================ */

const V16_SHARED_KEYS = [
  'customers','staff','orders','clockLog','pendingSync','nextTicket','campaigns',
  'automatedTexts','rackSettings','printSettings','customerMemos',
  'interfaceSettings','garmentCatalog','materials','nextConveyorNumber',
  'deliveryBatches','nextDeliveryBatch','nextCustomerNumber','hardwareProfile',
  'v14InstructionOrder',
];

const v16Live = {
  config:null,
  booted:false,
  clientId:sessionStorage.getItem('hattan_v16_client') || `counter_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
  serverStaff:[],
  authenticated:false,
  version:0,
  baseline:null,
  applying:false,
  syncTimer:null,
  syncing:false,
  queued:false,
  syncStatus:'starting',
  realtimeClient:null,
  realtimeChannel:null,
  realtimeToken:'',
  pollTimer:null,
  pendingRender:false,
  clover:null,
  cloverElements:[],
};
sessionStorage.setItem('hattan_v16_client', v16Live.clientId);

function v16IsShared() {
  return ['shared','live'].includes(String(v16Live.config?.mode || '').toLowerCase());
}
function v16CloverReady() { return !!(v16Live.config?.clover?.configured && v16Live.config?.clover?.publicToken); }
function v16Api(path, options = {}) {
  return fetch(`${BACKEND_BASE}/${path}`, {
    credentials:'same-origin',
    ...options,
    headers:{ 'Content-Type':'application/json', ...(options.headers || {}) },
  }).then(async response => {
    let data = null;
    try { data = await response.json(); } catch (_) { /* empty response */ }
    return { ok:response.ok, status:response.status, data };
  }).catch(error => ({ ok:false, status:0, data:{ error:error.message }, networkError:true }));
}

function v16JsonEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch (_) { return false; }
}

function v16SafeClone(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map(item => v16SafeClone(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const safe = {};
  Object.entries(value).forEach(([key, item]) => {
    if (/^(pin|pinHash|pinSalt|pinIterations|processorToken|privateToken|cardNumber|cvv|cvc|securityCode)$/i.test(key)) return;
    if (/dataUrl/i.test(key)) return;
    safe[key] = v16SafeClone(item, depth + 1);
  });
  return safe;
}

function v16BuildSnapshot() {
  const snapshot = {};
  V16_SHARED_KEYS.forEach(key => {
    if (state[key] !== undefined) snapshot[key] = v16SafeClone(state[key]);
  });
  snapshot.staff = (snapshot.staff || []).map(staff => ({
    id:staff.id, name:staff.name, displayName:staff.displayName || staff.name,
    initials:staff.initials, manager:!!staff.manager, role:staff.manager ? 'Manager' : '',
    active:staff.active !== false, payRate:Number(staff.payRate || 0),
  }));
  snapshot.customers = (snapshot.customers || []).map(customer => ({
    ...customer,
    paymentMethods:(customer.paymentMethods || []).map(card => ({
      id:card.id, brand:card.brand || 'Card', last4:card.last4 || '',
      default:card.default !== false, processor:card.processor || (String(card.id || '').startsWith('clover_') ? 'clover' : 'legacy'),
    })),
  }));
  return snapshot;
}

function v16BlankSnapshot() {
  const snapshot = v16BuildSnapshot();
  snapshot.customers = [];
  snapshot.orders = [];
  snapshot.clockLog = [];
  snapshot.pendingSync = [];
  snapshot.deliveryBatches = [];
  snapshot.customerMemos = {};
  snapshot.staff = v16Live.serverStaff.map(staff => ({ ...staff, payRate:0 }));
  snapshot.nextCustomerNumber = 10001;
  return snapshot;
}

function v16MergeArray(local = [], base = [], remote = []) {
  const hasIds = [...local, ...base, ...remote].every(item => !item || typeof item !== 'object' || item.id !== undefined);
  if (!hasIds) return v16JsonEqual(local, base) ? remote : local;
  const map = list => new Map((list || []).filter(Boolean).map(item => [String(item.id), item]));
  const localMap = map(local), baseMap = map(base), remoteMap = map(remote);
  const ids = new Set([...remoteMap.keys(), ...baseMap.keys(), ...localMap.keys()]);
  const merged = [];
  ids.forEach(id => {
    const l = localMap.get(id), b = baseMap.get(id), r = remoteMap.get(id);
    const localChanged = !v16JsonEqual(l, b);
    if (localChanged) {
      if (l !== undefined && r !== undefined && b && typeof l === 'object' && typeof r === 'object') {
        const record = {};
        const fields = new Set([...Object.keys(r), ...Object.keys(b), ...Object.keys(l)]);
        fields.forEach(field => { record[field] = v16JsonEqual(l[field], b[field]) ? r[field] : l[field]; });
        merged.push(record);
      } else if (l !== undefined) merged.push(l);
    } else if (r !== undefined) merged.push(r);
  });
  return merged;
}

function v16MergeSnapshots(local, base, remote) {
  const merged = {};
  const keys = new Set([...Object.keys(remote || {}), ...Object.keys(base || {}), ...Object.keys(local || {})]);
  keys.forEach(key => {
    const l = local?.[key], b = base?.[key], r = remote?.[key];
    if (Array.isArray(l) || Array.isArray(b) || Array.isArray(r)) merged[key] = v16MergeArray(l || [], b || [], r || []);
    else merged[key] = v16JsonEqual(l, b) ? r : l;
  });
  return merged;
}

function v16MergeStaffProfiles(snapshotStaff = []) {
  const profileMap = new Map((snapshotStaff || []).map(staff => [staff.id, staff]));
  if (!v16Live.serverStaff.length) return snapshotStaff;
  return v16Live.serverStaff.map(account => ({
    ...(profileMap.get(account.id) || {}), ...account, pin:'',
    payRate:Number(profileMap.get(account.id)?.payRate || 0),
  }));
}

function v16ApplySnapshot(snapshot, shouldRender = true) {
  if (!snapshot || typeof snapshot !== 'object') return;
  v16Live.applying = true;
  V16_SHARED_KEYS.forEach(key => {
    if (snapshot[key] !== undefined) state[key] = v16SafeClone(snapshot[key]);
  });
  state.staff = v16MergeStaffProfiles(snapshot.staff || []);
  if (typeof v8EnsureData === 'function') v8EnsureData();
  if (typeof v14EnsureData === 'function') v14EnsureData();
  v16Live.applying = false;
  if (shouldRender) v16SafeRender();
}

function v16SafeRender() {
  const active = document.activeElement;
  const typing = active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName) && document.body.contains(active);
  if (typing) {
    v16Live.pendingRender = true;
    active.addEventListener('blur', () => {
      if (!v16Live.pendingRender) return;
      v16Live.pendingRender = false;
      if (state.session?.loggedIn) renderPosContent(); else renderPosRoot();
    }, { once:true });
    return;
  }
  if (state.session?.loggedIn) renderPosContent(); else renderPosRoot();
}

function v16HasLocalChanges() {
  return !!v16Live.baseline && !v16JsonEqual(v16BuildSnapshot(), v16Live.baseline);
}

function v16ClearBrowserBusinessStorage() {
  if (!v16IsShared()) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* storage unavailable */ }
}

function v16ClearBusinessMemory() {
  state.customers = [];
  state.orders = [];
  state.clockLog = [];
  state.pendingSync = [];
  state.deliveryBatches = [];
  state.customerMemos = {};
}

const v16BaseSaveState = saveState;
saveState = function v16SaveState() {
  v16BaseSaveState();
  if (v16IsShared()) v16ClearBrowserBusinessStorage();
  if (!v16Live.applying && v16IsShared() && v16Live.authenticated) v16QueueSync();
};

function v16QueueSync() {
  clearTimeout(v16Live.syncTimer);
  v16Live.syncStatus = 'pending';
  renderConnPills();
  v16Live.syncTimer = setTimeout(v16PushState, 650);
}

async function v16PushState() {
  if (!v16IsShared() || !v16Live.authenticated) return;
  if (v16Live.syncing) { v16Live.queued = true; return; }
  v16Live.syncing = true;
  v16Live.syncStatus = 'syncing';
  renderConnPills();
  const local = v16BuildSnapshot();
  const response = await v16Api('state-sync', {
    method:'PUT',
    body:JSON.stringify({ snapshot:local, baseVersion:v16Live.version, clientId:v16Live.clientId }),
  });
  if (response.status === 409 && response.data?.snapshot) {
    const merged = v16MergeSnapshots(local, v16Live.baseline || {}, response.data.snapshot);
    v16Live.version = Number(response.data.version || 0);
    v16Live.baseline = v16SafeClone(response.data.snapshot);
    v16ApplySnapshot(merged, false);
    v16Live.syncing = false;
    v16Live.queued = false;
    await v16PushState();
    return;
  }
  if (response.ok) {
    v16Live.version = Number(response.data?.version || v16Live.version + 1);
    v16Live.baseline = v16SafeClone(local);
    v16Live.syncStatus = 'live';
  } else {
    v16Live.syncStatus = response.status === 401 ? 'signed-out' : 'offline';
    if (response.status === 401) v16Live.authenticated = false;
  }
  v16Live.syncing = false;
  renderConnPills();
  if (v16Live.queued) { v16Live.queued = false; v16QueueSync(); }
}

async function v16PullState(render = true) {
  const response = await v16Api('state-sync');
  if (!response.ok) {
    v16Live.syncStatus = response.status === 401 ? 'signed-out' : 'offline';
    renderConnPills();
    return response;
  }
  if (response.data?.exists) {
    const remote = response.data.snapshot || {};
    if (v16HasLocalChanges()) {
      const merged = v16MergeSnapshots(v16BuildSnapshot(), v16Live.baseline || {}, remote);
      v16Live.version = Number(response.data.version || 0);
      v16Live.baseline = v16SafeClone(remote);
      v16ApplySnapshot(merged, render);
      v16QueueSync();
    } else {
      v16Live.version = Number(response.data.version || 0);
      v16Live.baseline = v16SafeClone(remote);
      v16ApplySnapshot(remote, render);
    }
  }
  v16Live.syncStatus = 'live';
  renderConnPills();
  return response;
}

function v16LoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing && existing.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    if (!existing) document.head.appendChild(script);
  });
}

async function v16StartRealtime(token) {
  clearInterval(v16Live.pollTimer);
  if (!v16Live.config?.sync?.realtimeReady || !token) return v16StartPolling();
  try {
    await v16LoadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    const library = window.supabase;
    if (!library?.createClient) throw new Error('Supabase client did not load');
    v16Live.realtimeClient = library.createClient(v16Live.config.sync.url, v16Live.config.sync.publishableKey, {
      auth:{ persistSession:false, autoRefreshToken:false },
    });
    v16Live.realtimeClient.realtime.setAuth(token);
    if (v16Live.realtimeChannel) await v16Live.realtimeClient.removeChannel(v16Live.realtimeChannel);
    v16Live.realtimeChannel = v16Live.realtimeClient.channel(`hattan-${v16Live.config.storeId}-${v16Live.clientId}`)
      .on('postgres_changes', {
        event:'UPDATE', schema:'public', table:'pos_state',
        filter:`store_id=eq.${v16Live.config.storeId}`,
      }, payload => v16ReceiveRealtime(payload.new))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { v16Live.syncStatus = 'live'; renderConnPills(); }
        if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) v16StartPolling();
      });
  } catch (_) { v16StartPolling(); }
}

function v16ReceiveRealtime(row) {
  if (!row || row.updated_client === v16Live.clientId || Number(row.version || 0) <= v16Live.version) return;
  const remote = row.payload || {};
  if (v16HasLocalChanges()) {
    const merged = v16MergeSnapshots(v16BuildSnapshot(), v16Live.baseline || {}, remote);
    v16Live.version = Number(row.version || 0);
    v16Live.baseline = v16SafeClone(remote);
    v16ApplySnapshot(merged, true);
    v16QueueSync();
  } else {
    v16Live.version = Number(row.version || 0);
    v16Live.baseline = v16SafeClone(remote);
    v16ApplySnapshot(remote, true);
  }
  toast(`Updated from another counter · ${row.updated_by || 'staff'}`, true, 'refresh');
}

function v16StartPolling() {
  if (!v16IsShared() || !v16Live.authenticated || v16Live.pollTimer) return;
  v16Live.syncStatus = 'polling';
  renderConnPills();
  v16Live.pollTimer = setInterval(() => {
    if (!document.hidden && !v16Live.syncing) v16PullState(false);
  }, 5000);
}

const v16BaseConnPillHTML = connPillHTML;
connPillHTML = function v16ConnPillHTML() {
  if (!v16Live.config || !v16IsShared()) return `<div class="conn-pill offline v16-local-pill">${icon('wifioff',13)}<span>Local Demo Only</span></div>`;
  const labels = {
    starting:'Connecting…', pending:'Saving…', syncing:'Saving…', live:'Shared Live',
    polling:'Shared · 5 sec', offline:'Sync Offline', 'signed-out':'Sign In Required',
  };
  const good = ['live','polling'].includes(v16Live.syncStatus);
  return `<div class="conn-pill ${good ? 'online' : 'offline'} v16-sync-pill" title="${good ? 'This counter shares updates with the other counters' : 'Open Settings to check the live connection'}">${icon(good?'wifi':'wifioff',13)}<span>${labels[v16Live.syncStatus] || 'Connecting…'}</span></div>`;
};

async function v16FetchStaff() {
  const response = await v16Api('staff-list');
  if (!response.ok) return response;
  v16Live.serverStaff = response.data.staff || [];
  state.staff = v16MergeStaffProfiles(state.staff || []);
  return response;
}

function v16SetSession(staff) {
  const found = v16Live.serverStaff.find(item => item.id === staff.id) || staff;
  const now = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  v16Live.authenticated = true;
  state.session = { loggedIn:true, staffId:found.id, register:'Store POS', clockInTime:now };
  state.posNav = state.posNav || 'counter';
  loginDraft = { register:'Store POS', staffId:found.id, pin:'' };
}

const v16BaseCheckPin = checkPin;
checkPin = async function v16CheckPin() {
  if (!v16IsShared()) return v16BaseCheckPin();
  const staff = staffById(loginDraft.staffId);
  if (!staff || !/^\d{4}$/.test(loginDraft.pin)) return;
  document.getElementById('pos-root').innerHTML = `<div class="pos-login-wrap"><div class="pos-login-card pos-connecting"><div class="spinner"></div><h3>Secure sign-in…</h3><p class="helper-text">Verifying ${esc(staff.name)} with the Hattan server</p></div></div>`;
  const response = await v16Api('staff-login', { method:'POST', body:JSON.stringify({ staffId:staff.id, pin:loginDraft.pin }) });
  if (!response.ok) {
    loginDraft.pin = '';
    renderPosRoot();
    toast(response.data?.error || 'Could not sign in', false, 'alerttriangle');
    return;
  }
  v16SetSession(response.data.staff);
  v16Live.realtimeToken = response.data.realtimeToken || '';
  await v16PullState(false);
  renderPosRoot();
  await v16StartRealtime(v16Live.realtimeToken);
  toast(`Welcome back, ${response.data.staff.name.split(' ')[0]}!`, true, 'checkcircle');
};

const v16BaseSignOut = posSignOut;
posSignOut = async function v16SignOut() {
  if (!v16IsShared()) return v16BaseSignOut();
  if (v16Live.syncTimer) { clearTimeout(v16Live.syncTimer); await v16PushState(); }
  await v16Api('staff-logout', { method:'POST', body:'{}' });
  if (v16Live.realtimeClient && v16Live.realtimeChannel) v16Live.realtimeClient.removeChannel(v16Live.realtimeChannel);
  clearInterval(v16Live.pollTimer); v16Live.pollTimer = null;
  v16Live.authenticated = false;
  v16Live.baseline = null;
  v16Live.version = 0;
  state.session = { loggedIn:false, staffId:null, register:null, clockInTime:null };
  v16ClearBusinessMemory();
  loginDraft = { register:'Store POS', staffId:null, pin:'' };
  v16ClearBrowserBusinessStorage();
  renderPosRoot();
};

function v16SetupRequiredScreen(message) {
  document.getElementById('pos-root').innerHTML = `<div class="pos-login-wrap"><div class="pos-login-card v16-setup-gate"><div class="logo-mark" style="margin:0 auto 10px"></div><h1>Hattan Cleaners</h1><span class="v16-eyebrow">V16.2 LIVE SETUP</span><h2>Finish the secure server setup</h2><p>${esc(message || 'The shared database is not ready yet.')}</p><ol><li>Open <strong>LIVE-SETUP-GUIDE.md</strong> from the download.</li><li>Run <strong>supabase/schema.sql</strong> in Supabase.</li><li>Add the modern Supabase variables in Netlify and redeploy.</li></ol><button class="btn btn-primary btn-block" onclick="location.reload()">Check Again</button></div></div>`;
}

function v16BootstrapScreen() {
  document.getElementById('pos-root').innerHTML = `<div class="pos-login-wrap"><div class="pos-login-card v16-setup-gate"><div class="logo-mark" style="margin:0 auto 10px"></div><span class="v16-eyebrow">ONE-TIME SECURE SETUP</span><h2>Create the first manager</h2><p>This manager account is stored on the server. The PIN is salted and hashed; the original PIN is never saved.</p><span class="field-label">Manager name</span><input id="v16-bootstrap-name" class="text-input" autocomplete="name" placeholder="Your name"><span class="field-label">New 4-digit PIN</span><input id="v16-bootstrap-pin" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••"><span class="field-label">One-time setup code</span><input id="v16-bootstrap-code" class="text-input" type="password" autocomplete="off" placeholder="From Netlify HATTAN_BOOTSTRAP_CODE"><button class="btn btn-primary btn-block" onclick="v16BootstrapManager()">Create Manager & Start Blank Store</button><div id="v16-bootstrap-error" class="v16-form-error"></div></div></div>`;
}

async function v16BootstrapManager() {
  const button = document.activeElement?.matches?.('button') ? document.activeElement : null;
  if (button) button.disabled = true;
  const response = await v16Api('staff-bootstrap', { method:'POST', body:JSON.stringify({
    name:document.getElementById('v16-bootstrap-name')?.value,
    pin:document.getElementById('v16-bootstrap-pin')?.value,
    bootstrapCode:document.getElementById('v16-bootstrap-code')?.value,
  }) });
  if (!response.ok) {
    if (button) button.disabled = false;
    const error = document.getElementById('v16-bootstrap-error');
    if (error) error.textContent = response.data?.error || 'Setup failed';
    return;
  }
  await v16FetchStaff();
  v16SetSession(response.data.staff);
  const initialized = await v16InitializeSharedStore(true, false);
  if (!initialized.ok) return v16SetupRequiredScreen(initialized.data?.error || 'The database could not be initialized');
  renderPosRoot();
  const sessionResponse = await v16Api('session');
  v16Live.realtimeToken = sessionResponse.data?.realtimeToken || '';
  await v16StartRealtime(v16Live.realtimeToken);
  toast('Secure shared store created', true, 'checkcircle');
}

async function v16InitializeSharedStore(blank = true, confirmFirst = true) {
  if (confirmFirst) {
    const text = blank ? 'Create a blank shared store? Existing shared data will not be overwritten.' : 'Copy this browser’s current test data into the shared database? Use this only if you intentionally want the sample/current records.';
    if (!confirm(text)) return { ok:false, cancelled:true };
  }
  const current = await v16Api('state-sync');
  if (!current.ok) return current;
  if (current.data?.exists) return { ok:false, status:409, data:{ error:'Shared data already exists. This safety check prevents accidental overwrites.' } };
  const snapshot = blank ? v16BlankSnapshot() : v16BuildSnapshot();
  const response = await v16Api('state-sync', { method:'PUT', body:JSON.stringify({ snapshot, baseVersion:0, clientId:v16Live.clientId }) });
  if (response.ok) {
    v16Live.version = Number(response.data.version || 1);
    v16Live.baseline = v16SafeClone(snapshot);
    v16ApplySnapshot(snapshot, false);
    v16Live.syncStatus = 'live';
  }
  return response;
}

async function v16InitializeFromSettings(blank) {
  const response = await v16InitializeSharedStore(blank, true);
  if (response.ok) { toast(blank ? 'Blank shared store initialized' : 'Current browser data copied to shared store', true, 'checkcircle'); renderPosContent(); }
  else if (!response.cancelled) toast(response.data?.error || 'Could not initialize shared data', false, 'alerttriangle');
}

async function v16Boot() {
  const configResponse = await v16Api('runtime-config');
  v16Live.config = configResponse.ok ? configResponse.data : { mode:'local', sync:{}, clover:{} };
  v16Live.booted = true;
  if (!v16IsShared()) { v16Live.syncStatus = 'offline'; renderConnPills(); return; }
  const staffResponse = await v16FetchStaff();
  if (!staffResponse.ok) return v16SetupRequiredScreen(staffResponse.data?.error || 'Supabase could not be reached.');
  if (staffResponse.data.needsBootstrap) return v16BootstrapScreen();
  const sessionResponse = await v16Api('session');
  if (sessionResponse.ok && sessionResponse.data?.authenticated) {
    v16SetSession(sessionResponse.data.staff);
    v16Live.realtimeToken = sessionResponse.data.realtimeToken || '';
    const stateResponse = await v16PullState(false);
    if (stateResponse.ok && !stateResponse.data?.exists && sessionResponse.data.staff.manager) await v16InitializeSharedStore(true, false);
    renderPosRoot();
    await v16StartRealtime(v16Live.realtimeToken);
  } else {
    v16Live.authenticated = false;
    state.session = { loggedIn:false, staffId:null, register:null, clockInTime:null };
    v16ClearBusinessMemory();
    loginDraft = { register:'Store POS', staffId:null, pin:'' };
    v16ClearBrowserBusinessStorage();
    renderPosRoot();
  }
  renderConnPills();
}

/* ------------------------- SECURE STAFF ADMINISTRATION ------------------------- */
const v16BaseOpenAddUser = v14OpenAddUser;
v14OpenAddUser = function v16OpenAddUser(event) {
  if (!v16IsShared()) return v16BaseOpenAddUser(event);
  event?.stopPropagation?.();
  openPosModal(`<h3>${icon('users',18)} Add Staff Member</h3><p class="pm-sub">A signed-in manager can add staff. The PIN is sent through HTTPS and stored only as a one-way hash.</p><span class="field-label">Staff member name</span><input id="v14-new-staff-name" class="text-input" autocomplete="name" placeholder="First and last name" style="margin-bottom:10px"><span class="field-label">New 4-digit PIN</span><input id="v14-new-staff-pin" class="text-input" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="••••" style="margin-bottom:10px"><label class="pref-row" style="cursor:pointer"><div><div class="pr-label">Manager access</div><div class="pr-sub">Managers can issue processor refunds and manage live setup.</div></div><input id="v14-new-staff-manager" type="checkbox" style="width:22px;height:22px"></label><button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v14SaveNewUser()">Add Staff Member</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
};

const v16BaseSaveNewUser = v14SaveNewUser;
v14SaveNewUser = async function v16SaveNewUser() {
  if (!v16IsShared()) return v16BaseSaveNewUser();
  const name = String(document.getElementById('v14-new-staff-name')?.value || '').trim();
  const pin = String(document.getElementById('v14-new-staff-pin')?.value || '').replace(/\D/g,'');
  const manager = !!document.getElementById('v14-new-staff-manager')?.checked;
  const response = await v16Api('staff-admin', { method:'POST', body:JSON.stringify({ name, pin, manager }) });
  if (!response.ok) return toast(response.data?.error || 'Could not add staff', false, 'alerttriangle');
  v16Live.serverStaff.push(response.data.staff);
  state.staff = v16MergeStaffProfiles(state.staff);
  saveState(); closePosModal(); renderPosRoot(); toast(`${name} added securely`, true, 'users');
};

const v16BaseSaveChangedPin = v14SaveChangedPin;
v14SaveChangedPin = async function v16SaveChangedPin(staffId) {
  if (!v16IsShared()) return v16BaseSaveChangedPin(staffId);
  const currentPin = document.getElementById('v14-pin-current')?.value || '';
  const newPin = document.getElementById('v14-pin-new')?.value || '';
  const confirmPin = document.getElementById('v14-pin-confirm')?.value || '';
  if (newPin !== confirmPin) return toast('The new PIN entries do not match', false, 'alerttriangle');
  const response = await v16Api('staff-admin', { method:'PATCH', body:JSON.stringify({ staffId, currentPin, newPin }) });
  if (!response.ok) return toast(response.data?.error || 'Could not change PIN', false, 'alerttriangle');
  closePosModal(); renderPosRoot(); toast('PIN changed securely', true, 'lock');
};

const v16BaseSubmitPunch = v12SubmitPunch;
v12SubmitPunch = async function v16SubmitPunch(staffId) {
  if (!v16IsShared()) return v16BaseSubmitPunch(staffId);
  const staff = staffById(staffId), input = document.getElementById('v12-punch-pin');
  const response = await v16Api('staff-login', { method:'POST', body:JSON.stringify({ staffId, pin:input?.value || '', verifyOnly:true }) });
  if (!response.ok) { toast(response.data?.error || 'Incorrect employee PIN', false, 'alerttriangle'); if (input) { input.value=''; input.focus(); } return; }
  const now = new Date(), time = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}), open = v12OpenPunchForStaff(staff);
  if (open) { open.clockOut=time; open.clockOutAt=now.toISOString(); open.clockOutBy='Employee Punch Clock'; recordSync(`Employee punch out · ${staff.name} · ${time}`); toast(`${staff.name} punched out at ${time}`,true,'clock'); }
  else { state.clockLog.unshift({ id:uid('punch_'), staffId:staff.id, staffName:staff.name, register:'Employee Punch Clock', clockIn:time, clockInAt:now.toISOString(), clockOut:null, clockOutAt:null }); recordSync(`Employee punch in · ${staff.name} · ${time}`); toast(`${staff.name} punched in at ${time}`,true,'clock'); }
  saveState(); if (state.session?.loggedIn && state.posNav==='team') renderPosContent(); v12OpenPunchClock();
};

/* ------------------------- CLOVER HOSTED IFRAME / CARD VAULT ------------------------- */
function v16DestroyCloverElements() {
  (v16Live.cloverElements || []).forEach(element => { try { element.unmount(); } catch (_) {} });
  v16Live.cloverElements = [];
  v16Live.clover = null;
}

async function v16MountCloverCardForm(customer) {
  const status = document.getElementById('v16-card-status');
  try {
    await v16LoadScript(v16Live.config.clover.sdkUrl);
    if (!window.Clover) throw new Error('Clover secure fields did not load');
    v16DestroyCloverElements();
    const clover = new window.Clover(v16Live.config.clover.publicToken, { merchantId:v16Live.config.clover.merchantId, locale:'en-US' });
    const elements = clover.elements();
    const styles = { body:{ fontFamily:'Arial, sans-serif', fontSize:'16px' }, input:{ fontSize:'17px' } };
    const definitions = [
      ['CARD_NUMBER','#v16-card-number'], ['CARD_DATE','#v16-card-date'],
      ['CARD_CVV','#v16-card-cvv'], ['CARD_POSTAL_CODE','#v16-card-postal'],
    ];
    const mounted = definitions.map(([type,target]) => { const element = elements.create(type, styles); element.mount(target); return element; });
    v16Live.clover = clover;
    v16Live.cloverElements = mounted;
    if (status) { status.textContent = 'Secure Clover fields ready'; status.className = 'v16-card-status ready'; }
  } catch (error) {
    if (status) { status.textContent = error.message; status.className = 'v16-card-status error'; }
  }
}

const v16BaseOpenAddCard = v8OpenAddCard;
v8OpenAddCard = function v16OpenAddCard(customerId) {
  if (!v16IsShared()) return v16BaseOpenAddCard(customerId);
  const customer = customerById(customerId); if (!customer) return;
  if (!v16CloverReady()) return openPosModal(`<h3>${icon('creditcard',18)} Clover is not configured</h3><p class="pm-sub">Add the Clover public token, private token and Merchant ID in Netlify Environment variables. The private token must never be typed into this website.</p><button class="btn btn-primary btn-block" onclick="closePosModal();posGoTo('settings')">Open Live Setup</button>`);
  const savedCloverCard = (customer.paymentMethods || []).find(card => card.processor === 'clover');
  openPosModal(`<h3>${icon('creditcard',18)} ${savedCloverCard ? 'Replace' : 'Save'} Card Securely · ${esc(customer.name)}</h3><p class="pm-sub">Card data goes straight from Clover’s hosted fields to Clover. Hattan never stores or displays the full card number, expiration, or CVV.</p><div class="v16-clover-badge">${icon('lock',14)} Clover ${esc(v16Live.config.clover.environment)} · Private token stays on server</div>${savedCloverCard ? `<div class="v8-secure-note" style="margin-bottom:10px">Current card: ${esc(savedCloverCard.brand || 'Clover card')} ${savedCloverCard.last4 ? `•••• ${esc(savedCloverCard.last4)}` : '· secure credential saved'}. Saving a replacement revokes the previous Clover source first.</div>` : ''}<span class="field-label">Customer email required by Clover</span><input id="v16-card-email" class="text-input" type="email" autocomplete="email" value="${esc(customer.email || '')}" placeholder="customer@email.com"><div class="v16-card-grid"><div class="wide"><span class="field-label">Card number</span><div id="v16-card-number" class="v16-clover-field"></div></div><div><span class="field-label">Expiration</span><div id="v16-card-date" class="v16-clover-field"></div></div><div><span class="field-label">CVV</span><div id="v16-card-cvv" class="v16-clover-field"></div></div><div><span class="field-label">Billing ZIP</span><div id="v16-card-postal" class="v16-clover-field"></div></div></div><label class="v16-consent"><input id="v16-card-consent" type="checkbox"><span><strong>Cardholder consents to save this card</strong><small>Customer authorizes Hattan Cleaners to keep a secure Clover credential for future order charges and may request removal.</small></span></label><div id="v16-card-status" class="v16-card-status">Loading secure Clover fields…</div><button id="v16-save-card-btn" class="btn btn-primary btn-block" onclick="v16SaveCloverCard('${customer.id}')">${savedCloverCard ? 'Revoke Old Card & Save Replacement' : 'Save Card on File'}</button>${savedCloverCard && v6IsManager() ? `<button class="btn btn-danger btn-block" style="margin-top:8px" onclick="v16RemoveCloverCard('${customer.id}')">Remove Saved Card from Clover</button>` : ''}<button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="v16DestroyCloverElements();closePosModal()">Cancel</button>`);
  setTimeout(() => v16MountCloverCardForm(customer), 30);
};

async function v16SaveCloverCard(customerId) {
  const customer = customerById(customerId), button = document.getElementById('v16-save-card-btn'), status = document.getElementById('v16-card-status');
  if (!customer || !v16Live.clover) return toast('Clover secure fields are not ready', false, 'alerttriangle');
  if (!document.getElementById('v16-card-consent')?.checked) return toast('Cardholder consent is required', false, 'alerttriangle');
  const email = String(document.getElementById('v16-card-email')?.value || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter the customer email required by Clover', false, 'alerttriangle');
  if (button) button.disabled = true;
  if (status) { status.textContent = 'Tokenizing securely with Clover…'; status.className = 'v16-card-status'; }
  try {
    const tokenResult = await v16Live.clover.createToken();
    if (tokenResult?.errors) throw new Error(Object.values(tokenResult.errors).join(' · '));
    if (!tokenResult?.token) throw new Error('Clover did not return a card token');
    const response = await v16Api('clover-cards', { method:'POST', body:JSON.stringify({
      customerId:customer.id, token:tokenResult.token, email, name:customer.name,
      phone:customer.phone || '', consent:true,
    }) });
    if (!response.ok) throw new Error(response.data?.error || 'Clover could not save the card');
    customer.email = email;
    customer.paymentMethods = (customer.paymentMethods || []).filter(card => card.processor !== 'clover');
    customer.paymentMethods.unshift(response.data.card);
    saveState(); v16DestroyCloverElements(); closePosModal();
    toast(response.data.card.last4 ? `Clover card •••• ${response.data.card.last4} saved` : 'Clover card saved securely', true, 'creditcard');
    if (state.v7CustomerId === customer.id) renderV7CustomerProfile(); else renderPosContent();
  } catch (error) {
    if (button) button.disabled = false;
    if (status) { status.textContent = error.message; status.className = 'v16-card-status error'; }
  }
}

async function v16RemoveCloverCard(customerId) {
  const customer = customerById(customerId);
  if (!customer || !confirm(`Remove ${customer.name}’s saved card from Clover? It cannot be used for future batch charges.`)) return;
  const response = await v16Api('clover-cards', { method:'DELETE', body:JSON.stringify({ customerId }) });
  if (!response.ok) return toast(response.data?.error || 'Could not remove the Clover card', false, 'alerttriangle');
  customer.paymentMethods = (customer.paymentMethods || []).filter(card => card.processor !== 'clover');
  saveState(); v16DestroyCloverElements(); closePosModal();
  toast('Saved card removed from Clover', true, 'checkcircle');
  if (state.v7CustomerId === customer.id) renderV7CustomerProfile(); else renderPosContent();
}

const v16BaseToggleNcCard = posToggleNcCard;
posToggleNcCard = function v16ToggleNewCustomerCard() {
  if (!v16IsShared()) return v16BaseToggleNcCard();
  toast('Create the customer first, then use Add Card Securely from their profile', true, 'creditcard');
};

/* ------------------------- LIVE CARD-ON-FILE CHARGES AND REFUNDS ------------------------- */
const v16BaseChargeAll = v2ChargeAll;
v2ChargeAll = async function v16ChargeAll() {
  if (!v16IsShared() || !v16CloverReady()) return v16BaseChargeAll();
  const eligible = v2EligibleAutopayOrders(); if (!eligible.length) return;
  const environment = v16Live.config.clover.environment;
  const total = eligible.reduce((sum, order) => {
    const base = Math.max(0, Number(order.total || 0) - Number(order.discount || 0));
    return sum + base + Math.round(base * .03 * 100) / 100;
  }, 0);
  if (!confirm(`${environment === 'production' ? 'LIVE CHARGE' : 'SANDBOX TEST'}: charge ${eligible.length} card${eligible.length === 1 ? '' : 's'} for ${money(total)}?`)) return;
  eligible.forEach(order => { order.cloverIdempotencyKey = order.cloverIdempotencyKey || crypto.randomUUID(); });
  saveState();
  await v16PushState();
  let charged = 0, failed = 0;
  for (const order of eligible) {
    const customer = customerById(order.customerId), card = v2CardForCustomer(customer);
    const base = Math.max(0, Number(order.total || 0) - Number(order.discount || 0));
    const fee = Math.round(base * .03 * 100) / 100, amount = Math.round((base + fee) * 100) / 100;
    const idempotencyKey = order.cloverIdempotencyKey;
    const response = await v16Api('clover-charge', { method:'POST', body:JSON.stringify({
      orderId:order.id, ticket:order.ticket || order.id, customerId:customer.id,
      email:customer.email || '', amount, idempotencyKey,
      cardholderPresent:false,
    }) });
    if (!response.ok) { failed += 1; order.paymentError = response.data?.error || 'Charge failed'; recordSync(`Clover charge failed · ${order.id} · ${order.paymentError}`); continue; }
    const payment = response.data.payment;
    order.cloverChargeId = payment.id;
    order.paymentProcessor = 'clover';
    order.paymentStatus = 'paid';
    order.surcharge = fee;
    order.amountCharged = amount;
    order.amountPaid = amount;
    order.paymentMethod = `Clover card on file •${payment.last4 || card?.last4 || ''}`;
    order.paid = true;
    order.paidAt = new Date().toISOString();
    if (payment.last4 && card) { card.last4 = payment.last4; card.brand = payment.brand || card.brand; }
    if (!order.pointsAwarded && customer) { customer.points += Math.round(base); order.pointsAwarded = true; }
    charged += amount;
    recordSync(`Clover ${environment} charge succeeded · ${order.id} · ${money(amount)} · ${payment.id}`);
  }
  saveState();
  toast(`${eligible.length - failed} charged · ${money(charged)}${failed ? ` · ${failed} failed` : ''}`, failed === 0, failed ? 'alerttriangle' : 'checkcircle');
  renderPosContent();
};

const v16BaseRenderPayments = renderPosPayments;
renderPosPayments = function v16RenderPayments(content) {
  v16BaseRenderPayments(content);
  if (!v16IsShared()) return;
  const banner = content.querySelector('.warn-banner');
  if (banner) banner.innerHTML = `<span><strong>${v16CloverReady() ? `Clover ${esc(v16Live.config.clover.environment)} connected:` : 'Clover setup incomplete:'}</strong> ${v16CloverReady() ? 'charges are submitted by the secure Netlify server. Confirm the total before running a batch.' : 'open Settings → Live System Setup before charging cards.'}</span>`;
};

const v16BaseSubmitRefund = v15SubmitRefund;
v15SubmitRefund = async function v16SubmitRefund(orderId) {
  const method = document.getElementById('v15-refund-method')?.value;
  if (!v16IsShared() || !v16CloverReady() || method !== 'original') return v16BaseSubmitRefund(orderId);
  const order = state.orders.find(item => item.id === orderId); if (!order) return;
  const amount = Number(document.getElementById('v15-refund-amount')?.value || 0);
  const reason = document.getElementById('v15-refund-reason')?.value || '';
  if (!reason.trim()) return toast('Enter a reason for the refund', false, 'alerttriangle');
  if (!confirm(`${v16Live.config.clover.environment === 'production' ? 'LIVE REFUND' : 'SANDBOX REFUND'}: return ${money(amount)} to the original card?`)) return;
  const requestId = order.cloverRefundAttemptId || `refund_${crypto.randomUUID()}`;
  order.cloverRefundAttemptId = requestId;
  saveState();
  await v16PushState();
  const response = await v16Api('clover-refund', { method:'POST', body:JSON.stringify({
    orderId:order.id, customerId:order.customerId, chargeId:order.cloverChargeId || '', amount, reason, requestId,
  }) });
  if (!response.ok) return toast(response.data?.error || 'Clover refund failed', false, 'alerttriangle');
  const result = v15ApplyRefund(orderId, { amount, method:'original', reason });
  if (!result.ok) return toast(result.error, false, 'alerttriangle');
  result.refund.processorStatus = 'succeeded';
  result.refund.processorRefundId = response.data.refund.id;
  result.refund.processorChargeId = response.data.refund.chargeId;
  order.cloverRefundAttemptId = null;
  saveState(); toast(`${money(amount)} returned to the original card`, true, 'refresh'); posOpenOrderDetail(orderId); renderPosContent();
};

/* ------------------------- SETTINGS / CONNECTION CHECKLIST ------------------------- */
function v16StatusPill(ok, yes, no) { return `<span class="v16-status ${ok ? 'ok' : 'missing'}">${ok ? icon('checkcircle',13) : icon('alerttriangle',13)} ${esc(ok ? yes : no)}</span>`; }

function v16LiveSetupCard() {
  const config = v16Live.config || { mode:'local', sync:{}, clover:{} };
  const shared = v16IsShared(), clover = config.clover || {}, sync = config.sync || {};
  const syncLabel = sync.realtimeReady ? 'Instant Realtime' : (sync.configured ? 'Secure 5-sec sync' : 'Needs variables');
  return `<div class="pos-card v16-live-card">
    <div class="v16-live-head"><div><span class="v16-eyebrow">V16.2 STAR PRINT FIX</span><h3>${icon('wifi',18)} Live System Setup</h3><div class="v2-note">Netlify hosts the app and protected server functions. Supabase shares data across every counter and app. Clover handles card data and payments.</div></div><span class="v16-mode ${config.mode}">${esc(String(config.mode || 'local').toUpperCase())}</span></div>
    <div class="v16-architecture"><div><small>APP + SERVER</small><strong>Netlify</strong><span>Static POS + protected Functions</span></div><b>→</b><div><small>SHARED DATA</small><strong>Supabase</strong><span>All counters + driver app</span></div><b>→</b><div><small>PAYMENTS</small><strong>Clover</strong><span>Hosted iframe + private API</span></div></div>
    <div class="v16-status-grid"><div><strong>Shared database</strong>${v16StatusPill(shared && sync.configured,'Configured','Needs variables')}</div><div><strong>Counter synchronization</strong>${v16StatusPill(shared && sync.configured,syncLabel,'Needs variables')}</div><div><strong>Clover public token</strong>${v16StatusPill(!!clover.publicToken,'Loaded safely','Not set')}</div><div><strong>Clover private token</strong>${v16StatusPill(!!clover.privateTokenOnServer,'Server only','Not set')}</div><div><strong>Clover environment</strong><span class="v16-status ${clover.environment === 'production' ? 'warn' : 'ok'}">${esc(clover.environment || 'sandbox')}</span></div><div><strong>Current sync</strong><span class="v16-status ${['live','polling'].includes(v16Live.syncStatus) ? 'ok' : 'missing'}">${esc(v16Live.syncStatus)}</span></div></div>
    <div class="v16-secret-rule"><strong>${icon('lock',15)} Where you put private keys</strong><p>Open Netlify → Project configuration → Environment variables. Mark <code>SUPABASE_SECRET_KEY</code>, <code>HATTAN_SESSION_SECRET</code> and <code>CLOVER_PRIVATE_TOKEN</code> as secret values. They intentionally have no input boxes in this POS and are never downloaded to a counter.</p></div>
    <div class="v16-variable-list"><code>HATTAN_MODE</code><code>HATTAN_SESSION_SECRET</code><code>SUPABASE_URL</code><code>SUPABASE_PUBLISHABLE_KEY</code><code>SUPABASE_SECRET_KEY</code><code>SUPABASE_JWT_PRIVATE_JWK (optional)</code><code>CLOVER_MERCHANT_ID</code><code>CLOVER_PUBLIC_TOKEN</code><code>CLOVER_PRIVATE_TOKEN</code></div>
    <div class="v16-live-actions"><button class="btn btn-primary" onclick="v16TestConnections()">${icon('refresh',15)} Test Secure Connections</button><button class="btn btn-secondary" onclick="v16ShowSetupSteps()">View 7 Setup Steps</button>${shared && v16Live.authenticated && !v16Live.baseline ? `<button class="btn btn-secondary" onclick="v16InitializeFromSettings(true)">Start Blank Shared Store</button><button class="btn btn-ghost" onclick="v16InitializeFromSettings(false)">Copy Browser Test Data</button>` : ''}<a class="btn btn-ghost" href="https://app.netlify.com/" target="_blank" rel="noopener">Open Netlify</a></div><div id="v16-health-result" class="v16-health-result"></div>
  </div>`;
}

const v16BaseRenderSettings = renderPosSettings;
renderPosSettings = function v16RenderSettings(content) {
  v16BaseRenderSettings(content);
  content.insertAdjacentHTML('afterbegin', v16LiveSetupCard());
};

async function v16TestConnections() {
  const host = document.getElementById('v16-health-result');
  if (host) host.innerHTML = '<span class="spinner mini"></span> Testing database and Clover from the secure server…';
  const response = await v16Api('system-health');
  if (!host) return;
  if (!response.ok) { host.innerHTML = `<span class="v16-status missing">${esc(response.data?.error || 'Connection test failed')}</span>`; return; }
  const checks = response.data.checks;
  const syncMessage = checks.realtime.configured ? 'Instant Realtime configured' : 'Secure 5-second sync active';
  host.innerHTML = `<div>${v16StatusPill(checks.database.connected,'Supabase connected',checks.database.error || 'Supabase failed')} ${v16StatusPill(checks.database.connected,syncMessage,'Sync unavailable')} ${v16StatusPill(checks.clover.connected,`Clover ${checks.clover.environment} verified`,checks.clover.error || 'Clover failed')}</div>`;
}

function v16ShowSetupSteps() {
  openPosModal(`<h3>${icon('checkcircle',18)} Go-Live Setup · 7 Steps</h3><ol class="v16-steps"><li><strong>Create the Supabase project</strong><span>Use a strong database password and enable MFA on the owner account.</span></li><li><strong>Run supabase/schema.sql</strong><span>Paste the included SQL into Supabase SQL Editor and run it once.</span></li><li><strong>Add the three Supabase values</strong><span>Use the Project URL, modern publishable key and modern secret key. Mark the secret key as secret in Netlify.</span></li><li><strong>Start with secure five-second sync</strong><span>The POS works across counters without a signing key. Add the optional ES256 key later for instant push updates.</span></li><li><strong>Redeploy and create the first manager</strong><span>Use HATTAN_BOOTSTRAP_CODE once, then rotate or remove it.</span></li><li><strong>Use Clover sandbox first</strong><span>Add the matching sandbox Merchant ID, public token and private token. Never use a live card during setup.</span></li><li><strong>Test before production</strong><span>Two counters, card tokenization, batch charge, refund, ticket printing, barcode scans, delivery timestamps and backups.</span></li></ol><div class="warn-banner"><span><strong>Do not switch to production yet.</strong> First have Clover confirm multi-pay/card-on-file is active and complete a written test checklist.</span></div><button class="btn btn-primary btn-block" onclick="closePosModal()">Got It</button>`);
}

/* Version label and startup. */
const v16BasePosShellHTML = posShellHTML;
posShellHTML = function v16PosShellHTML() {
  return v16BasePosShellHTML().replace(/Staff POS(?: · V\d+(?: [A-Za-z]+)?)?/g, 'Staff POS · V16.2 Live');
};
document.addEventListener('DOMContentLoaded', () => setTimeout(v16Boot, 0));
