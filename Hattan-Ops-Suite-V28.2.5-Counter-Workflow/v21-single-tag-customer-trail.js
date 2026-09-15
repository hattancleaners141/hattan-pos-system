/* ============================================================================
   HATTAN OPS V21 — ONE PHYSICAL TAG + RECENT CUSTOMER TRAIL

   Every garment-service ticket has exactly one active physical tag number.
   Wash & Fold never enters a tag queue. Customer profiles remember a durable
   recent-view trail and can start a preselected Drop Off in one step.
============================================================================ */

const V21_VERSION = 'V21 Single Tag + Customer Trail';
const V21_TAG_SERVICES = new Set(['dryclean', 'shirts', 'alterations']);

function v21RequiresTag(orderOrService) {
  const service = typeof orderOrService === 'string' ? orderOrService : v8OrderService(orderOrService);
  return V21_TAG_SERVICES.has(service);
}

/* Keep the shared cloud snapshot aware of the recent-view trail. */
if (Array.isArray(V16_SHARED_KEYS) && !V16_SHARED_KEYS.includes('recentCustomerViews')) {
  V16_SHARED_KEYS.push('recentCustomerViews');
}

function v21EnsureData() {
  state.recentCustomerSearches = Array.isArray(state.recentCustomerSearches) ? state.recentCustomerSearches : [];
  state.recentCustomerViews = Array.isArray(state.recentCustomerViews) ? state.recentCustomerViews : [];
  state.v21CustomerDirectoryMode = state.v21CustomerDirectoryMode === 'recent' ? 'recent' : 'all';
  state.v21RecentCustomerSearch = String(state.v21RecentCustomerSearch || '');

  /* Upgrade the older ID-only list without inventing timestamps. */
  const known = new Set(state.recentCustomerViews.map(row => row?.customerId).filter(Boolean));
  state.recentCustomerSearches.forEach((customerId, index) => {
    if (!customerById(customerId) || known.has(customerId)) return;
    state.recentCustomerViews.push({ customerId, viewedAt:null, viewedBy:'Staff', migratedOrder:index });
    known.add(customerId);
  });
  state.recentCustomerViews = state.recentCustomerViews
    .filter(row => row && customerById(row.customerId))
    .slice(0, 20);

  /* Older builds allowed up to five active tags. Keep the extras in an audit
     field, but make only the first tag active from V21 onward. */
  (state.orders || []).forEach(order => {
    if (!v21RequiresTag(order)) return;
    const existing = [...new Set([order.tagNumber, ...(Array.isArray(order.tagNumbers) ? order.tagNumbers : [])]
      .map(v12NormalizeTag).filter(Boolean))];
    if (existing.length > 1 && !order.v21SingleTagMigrated) {
      order.legacyTagNumbers = [...new Set([...(order.legacyTagNumbers || []), ...existing.slice(1)])];
      order.tagHistory = order.tagHistory || [];
      order.tagHistory.unshift({
        at:v8NowISO(), by:'System migration', from:existing.slice(), to:[existing[0]],
        reason:'V21 changed each ticket to one active physical tag number',
      });
      order.v21SingleTagMigrated = true;
    }
    order.tagNumber = existing[0] || null;
    order.tagNumbers = order.tagNumber ? [order.tagNumber] : [];
  });
}

const v21BaseSaveState = saveState;
saveState = function v21SaveState() {
  v21EnsureData();
  v21BaseSaveState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.recentCustomerViews = state.recentCustomerViews || [];
    raw.v21CustomerDirectoryMode = state.v21CustomerDirectoryMode || 'all';
    raw.v21RecentCustomerSearch = state.v21RecentCustomerSearch || '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (_) { /* Optional local interface history can reset. */ }
};

const v21BaseLoadState = loadState;
loadState = function v21LoadState() {
  const result = v21BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(raw.recentCustomerViews)) state.recentCustomerViews = raw.recentCustomerViews;
    if (raw.v21CustomerDirectoryMode) state.v21CustomerDirectoryMode = raw.v21CustomerDirectoryMode;
    if (typeof raw.v21RecentCustomerSearch === 'string') state.v21RecentCustomerSearch = raw.v21RecentCustomerSearch;
  } catch (_) { /* Optional local interface history can reset. */ }
  v21EnsureData();
  return result;
};

if (typeof v16ApplySnapshot === 'function') {
  const v21BaseApplySnapshot = v16ApplySnapshot;
  v16ApplySnapshot = function v21ApplySnapshot(snapshot, shouldRender = true) {
    v21BaseApplySnapshot(snapshot, false);
    v21EnsureData();
    if (shouldRender) v16SafeRender();
  };
}

/* ---------------------------- ONE-TAG WORKFLOW ---------------------------- */
v17RequiresTag = v21RequiresTag;

v8TagBadgeHTML = function v21TagBadgeHTML(order) {
  if (!v21RequiresTag(order)) return '<span class="v8-tag-chip v21-tag-exempt">Tag not required</span>';
  if (!order.tagNumber) return '<span class="v8-tag-chip v12-awaiting-tag">Needs one tag</span>';
  return `<span class="v8-tag-chip"><span class="v8-tag-dot" style="background:${order.tagColorHex || '#fff'}"></span>${esc(order.tagNumber)} · ${esc(order.tagColor || 'Tag')}</span>`;
};

v12TagRows = function v21TagRows() {
  const ui = state.tagUi || {}, query = String(ui.search || '').trim().toLowerCase();
  let rows = state.orders.filter(order => order.status !== 'voided' && v21RequiresTag(order));
  if (ui.filter === 'needs') rows = rows.filter(order => v12IsOpen(order) && !order.tagNumber);
  if (ui.filter === 'assigned') rows = rows.filter(order => !!order.tagNumber);
  if (ui.createdDate) rows = rows.filter(order => v8OrderCreatedDate(order) === ui.createdDate);
  if (query) rows = rows.filter(order => v12OrderSearchBlob(order).includes(query));
  return rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

function v21SaveTag(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  if (!v21RequiresTag(order)) return toast('Wash & Fold tickets do not use physical tags', false, 'alerttriangle');
  const tag = v12NormalizeTag(document.getElementById(v12TagInputId(order, 0))?.value);
  if (!tag) return toast('Enter or scan one physical tag number', false, 'alerttriangle');
  const collision = state.orders.find(other => other.id !== order.id && v21RequiresTag(other) && v12NormalizeTag(other.tagNumber) === tag);
  if (collision) return toast(`${tag} is already assigned to #${collision.ticket || collision.id}`, false, 'alerttriangle');
  const colorName = document.getElementById(v12TagColorId(order))?.value || v12TagColor(order).name;
  const color = V12_TAG_COLORS.find(item => item.name === colorName) || V12_TAG_COLORS[0];
  const oldTag = order.tagNumber || null;
  order.tagNumber = tag;
  order.tagNumbers = [tag];
  order.tagColor = color.name;
  order.tagColorHex = color.hex;
  order.tagAssignedAt = v8NowISO();
  order.tagAssignedBy = v6CurrentStaff()?.name || 'Staff';
  order.tagHistory = order.tagHistory || [];
  order.tagHistory.unshift({ at:order.tagAssignedAt, by:order.tagAssignedBy, from:oldTag ? [oldTag] : null, to:[tag], color:color.name });
  v8AddActivity(order, 'tag_assign', `${oldTag ? 'Physical tag updated' : 'Physical tag assigned'} · ${tag} · ${color.name}`);
  recordSync(`Tag assignment · #${order.ticket || order.id} · ${tag} · ${color.name}`);
  saveState();
  toast(`#${order.ticket || order.id} tag ${tag} saved`, true, 'tag');
  renderPosContent();
}
v12SaveTags = v21SaveTag;

v12ClearTags = function v21ClearTag(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order?.tagNumber) return;
  const reason = prompt(`Recall tag ${order.tagNumber} from #${order.ticket || order.id}?`, 'Tag replaced / ticket reorganized');
  if (!reason) return;
  const previous = order.tagNumber;
  order.tagHistory = order.tagHistory || [];
  order.tagHistory.unshift({ at:v8NowISO(), by:v6CurrentStaff()?.name || 'Staff', from:[previous], to:[], reason });
  order.tagNumber = null;
  order.tagNumbers = [];
  order.tagColor = null;
  order.tagColorHex = null;
  order.tagAssignedAt = null;
  v8AddActivity(order, 'tag_recall', `Tag recalled · ${previous} · ${reason}`);
  recordSync(`Tag recalled · #${order.ticket || order.id} · ${previous} · ${reason}`);
  saveState();
  toast(`#${order.ticket || order.id} returned to Needs One Tag`, true, 'refresh');
  renderPosContent();
};

function v21TagInputKeydown(event, orderId) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  v21SaveTag(orderId);
}

v12TagScan = function v21TicketTagScan(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const value = String(event.currentTarget.value || '').trim();
  if (!value) return;
  const order = v3FindOrderByScan(value);
  if (!order) {
    toast(`No ticket found for ${value}`, false, 'alerttriangle');
    event.currentTarget.value = '';
    return;
  }
  if (!v21RequiresTag(order)) {
    toast('Wash & Fold tickets do not use physical tags', false, 'alerttriangle');
    event.currentTarget.value = '';
    return;
  }
  state.tagUi.filter = 'all';
  state.tagUi.search = order.ticket || order.id;
  renderPosContent();
  window.setTimeout(() => document.getElementById(v12TagInputId(order, 0))?.focus(), 0);
};

v12RenderTags = function v21RenderTags(content) {
  v21EnsureData();
  const ui = state.tagUi || (state.tagUi = { filter:'needs', search:'', createdDate:'' });
  const rows = v12TagRows();
  const needCount = state.orders.filter(order => v12IsOpen(order) && v21RequiresTag(order) && !order.tagNumber).length;
  content.innerHTML = `
    <div class="pos-card v12-tag-scan-card">
      <div class="v12-section-head"><div><h3>${icon('tag',17)} Tag Assign — one tag per ticket</h3><div class="v2-note">Dry Cleaning, Tailoring / Alterations and Shirt on Hanger use one physical tag number after intake. Wash &amp; Fold is never included.</div></div><span class="v12-count-badge">${needCount} need one tag</span></div>
      <div class="v21-tag-rule"><strong>One ticket = one tag number.</strong><span> Scan the printed ticket first, then scan or type its single physical tag.</span></div>
      <div class="v12-tag-scan-row"><input id="v12-tag-scan" class="text-input v8-scan-input" autocomplete="off" placeholder="Scan ticket barcode or type ticket #, then press Enter" onkeydown="v12TagScan(event)"><div class="v11-scanner-ready"><span></span>NADAMOO TICKET SCAN</div></div>
    </div>
    <div class="filter-tabs v12-tag-toolbar">
      ${[['needs','Need One Tag'],['assigned','Assigned'],['all','All / Search']].map(([id,label]) => `<button class="filter-tab ${ui.filter === id ? 'active' : ''}" onclick="v12TagFilter('${id}')">${label}</button>`).join('')}
      <div class="pos-search"><span class="search-ic">${icon('search',15)}</span><input id="v12-tag-search" autocomplete="off" placeholder="Ticket, customer, customer # or tag…" value="${esc(ui.search || '')}" oninput="v12TagSearch(this.value)"></div>
      <label class="v12-date-filter"><span>Created date</span><input class="text-input" type="date" value="${esc(ui.createdDate || '')}" onchange="v12TagDate(this.value)"></label>
    </div>
    <div class="pos-table-wrap v12-wide-table">
      ${rows.length ? `<table class="pos-table v12-tag-table v21-tag-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Type / Due</th><th>Qty</th><th>Tag Color</th><th>One Tag Number</th><th></th></tr></thead><tbody>${rows.map(order => {
        const selected = v12TagColor(order);
        return `<tr><td><strong>#${esc(order.ticket || order.id)}</strong><div class="row-sub">${esc(order.barcode || '')}</div></td><td><strong>${esc(customerLabel(order))}</strong><div class="row-sub">${esc(customerById(order.customerId)?.customerNumber || 'Walk-in')}</div></td><td>${esc(V8_SERVICE_NAMES[v8OrderService(order)] || 'Service')}<div class="row-sub">Due ${esc(order.dueDate || '—')}</div></td><td><strong>${esc(order.pieceCount || 1)}</strong></td><td><select id="${v12TagColorId(order)}" class="text-input v12-tag-color">${V12_TAG_COLORS.map(color => `<option ${color.name === selected.name ? 'selected' : ''}>${color.name}</option>`).join('')}</select></td><td><input id="${v12TagInputId(order, 0)}" class="text-input v21-one-tag-input" autocomplete="off" placeholder="One tag #" value="${esc(order.tagNumber || '')}" onkeydown="v21TagInputKeydown(event,'${order.id}')">${order.tagAssignedAt ? `<div class="row-sub">Assigned ${v12DateTime(order.tagAssignedAt)} · ${esc(order.tagAssignedBy || 'Staff')}</div>` : '<div class="row-sub">Press Enter to assign and remove it from this queue</div>'}</td><td><div class="v12-row-actions"><button class="btn btn-primary btn-sm" onclick="v21SaveTag('${order.id}')">Save Tag</button>${order.tagNumber ? `<button class="btn btn-ghost btn-sm" onclick="v12ClearTags('${order.id}')">Recall</button>` : ''}</div></td></tr>`;
      }).join('')}</tbody></table>` : `<div class="table-empty">${ui.filter === 'needs' ? 'Every eligible ticket has its one physical tag assigned. Wash & Fold does not appear here.' : 'No eligible tickets match this search.'}</div>`}
    </div>`;
  window.setTimeout(() => document.getElementById('v12-tag-scan')?.focus(), 0);
};

v13RenderSimpleTags = function v21RenderSimpleTags(content) {
  const needCount = state.orders.filter(order => v12IsOpen(order) && v21RequiresTag(order) && !order.tagNumber).length;
  const order = v13TagState.order;
  let body;
  if (!order) {
    body = `<div class="v13-scan-card"><div class="v13-scan-label">Scan or type the ticket number</div><input id="v13-tag-scan" class="v13-giant-input" autocomplete="off" placeholder="Ticket #" onkeydown="v13TagScanKeydown(event)"><div class="v13-scan-pulse"><span></span>${needCount} ticket${needCount === 1 ? '' : 's'} need one tag</div><div class="v21-simple-tag-note">Wash &amp; Fold tickets never enter this queue.</div></div>`;
  } else {
    const color = v12TagColor(order), tag = v13TagState.tags[0] || '';
    body = `<div class="v13-scan-card" style="text-align:left"><div class="v21-simple-tag-head"><div><strong>#${esc(order.ticket || order.id)}</strong><div class="row-sub">${esc(customerLabel(order))} · ${esc(V8_SERVICE_NAMES[v8OrderService(order)] || '')}</div></div><div class="v13-suggested-color"><span class="v13-swatch" style="background:${color.hex}"></span>${esc(color.name)}</div></div><input type="hidden" id="${v12TagColorId(order)}" value="${esc(color.name)}"><div class="v13-scan-label" style="margin-top:18px">Scan or type the one physical tag</div><input id="${v12TagInputId(order, 0)}" class="v13-giant-input" autocomplete="off" placeholder="One tag #" value="${esc(tag)}" oninput="v21SimpleTagInput(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();v21SimpleTagInput(this.value);v13SaveSimpleTags()}"><div class="v13-tile-grid cols-2" style="margin-top:10px"><button class="v13-giant-btn ghost" onclick="v13CancelTagTicket()">Back</button><button id="v21-simple-save-tag" class="v13-giant-btn primary" ${tag ? '' : 'disabled'} onclick="v13SaveSimpleTags()">${icon('checkcircle',20)} Save One Tag</button></div></div>`;
  }
  content.innerHTML = `<div class="v13-simple-wrap">${v13Head('nav.tags')}${body}</div>`;
  window.setTimeout(() => document.getElementById(order ? v12TagInputId(order, 0) : 'v13-tag-scan')?.focus(), 0);
};

function v21SimpleTagInput(value) {
  const tag = v12NormalizeTag(value);
  v13TagState.tags = tag ? [tag] : [];
  const button = document.getElementById('v21-simple-save-tag');
  if (button) button.disabled = !tag;
}

v13TagScanKeydown = function v21TagScanKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const value = String(event.currentTarget.value || '').trim();
  if (!value) return;
  const order = v3FindOrderByScan(value);
  if (!order) { toast('No ticket found', false, 'alerttriangle'); event.currentTarget.value = ''; return; }
  if (!v21RequiresTag(order)) { toast('Wash & Fold tickets do not use physical tags', false, 'alerttriangle'); event.currentTarget.value = ''; return; }
  v13TagState = { order, tags:order.tagNumber ? [order.tagNumber] : [] };
  renderPosContent();
};

v13TagValueKeydown = function v21TagValueKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const tag = v12NormalizeTag(event.currentTarget.value);
  v13TagState.tags = tag ? [tag] : [];
  renderPosContent();
};

v13SaveSimpleTags = function v21SaveSimpleTag() {
  if (!v13TagState.order) return;
  const orderId = v13TagState.order.id;
  const input = document.getElementById(v12TagInputId(v13TagState.order, 0));
  const tag = v12NormalizeTag(input?.value || v13TagState.tags[0]);
  if (!tag) return toast('Enter or scan one physical tag number', false, 'alerttriangle');
  if (input) input.value = tag;
  v13TagState = { order:null, tags:[] };
  v21SaveTag(orderId);
};

/* Ensure Wash & Fold never shows an assignment action in the completed ticket
   list, including older rows that were created before V21. */
const v21BaseEnhanceLedger = v14EnhanceLedger;
v14EnhanceLedger = function v21EnhanceLedger(content) {
  v21BaseEnhanceLedger(content);
  const rows = [...content.querySelectorAll('.v12-ledger-table tbody tr')], orders = v12LedgerRows();
  rows.forEach((row, index) => {
    const order = orders[index];
    if (!order || v21RequiresTag(order)) return;
    row.querySelector('.v14-inline-tag')?.remove();
    const tagCell = row.children?.[6];
    if (tagCell) tagCell.innerHTML = '<span class="v8-tag-chip v21-tag-exempt">Tag not required</span><div class="row-sub">Wash &amp; Fold</div>';
  });
};

const v21BaseQuickTag = v14QuickTag;
v14QuickTag = function v21QuickTag(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (order && !v21RequiresTag(order)) return toast('Wash & Fold tickets do not use a tag number', false, 'alerttriangle');
  return v21BaseQuickTag(orderId);
};

/* Correct the post-create confirmation and activity text for Wash & Fold. */
const v21BaseCompleteDropOff = posCompleteDropOff;
posCompleteDropOff = function v21CompleteDropOff() {
  const existingIds = new Set(state.orders.map(order => order.id));
  const result = v21BaseCompleteDropOff();
  const created = state.orders.filter(order => !existingIds.has(order.id));
  let changed = false;
  created.forEach(order => {
    if (v21RequiresTag(order)) return;
    const createdActivity = (order.activity || []).find(entry => entry.type === 'created');
    if (createdActivity && /awaiting physical tag assignment/i.test(createdActivity.label || '')) {
      createdActivity.label = String(createdActivity.label).replace(/awaiting physical tag assignment/i, 'no garment tag required');
      changed = true;
    }
    const card = [...document.querySelectorAll('#pos-modal .v5-subticket')].find(node => String(node.textContent || '').includes(`#${order.ticket}`));
    const badge = card?.querySelector('.v8-tag-chip');
    if (badge) { badge.className = 'v8-tag-chip v21-tag-exempt'; badge.textContent = 'No garment tag needed'; }
  });
  if (changed) saveState();
  return result;
};

/* -------------------------- RECENT CUSTOMER PAGE -------------------------- */
v7RememberCustomer = function v21RememberCustomer(customerId) {
  const customer = customerById(customerId);
  if (!customer) return;
  state.recentCustomerSearches = [customerId, ...(state.recentCustomerSearches || []).filter(id => id !== customerId)].slice(0, 20);
  const previous = (state.recentCustomerViews || []).find(row => row.customerId === customerId);
  const viewedBy = v6CurrentStaff()?.name || previous?.viewedBy || 'Staff';
  state.recentCustomerViews = [
    { customerId, viewedAt:v8NowISO(), viewedBy },
    ...(state.recentCustomerViews || []).filter(row => row.customerId !== customerId),
  ].slice(0, 20);
  saveState();
};

function v21RecentCustomers() {
  const query = String(state.v21RecentCustomerSearch || '').trim().toLowerCase();
  return (state.recentCustomerViews || []).map(row => ({ row, customer:customerById(row.customerId) }))
    .filter(entry => entry.customer)
    .filter(entry => !query || v6CustomerSearchBlob(entry.customer).includes(query));
}

function v21ViewedAtLabel(value) {
  if (!value) return 'Viewed in an earlier version';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Viewed previously';
  return date.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function v21CustomerDirectoryTabsHTML() {
  const mode = state.v21CustomerDirectoryMode || 'all', count = (state.recentCustomerViews || []).length;
  return `<div class="v21-customer-directory-tabs"><button class="${mode === 'all' ? 'active' : ''}" onclick="v21SetCustomerDirectoryMode('all')">All Customers</button><button class="${mode === 'recent' ? 'active' : ''}" onclick="v21SetCustomerDirectoryMode('recent')">${icon('clock',15)} Recently Viewed <span>${count}</span></button></div>`;
}

function v21SetCustomerDirectoryMode(mode) {
  state.v21CustomerDirectoryMode = mode === 'recent' ? 'recent' : 'all';
  saveState();
  renderPosCustomers(document.getElementById('pos-content'));
}

function v21RecentCustomerSearchInput(value) {
  state.v21RecentCustomerSearch = value;
  renderPosCustomers(document.getElementById('pos-content'));
  v12RestoreInput('#v21-recent-customer-search', value);
}

function v21OpenRecentCustomers() {
  state.posNav = 'customers';
  state.v7CustomerId = null;
  state.v21CustomerDirectoryMode = 'recent';
  saveState();
  renderPosContent();
}

function v21RecentCustomerPageHTML() {
  const rows = v21RecentCustomers();
  return `${v21CustomerDirectoryTabsHTML()}<div class="v21-recent-head"><div><h2>Recently Viewed Customers</h2><p>Return to a profile or start a new Drop Off with that customer already selected.</p></div><button class="btn btn-secondary" onclick="posOpenNewCustomer()">${icon('plus',15)} New Customer</button></div><div class="pos-search v21-recent-search"><span class="search-ic">${icon('search',15)}</span><input id="v21-recent-customer-search" autocomplete="off" placeholder="Search recently viewed customers…" value="${esc(state.v21RecentCustomerSearch || '')}" oninput="v21RecentCustomerSearchInput(this.value)"></div>${rows.length ? `<div class="v21-recent-customer-grid">${rows.map(({ row, customer }) => {
    const balance = arBalance(customer.id), open = v7OpenTickets(customer.id).length;
    return `<article class="v21-recent-customer-card"><div class="v21-recent-customer-top"><div class="avatar">${esc(customer.initials || v14Initials(customer.name))}</div><div><h3>${esc(customer.name)}</h3><div>${esc(customer.customerNumber || 'No customer #')} · ${esc(customer.phone || 'No phone')}</div></div></div><div class="v21-recent-meta"><span>${icon('clock',14)} ${esc(v21ViewedAtLabel(row.viewedAt))}</span><span>Viewed by ${esc(row.viewedBy || 'Staff')}</span><span>${open} open · ${balance > 0.004 ? money(balance) + ' owed' : 'No balance due'}</span></div><div class="v21-recent-actions"><button class="btn btn-secondary" onclick="v7OpenCustomerProfile('${customer.id}')">View Profile</button><button class="btn btn-primary" onclick="v21StartCustomerDropOff('${customer.id}')">${icon('plus',14)} Drop Off</button></div></article>`;
  }).join('')}</div>` : '<div class="table-empty">No recently viewed customer matches this search yet.</div>'}`;
}

const v21BaseRenderPosCustomers = renderPosCustomers;
renderPosCustomers = function v21RenderPosCustomers(content) {
  v21EnsureData();
  if (state.v21CustomerDirectoryMode === 'recent') {
    content.innerHTML = v21RecentCustomerPageHTML();
    return;
  }
  v21BaseRenderPosCustomers(content);
  if (!content.querySelector('.v21-customer-directory-tabs')) content.insertAdjacentHTML('afterbegin', v21CustomerDirectoryTabsHTML());
};

function v21HasUnsavedVisit() {
  return !!((counterDraft?.items || []).length || v9HasPendingDraft?.());
}

function v21StartCustomerDropOff(customerId, confirmed = false) {
  const customer = customerById(customerId);
  if (!customer) return toast('Customer profile was not found', false, 'alerttriangle');
  const sameCustomer = counterDraft?.customerId === customerId;
  if (v21HasUnsavedVisit() && !sameCustomer && !confirmed) {
    openPosModal(`<h3>${icon('alerttriangle',18)} Start a New Drop Off?</h3><p class="pm-sub">There is an unfinished visit for another customer. Starting ${esc(customer.name)} will clear that unsaved visit.</p><button class="btn btn-primary btn-block" onclick="v21StartCustomerDropOff('${customer.id}',true)">Clear It and Start ${esc(customer.name)}</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Keep Current Visit</button>`);
    return;
  }
  closePosModal();
  state.posNav = 'counter';
  v14CounterMode = 'dropoff';
  if (!sameCustomer || !counterDraft) counterDraft = v8FreshCounterDraft();
  v19EnsureDraft?.(counterDraft);
  counterDraft.customerId = customerId;
  counterDraft.guestName = '';
  counterDraft.fulfillment = v17CustomerDefault(customer);
  posCustomerSearch = '';
  v7RememberCustomer(customerId);
  renderPosContent();
  window.setTimeout(() => document.querySelector('.v4-service-tabs,.v13-service-grid')?.scrollIntoView?.({ block:'start' }), 0);
  toast(`${customer.name} selected for Drop Off`, true, 'users');
}

const v21BaseRenderCustomerProfile = renderV7CustomerProfile;
renderV7CustomerProfile = function v21RenderCustomerProfile() {
  v21BaseRenderCustomerProfile();
  const customer = customerById(state.v7CustomerId), content = document.getElementById('pos-content');
  if (!customer || !content) return;
  const actions = content.querySelector('.v7-profile-main .v7-actions');
  if (actions && !actions.querySelector('.v21-profile-dropoff')) {
    actions.insertAdjacentHTML('afterbegin', `<button class="btn btn-primary btn-sm v21-profile-dropoff" onclick="v21StartCustomerDropOff('${customer.id}')">${icon('plus',14)} Drop Off for ${esc(customer.name)}</button>`);
  }
  const back = [...content.querySelectorAll('.v7-profile-main button')].find(button => /Back to Customers/i.test(button.textContent || ''));
  if (back && !content.querySelector('.v21-recent-profile-link')) {
    back.insertAdjacentHTML('afterend', `<button class="btn btn-ghost btn-sm v21-recent-profile-link" onclick="v21OpenRecentCustomers()">${icon('clock',14)} Recently Viewed</button>`);
  }
};

v21EnsureData();
