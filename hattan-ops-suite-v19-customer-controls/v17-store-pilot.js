/* ============================================================================
   HATTAN OPS V17 — STORE PILOT
   Additive reliability layer loaded after V16.2. Historical tickets retain
   their original pricing; new special-material charges are flat per line.
============================================================================ */

const V17_VERSION = 'V17 Store Pilot';
const V17_TAG_SERVICES = new Set(['dryclean', 'shirts', 'alterations']);
const V17_DEFAULT_TRANSLATIONS = {
  dryclean: {
    stain:'污渍处理', delicate:'精细手工处理', nosteam:'不要蒸汽',
    protectbuttons:'保护特殊纽扣', call:'额外处理前请致电',
  },
  washfold: {
    fragrancefree:'无香洗衣液', separate:'深色与白色分开', nosoftener:'不使用柔顺剂',
    lowdry:'低温烘干', hangdry:'选定衣物悬挂晾干',
  },
  shirts: {
    nostarch:'不上浆', lightstarch:'轻浆', heavystarch:'重浆',
    boxed:'盒装衬衫', buttons:'更换破损纽扣',
  },
  alterations: {
    originalhem:'保留原边', matchexisting:'使用相同颜色的线', call:'额外处理前请致电',
    fitting:'需要试穿', press:'修改后熨烫',
  },
};

['workflowSettings', 'instructionTranslations', 'legacyImports', 'dailyRevenue'].forEach(key => {
  if (typeof V16_SHARED_KEYS !== 'undefined' && !V16_SHARED_KEYS.includes(key)) V16_SHARED_KEYS.push(key);
});

function v17Round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
function v17FormatClock(value) {
  const raw = String(value || '16:00').trim();
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [hour, minute] = raw.split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
  }
  return raw || '04:00 PM';
}
function v17ClockInput(value) {
  const raw = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return '16:00';
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
function v17DeepClone(value) {
  try { return structuredClone(value); }
  catch (_) { return JSON.parse(JSON.stringify(value)); }
}

function v17EnsureData() {
  state.workflowSettings = {
    rushReadyTime:'16:00',
    printChineseInstructions:false,
    ...(state.workflowSettings || {}),
  };
  state.instructionTranslations = state.instructionTranslations || {};
  Object.entries(V17_DEFAULT_TRANSLATIONS).forEach(([service, rows]) => {
    state.instructionTranslations[service] = state.instructionTranslations[service] || {};
    Object.entries(rows).forEach(([id, zh]) => {
      const current = state.instructionTranslations[service][id];
      state.instructionTranslations[service][id] = typeof current === 'object'
        ? { zh, enabled:false, ...current }
        : { zh:String(current || zh), enabled:false };
    });
  });
  state.legacyImports = Array.isArray(state.legacyImports) ? state.legacyImports : [];
  state.dailyRevenue = Array.isArray(state.dailyRevenue) ? state.dailyRevenue : [];
  state.customerMemos = state.customerMemos || {};
  (state.materials || []).forEach(material => {
    if (['standard', 'cotton'].includes(material.id)) material.upcharge = 0;
    else if (!Number.isFinite(Number(material.upcharge))) material.upcharge = v17Round(Math.max(0, Number(material.multiplier || 0)));
  });
  (state.customers || []).forEach(customer => {
    customer.defaultFulfillment = customer.defaultFulfillment || customer.preferredChannel || 'pickup';
    customer.openingBalance = Number(customer.openingBalance || 0);
  });
  if (counterDraft) v17EnsureDraft(counterDraft);
}
function v17EnsureDraft(draft) {
  if (!draft) return draft;
  draft.serviceDueTimes = draft.serviceDueTimes || {};
  draft.shirts = draft.shirts || { qty:1, packaging:'hanger', starch:'None', touched:false };
  draft.shirts.colorId = draft.shirts.colorId || 'white';
  return draft;
}

const v17BaseSaveState = saveState;
saveState = function v17SaveState() {
  v17EnsureData();
  v17BaseSaveState();
  if (typeof v16IsShared === 'function' && v16IsShared()) return;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.workflowSettings = state.workflowSettings;
    raw.instructionTranslations = state.instructionTranslations;
    raw.legacyImports = state.legacyImports;
    raw.dailyRevenue = state.dailyRevenue;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (_) { /* local demo remains usable when storage is unavailable */ }
};
const v17BaseLoadState = loadState;
loadState = function v17LoadState() {
  v17BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    ['workflowSettings', 'instructionTranslations', 'legacyImports', 'dailyRevenue'].forEach(key => {
      if (raw[key] !== undefined) state[key] = raw[key];
    });
  } catch (_) { /* optional V17 settings can use defaults */ }
  v17EnsureData();
};

const v17BaseEnsureDraft = v14EnsureDraft;
v14EnsureDraft = function v17EnsureWorkflowDraft(draft) {
  return v17EnsureDraft(v17BaseEnsureDraft(draft));
};
const v17BaseFreshCounterDraft = v8FreshCounterDraft;
v8FreshCounterDraft = function v17FreshCounterDraft() {
  return v17EnsureDraft(v17BaseFreshCounterDraft());
};
freshCounterDraft = v8FreshCounterDraft;

if (typeof v16ApplySnapshot === 'function') {
  const v17BaseApplySnapshot = v16ApplySnapshot;
  v16ApplySnapshot = function v17ApplySnapshot(snapshot, shouldRender = true) {
    v17BaseApplySnapshot(snapshot, false);
    v17EnsureData();
    if (shouldRender) v16SafeRender();
  };
}

/* --------------------------- SECURE STARTUP GATE --------------------------- */
const v17BaseBoot = v16Boot;
v16Boot = async function v17Boot() {
  try { return await v17BaseBoot(); }
  finally {
    window.setTimeout(() => {
      document.documentElement.classList.remove('v17-booting');
      document.getElementById('v17-boot-screen')?.remove();
    }, 80);
  }
};
window.setTimeout(() => document.documentElement.classList.remove('v17-booting'), 18000);

/* ------------------------ FLAT MATERIAL UPCHARGES ------------------------- */
function v17MaterialUpcharge(materialId) {
  if (!materialId || ['standard', 'cotton'].includes(materialId)) return 0;
  const material = materialById(materialId);
  return v17Round(Math.max(0, Number(material?.upcharge ?? material?.multiplier ?? 0)));
}
function v17LineTotal(line) {
  if (!line) return 0;
  const base = Number(line.unitPrice || 0) * Number(line.qty || 0);
  if (line.pricingVersion !== 'flat-upcharge-v17') return v17Round(base);
  return v17Round(base + Number(line.materialUpcharge || 0));
}
function v17StampFlatLine(line) {
  if (!line || v8ServiceForItem(line) !== 'dryclean') return line;
  if (line.pricingVersion === 'flat-upcharge-v17') return line;
  const garment = garmentById(line.garmentId);
  line.pricingVersion = 'flat-upcharge-v17';
  if (line.priceMode === 'no_charge') {
    line.unitPrice = 0;
    line.materialUpcharge = 0;
    return line;
  }
  if (!line.priceMode && garment) line.unitPrice = Number(garment.basePrice || 0);
  line.materialUpcharge = v17MaterialUpcharge(line.materialId);
  return line;
}
garmentUnitPrice = function v17GarmentUnitPrice(garmentId) {
  return Number(garmentById(garmentId)?.basePrice || 0);
};
const v17BaseAddOrMergeLine = v9AddOrMergeLine;
v9AddOrMergeLine = function v17AddOrMergeLine(line) {
  return v17BaseAddOrMergeLine(v17StampFlatLine(line));
};
const v17BaseCommitDryCleaning = v9CommitDryCleaning;
v9CommitDryCleaning = function v17CommitDryCleaning(render = true) {
  const result = v17BaseCommitDryCleaning(false);
  (counterDraft?.items || []).forEach(v17StampFlatLine);
  if (render) renderPosContent();
  return result;
};
v8DraftBaseTotal = function v17DraftBaseTotal() {
  return (counterDraft?.items || []).reduce((sum, line) => sum + v17LineTotal(line), 0);
};
v8ServiceSubtotal = function v17ServiceSubtotal(items) {
  return (items || []).reduce((sum, line) => sum + v17LineTotal(line), 0);
};
v9PendingSubtotal = function v17PendingSubtotal() {
  if (!v9HasPendingDraft()) return 0;
  const service = counterDraft.serviceMode;
  if (service === 'dryclean') {
    const builder = counterDraft.builder;
    return v17Round(garmentUnitPrice(builder.garmentId) * v9PositiveNumber(builder.qty) + v17MaterialUpcharge(builder.materialId));
  }
  if (service === 'washfold') return v17LineTotal(v9WashFoldLine());
  if (service === 'shirts') return v17LineTotal(v9ShirtLine());
  return v9AlterationLines().reduce((sum, line) => sum + v17LineTotal(line), 0);
};
const v17BasePendingDraftHTML = v9PendingDraftHTML;
v9PendingDraftHTML = function v17PendingDraftHTML() {
  let html = v17BasePendingDraftHTML();
  if (counterDraft?.serviceMode === 'dryclean' && v9HasPendingDraft('dryclean')) {
    html = html.replace(/<b>\$[^<]+<\/b>/, `<b>${money(v9PendingSubtotal())}</b>`);
  }
  return html;
};
v8TicketItemHTML = function v17TicketItemHTML(item, index) {
  const garment = garmentById(item.garmentId), material = materialById(item.materialId), color = colorById(item.colorId);
  if (!garment) return '';
  const service = v8ServiceForItem(item), isWeight = service === 'washfold', details = [];
  if (item.materialId && !['standard', 'cotton'].includes(item.materialId)) details.push(`${material.name} +${money(item.pricingVersion === 'flat-upcharge-v17' ? item.materialUpcharge : 0)} flat`);
  if (item.colorId && item.colorId !== 'print') details.push(color.name);
  details.push(`${item.qty} ${garment.unit}${Number(item.qty) === 1 ? '' : 's'} × ${money(item.unitPrice)}`);
  if (item.buttonType && !['standard', 'none'].includes(item.buttonType)) details.push(BUTTON_TYPES.find(button => button.id === item.buttonType)?.name || item.buttonType);
  return `<div class="ticket-line v9-saved-line"><div class="tl-name">${esc(garment.name)}<div style="font-size:11px;color:var(--ink-muted)">${details.map(esc).join(' · ')}</div>${item.garmentNote ? `<div style="font-size:10.5px;color:var(--ink-secondary);margin-top:2px">${esc(item.garmentNote)}</div>` : ''}</div><label class="v9-line-qty"><span>${isWeight ? 'Lb' : 'Qty'}</span><input type="number" min="${isWeight ? '.1' : '1'}" step="${isWeight ? '.1' : '1'}" value="${esc(item.qty)}" oninput="v9SetLineQty(${index},this.value,${isWeight})"></label><div class="tl-price" id="v9-line-price-${index}">${money(v17LineTotal(item))}</div><div class="v3-line-actions">${service === 'dryclean' ? `<button class="btn btn-ghost v3-mini" onclick="v3EditLine(${index})">Edit</button>` : ''}<button class="btn btn-ghost v3-mini v9-remove-line" onclick="posRemoveItem(${index})">${icon('x', 13)} Remove</button></div></div>`;
};
v9SetLineQty = function v17SetLineQty(index, value, decimal = false) {
  const line = counterDraft.items[index]; if (!line) return;
  line.qty = v9PositiveNumber(value, 1, decimal);
  const price = document.getElementById(`v9-line-price-${index}`);
  if (price) price.textContent = money(v17LineTotal(line));
  v9RefreshVisitDraft();
};

const v17BaseNormalizeEditLine = v15NormalizeEditLine;
v15NormalizeEditLine = function v17NormalizeEditLine(line = {}) {
  const normalized = v17BaseNormalizeEditLine(line);
  if (line.pricingVersion) normalized.pricingVersion = line.pricingVersion;
  if (line.materialUpcharge !== undefined) normalized.materialUpcharge = Number(line.materialUpcharge || 0);
  return normalized;
};
v15EditorTotal = function v17EditorTotal(draft = v15TicketEditDraft) {
  return v17Round((draft?.lineItems || []).reduce((sum, line) => sum + v17LineTotal(line), 0));
};
const v17BaseEditTicketLine = v15EditTicketLine;
v15EditTicketLine = function v17EditTicketLine(index, field, value, rerender = true) {
  v17BaseEditTicketLine(index, field, value, false);
  const line = v15TicketEditDraft?.lineItems?.[index];
  if (line && ['garmentId', 'materialId'].includes(field)) {
    delete line.pricingVersion;
    v17StampFlatLine(line);
  }
  if (rerender) v15RenderTicketEditor();
  else {
    const total = document.getElementById('v15-editor-total');
    if (total) total.textContent = money(v15EditorTotal());
    const row = document.querySelectorAll('.v15-edit-line')[index]?.querySelector('.v15-edit-line-total strong');
    if (row && line) row.textContent = money(v17LineTotal(line));
  }
};
const v17BaseRenderTicketEditor = v15RenderTicketEditor;
v15RenderTicketEditor = function v17RenderTicketEditor() {
  v17BaseRenderTicketEditor();
  document.querySelectorAll('.v15-edit-line-total strong').forEach((node, index) => {
    node.textContent = money(v17LineTotal(v15TicketEditDraft?.lineItems?.[index]));
  });
};

/* ------------------------ SHIRT COLORS AND CUSTOMER ------------------------ */
const v17BaseShirtLine = v9ShirtLine;
v9ShirtLine = function v17ShirtLine() {
  const line = v17BaseShirtLine();
  if (line) line.colorId = counterDraft?.shirts?.colorId || 'white';
  return line;
};
function v17SetShirtColor(colorId) {
  v17EnsureDraft(counterDraft);
  counterDraft.shirts.colorId = colorId;
  counterDraft.shirts.touched = true;
  renderPosContent();
}

arBalance = function v17ArBalance(customerId) {
  const customer = customerById(customerId);
  const ticketBalance = state.orders
    .filter(order => order.customerId === customerId && order.status !== 'voided' && !order.legacyBalanceAccounted)
    .reduce((sum, order) => sum + (typeof v15OrderBalance === 'function' ? v15OrderBalance(order) : (order.paid ? 0 : Math.max(0, Number(order.total || 0) - Number(order.discount || 0) + Number(order.surcharge || 0)))), 0);
  return v17Round(ticketBalance + Math.max(0, Number(customer?.openingBalance || 0)));
};
function v17CustomerDefault(customer) {
  return customer?.defaultFulfillment || customer?.preferredChannel || 'pickup';
}
const v17BasePickCustomer = posPickCustomer;
posPickCustomer = function v17PickCustomer(id) {
  v17BasePickCustomer(id);
  const customer = customerById(id);
  if (counterDraft && customer) counterDraft.fulfillment = v17CustomerDefault(customer);
  renderPosContent();
};
const v17BaseOpenNewCustomer = posOpenNewCustomer;
posOpenNewCustomer = function v17OpenNewCustomer() {
  v17BaseOpenNewCustomer();
  if (typeof v16IsShared !== 'function' || !v16IsShared()) return;
  ncDraft.saveCard = false;
  document.getElementById('nc-card-fields')?.remove();
  const switchNode = document.getElementById('nc-card-switch');
  const row = switchNode?.closest('.pref-row');
  if (row) row.innerHTML = `<div><div class="pr-label">Secure card on file</div><div class="pr-sub">Create the customer first, then use Add Card Securely on the customer profile. Card details go only into Clover-hosted fields.</div></div>${icon('lock', 20)}`;
};
const v17BaseSaveNewCustomer = posSaveNewCustomer;
posSaveNewCustomer = function v17SaveNewCustomer() {
  const ids = new Set(state.customers.map(customer => customer.id));
  const result = v17BaseSaveNewCustomer();
  const created = state.customers.find(customer => !ids.has(customer.id));
  if (created) {
    created.defaultFulfillment = created.preferredChannel || 'pickup';
    saveState();
  }
  return result;
};
function v17SetCustomerDefault(customerId, fulfillment) {
  const customer = customerById(customerId); if (!customer) return;
  customer.defaultFulfillment = fulfillment;
  customer.preferredChannel = fulfillment;
  saveState();
  renderV7CustomerProfile();
  toast(`${customer.name} now defaults to ${fulfillment === 'delivery' ? 'delivery' : 'counter pickup'}`, true, fulfillment === 'delivery' ? 'truck' : 'box');
}
const v17BaseRenderCustomerProfile = renderV7CustomerProfile;
renderV7CustomerProfile = function v17RenderCustomerProfile() {
  v17BaseRenderCustomerProfile();
  const customer = customerById(state.v7CustomerId), host = document.querySelector('.v7-profile-main');
  if (!customer || !host || host.querySelector('.v17-default-card')) return;
  const current = v17CustomerDefault(customer);
  host.insertAdjacentHTML('beforeend', `<div class="v17-default-card"><div><strong>Default ticket fulfillment</strong><small>New tickets and printed claim tickets follow this customer preference.</small></div><div class="segmented"><button class="seg ${current === 'pickup' ? 'selected' : ''}" onclick="v17SetCustomerDefault('${customer.id}','pickup')">Pickup</button><button class="seg ${current === 'delivery' ? 'selected' : ''}" onclick="v17SetCustomerDefault('${customer.id}','delivery')">Delivery</button></div></div>`);
};

/* ---------------------- DUE DATES AND RUSH READY TIME ---------------------- */
v14SetDueDate = function v17SetDueDate(key, value, rush) {
  v14EnsureDraft(counterDraft);
  counterDraft.serviceDueDates[key] = value;
  const rushGroups = new Set(counterDraft.rushGroups || []);
  if (rush) {
    rushGroups.add(key);
    counterDraft.serviceDueTimes[key] = counterDraft.serviceDueTimes[key] || state.workflowSettings.rushReadyTime;
  } else rushGroups.delete(key);
  counterDraft.rushGroups = [...rushGroups];
  renderPosContent();
};
function v17SetRushReadyTime(key, value) {
  v14EnsureDraft(counterDraft);
  counterDraft.serviceDueTimes[key] = value || state.workflowSettings.rushReadyTime;
}
v14DuePanelHTML = function v17DuePanelHTML(group) {
  const key = v14GroupKey(group), date = counterDraft.serviceDueDates[key] || counterDraft.serviceDueDates[group.service] || v8DefaultDue(group.service), rush = (counterDraft.rushGroups || []).includes(key), time = counterDraft.serviceDueTimes[key] || state.workflowSettings.rushReadyTime;
  return `<div class="v14-due-panel"><div class="v14-due-title"><strong>Due date · ${esc(V8_SERVICE_NAMES[group.service] || group.service)}</strong>${rush ? '<span class="v14-rush-chip">RUSH · SAME DAY</span>' : ''}</div><div class="v14-due-control v17-due-control"><input class="text-input v14-due-input" type="date" value="${esc(date)}" onchange="v14SetDueDate('${esc(key)}',this.value,false)"><button class="v14-rush-btn ${rush ? 'active' : ''}" onclick="v14SetDueDate('${esc(key)}','${v14DatePlus(0)}',true)">RUSH</button><button class="v14-tomorrow-btn" onclick="v14SetDueDate('${esc(key)}','${v14DatePlus(1)}',false)">Tomorrow</button>${rush ? `<div class="v17-rush-time"><label>Customer ready time (editable)</label><input class="text-input" type="time" value="${esc(v17ClockInput(time))}" onchange="v17SetRushReadyTime('${esc(key)}',this.value)"></div>` : ''}</div></div>`;
};
v14EnhanceDueDates = function v17EnhanceDueDates(content, simple) {
  const groups = v8DraftGroups(); if (!groups.length) return;
  if (simple) {
    const visit = content.querySelector('.v13-visit-card'), total = visit?.querySelector('.v13-total-banner');
    if (!visit || !total) return;
    const wrap = document.createElement('div'); wrap.className = 'v14-simple-due-wrap'; wrap.innerHTML = groups.map(v14DuePanelHTML).join(''); visit.insertBefore(wrap, total); return;
  }
  const groupElements = [...content.querySelectorAll('.v8-ticket-group')];
  groupElements.forEach((groupElement, index) => {
    const group = groups[index]; if (!group) return;
    const oldInput = groupElement.querySelector('input[type="date"]'); if (!oldInput) return;
    const holder = document.createElement('div'); holder.innerHTML = v14DuePanelHTML(group);
    const replacement = holder.firstElementChild;
    const label = oldInput.previousElementSibling;
    oldInput.remove();
    if (label?.classList.contains('field-label')) label.remove();
    groupElement.appendChild(replacement.querySelector('.v14-due-control'));
    if ((counterDraft.rushGroups || []).includes(v14GroupKey(group))) groupElement.querySelector('.v8-ticket-group-head')?.insertAdjacentHTML('beforeend', '<span class="v14-rush-chip">RUSH · SAME DAY</span>');
  });
};

/* ------------------ BILINGUAL SERVICE-SPECIFIC INSTRUCTIONS ------------------ */
v14InstructionRows = function v17InstructionRows(service) {
  const source = new Map((V14_SERVICE_INSTRUCTIONS[service] || []).map(row => [row.id, row]));
  return (state.v14InstructionOrder?.[service] || []).map(id => {
    const row = source.get(id); if (!row) return null;
    return { ...row, ...(state.instructionTranslations?.[service]?.[id] || {}) };
  }).filter(Boolean);
};
v14ServiceInstructionHTML = function v17ServiceInstructionHTML(service) {
  v14EnsureDraft(counterDraft);
  const selected = counterDraft.serviceInstructions[service] || [], open = !!counterDraft.instructionOpen[service];
  const custom = counterDraft.serviceInstructionNotes[service] || '';
  return `<div class="v14-instructions"><div class="v14-instruction-head"><strong>Special instructions · ${esc(V8_SERVICE_NAMES[service] || service)}</strong><button class="v14-instruction-toggle" onclick="v14ToggleInstructionPanel('${service}')">${open ? 'Hide choices' : 'Show choices'}</button></div>${open ? `<div class="v14-instruction-options">${v14InstructionRows(service).map(row => `<button class="v14-instruction-chip ${selected.includes(row.id) ? 'selected' : ''}" onclick="v14ToggleInstruction('${service}','${row.id}')">${esc(row.label)}${row.enabled && row.zh ? `<span class="v17-instruction-zh">${esc(row.zh)}</span>` : ''}</button>`).join('')}</div>` : ''}<div class="v17-free-instruction"><input id="v17-free-instruction" class="text-input v14-instruction-custom" placeholder="Type any ${esc(V8_SERVICE_NAMES[service] || service)} instruction…" value="${esc(custom)}" oninput="v14SetInstructionNote('${service}',this.value)"><button class="btn btn-ghost" type="button" onclick="document.getElementById('v17-free-instruction')?.focus()">Shift to type</button></div></div>`;
};
v14InstructionText = function v17InstructionText(service) {
  v14EnsureDraft(counterDraft);
  const ids = counterDraft.serviceInstructions[service] || [];
  const labels = v14InstructionRows(service).filter(row => ids.includes(row.id)).map(row => state.workflowSettings?.printChineseInstructions && row.enabled && row.zh ? `${row.label} / ${row.zh}` : row.label);
  const custom = String(counterDraft.serviceInstructionNotes[service] || '').trim();
  return [...labels, custom].filter(Boolean).join(' · ');
};
function v17SetTranslation(service, id, field, value) {
  v17EnsureData();
  const row = state.instructionTranslations[service][id]; if (!row) return;
  row[field] = field === 'enabled' ? !!value : String(value || '').trim();
  saveState();
}
function v17TranslateProductionDetail(text) {
  if (!state.workflowSettings?.printChineseInstructions) return '';
  const raw = String(text || '').toLowerCase(), values = [];
  const map = [
    [/black\s+bag|bag:\s*black/, '黑色洗衣袋'], [/white\s+bag|bag:\s*white/, '白色洗衣袋'],
    [/no\s+(?:fabric\s+)?softener/, '不使用柔顺剂'], [/low\s+dry/, '低温烘干'],
    [/fragrance[- ]free/, '无香洗衣液'], [/separate\s+darks?[^·]*whites?/, '深色与白色分开'],
    [/on\s+hanger/, '衣架装'], [/boxed/, '盒装'], [/no\s+starch/, '不上浆'],
  ];
  map.forEach(([pattern, zh]) => { if (pattern.test(raw) && !values.includes(zh)) values.push(zh); });
  return values.join(' · ');
}

/* ------------------------ TAG-ASSIGN SERVICE RULES ------------------------ */
function v17RequiresTag(orderOrService) {
  const service = typeof orderOrService === 'string' ? orderOrService : v8OrderService(orderOrService);
  return V17_TAG_SERVICES.has(service);
}
for (let index = V12_TAG_COLORS.length - 1; index >= 0; index--) {
  if (V12_TAG_COLORS[index].name === 'Black') V12_TAG_COLORS.splice(index, 1);
}
if (!V12_TAG_COLORS.some(color => color.name === 'White')) V12_TAG_COLORS.unshift({ name:'White', hex:'#ffffff' });
v8TagStyle = function v17TagStyle(service, dueDate) {
  if (service === 'alterations') {
    const day = dueDate ? new Date(`${dueDate}T12:00:00`).getDay() : new Date().getDay();
    return V8_ALTERATION_TAG_COLORS[day] || V8_ALTERATION_TAG_COLORS[0];
  }
  if (service === 'shirts') return { name:'Blue', hex:'#b8d8f3' };
  return { name:'White', hex:'#ffffff' };
};
v8DraftTagHTML = function v17DraftTagHTML(service) {
  return v17RequiresTag(service)
    ? '<span class="v8-tag-chip v12-awaiting-tag">Tag assigned after intake</span>'
    : '<span class="v8-tag-chip">No garment tag needed</span>';
};
v8TagBadgeHTML = function v17TagBadgeHTML(order) {
  if (!v17RequiresTag(order)) return '<span class="v8-tag-chip">No garment tag</span>';
  return order.tagNumber
    ? `<span class="v8-tag-chip"><span class="v8-tag-dot" style="background:${order.tagColorHex || '#fff'}"></span>${esc((order.tagNumbers || [order.tagNumber]).join(' · '))} · ${esc(order.tagColor || 'Tag')}</span>`
    : '<span class="v8-tag-chip v12-awaiting-tag">Awaiting tag assignment</span>';
};
v12TagRows = function v17TagRows() {
  const ui = state.tagUi || {}, query = String(ui.search || '').trim().toLowerCase();
  let rows = state.orders.filter(order => order.status !== 'voided' && v17RequiresTag(order));
  if (ui.filter === 'needs') rows = rows.filter(order => v12IsOpen(order) && !(order.tagNumbers || []).length);
  if (ui.filter === 'assigned') rows = rows.filter(order => (order.tagNumbers || []).length);
  if (ui.createdDate) rows = rows.filter(order => v8OrderCreatedDate(order) === ui.createdDate);
  if (query) rows = rows.filter(order => v12OrderSearchBlob(order).includes(query));
  return rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};
const v17BaseRenderTags = v12RenderTags;
v12RenderTags = function v17RenderTags(content) {
  v17BaseRenderTags(content);
  const count = state.orders.filter(order => v12IsOpen(order) && v17RequiresTag(order) && !(order.tagNumbers || []).length).length;
  const badge = content.querySelector('.v12-count-badge'); if (badge) badge.textContent = `${count} need tags`;
};
const v17BaseSaveTags = v12SaveTags;
v12SaveTags = function v17SaveTags(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (order && !v17RequiresTag(order)) return toast('Wash & Fold tickets do not use garment tags', false, 'alerttriangle');
  return v17BaseSaveTags(orderId);
};
const v17BaseRenderTodo = v12RenderTodo;
v12RenderTodo = function v17RenderTodo(content) {
  v17BaseRenderTodo(content);
  const tile = [...content.querySelectorAll('.v12-todo-tile')].find(node => /Need Physical Tags/i.test(node.textContent || ''));
  const count = state.orders.filter(order => v12IsOpen(order) && v17RequiresTag(order) && !(order.tagNumbers || []).length).length;
  if (tile) tile.querySelector('.v12-todo-value').textContent = count;
};
const v17BaseEnhanceLedger = v14EnhanceLedger;
v14EnhanceLedger = function v17EnhanceLedger(content) {
  v17BaseEnhanceLedger(content);
  const rows = [...content.querySelectorAll('.v12-ledger-table tbody tr')], orders = v12LedgerRows();
  rows.forEach((row, index) => {
    const order = orders[index]; if (!order || v17RequiresTag(order)) return;
    row.querySelector('.v14-inline-tag')?.remove();
    const tagCell = row.children?.[6];
    const awaiting = tagCell?.querySelector('.v12-awaiting-text'); if (awaiting) awaiting.textContent = 'No garment tag';
  });
};
const v17BaseQuickTag = v14QuickTag;
v14QuickTag = function v17QuickTag(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (order && !v17RequiresTag(order)) return toast('This service does not use a garment tag', false, 'alerttriangle');
  return v17BaseQuickTag(orderId);
};

/* ------------------------ THERMAL TICKET PRODUCTION ------------------------ */
function v17EffectiveDelivery(order, customer) {
  const actual = order.fulfillment === 'delivery' || order.channel === 'delivery';
  const customerDefault = v17CustomerDefault(customer) === 'delivery';
  return actual || (customerDefault && (typeof v12IsOpen !== 'function' || v12IsOpen(order)));
}
v11ReceiptItemHTML = function v17ReceiptItemHTML(item, service) {
  const garment = garmentById(item.garmentId), qty = Number(item.qty) || 1, description = v8LinePrintDescription(item);
  const qtyText = service === 'washfold' ? `${qty} LB` : String(qty);
  const itemName = String(garment?.name || description.name || 'SERVICE ITEM').replace(/\s*[×x]\s*[\d.]+$/i, '').toUpperCase();
  const detailParts = [description.detail];
  if (item.pricingVersion === 'flat-upcharge-v17' && Number(item.materialUpcharge || 0) > 0) detailParts.push(`SPECIAL MATERIAL +${money(item.materialUpcharge)} FLAT`);
  const detail = detailParts.filter(Boolean).join(' · '), chinese = v17TranslateProductionDetail(detail);
  return `<div class="v11-item-line"><div class="rt-row"><strong>${esc(qtyText)} - ${esc(itemName)}</strong><strong>${money(v17LineTotal(item))}</strong></div>${detail ? `<div class="v11-item-detail">${esc(detail.toUpperCase())}${chinese ? `<span class="v17-zh-line">${esc(chinese)}</span>` : ''}</div>` : ''}</div>`;
};
v8HistoryLineItems = function v17HistoryLineItems(order) {
  const items = order.lineItems || order.itemsDetail || [];
  if (!items.length) return `<div class="row-sub" style="margin-top:6px">${esc(order.items || 'No detailed garment lines recorded on this older ticket.')}</div>`;
  return `<div style="margin-top:7px">${items.map(item => { const description = v8LinePrintDescription(item); return `<div style="font-size:11px;padding:4px 0;border-top:1px dotted var(--hairline)"><strong>${esc(description.name)}</strong>${description.detail ? `<br><span style="color:var(--ink-secondary)">${esc(description.detail)}</span>` : ''}<span style="float:right">${money(v17LineTotal(item))}</span></div>`; }).join('')}</div>`;
};
receiptTicketHTML = function v17ReceiptTicketHTML(order) {
  const customer = order.customerId ? customerById(order.customerId) : null, address = v8AddressForOrder(order), serviceId = v8OrderService(order), service = V8_SERVICE_NAMES[serviceId] || 'Cleaning';
  const subtotal = Number(order.subtotal ?? order.total ?? 0), fee = Number(order.surcharge || 0), tax = Number(order.tax || 0), grand = subtotal + fee + tax;
  const prepaid = Math.min(grand, Math.max(0, Number(order.amountCharged ?? (order.paid ? grand : 0)) || 0)), balance = Math.max(0, grand - prepaid), isPaid = balance < 0.005;
  const isDelivery = v17EffectiveDelivery(order, customer), apartment = String(address?.apartment || '').replace(/^(?:apt\.?|#)\s*/i, '').trim();
  const ticket = v11TicketNumber(order.ticket || order.id), createdEvent = (order.activity || []).find(event => event.type === 'created'), staff = createdEvent?.by || v6CurrentStaff()?.name || 'Staff', register = state.session?.register || 'R1';
  const lines = (order.lineItems || []).map(item => v11ReceiptItemHTML(item, serviceId)).join('') || `<div class="v11-item-line"><div class="rt-row"><strong>${esc(String(order.items || service).toUpperCase())}</strong><strong>${money(subtotal)}</strong></div></div>`;
  const action = `** ${isPaid ? 'PAID' : 'BALANCE DUE'} / ${isDelivery ? 'DELIVER' : 'PICKUP'} **`;
  const dueTime = order.rush && String(order.dueTime || '').includes('SOON') ? v17FormatClock(state.workflowSettings.rushReadyTime) : v17FormatClock(order.dueTime || '16:00');
  return `<section class="v8-print-ticket v11-photo-ticket">${order.rush ? '<div class="v17-top-alert">RUSH</div>' : ''}${apartment ? `<div class="v17-top-unit">APT ${esc(apartment.toUpperCase())}</div>` : (isDelivery ? '<div class="v17-top-unit">DELIVERY</div>' : '')}<div class="v11-store-name">Hattan Cleaners</div><div class="v11-store-line">141 3RD AVENUE</div><div class="v11-store-line">BET. 14TH &amp; 15TH</div><div class="v11-store-line">212 477 1740</div><div class="v11-ticket-number">${esc(ticket)}</div><div class="v11-customer-name">${esc(v11ReceiptCustomerName(order, customer))}</div>${isDelivery && address ? `<div class="v11-address">${esc(String(address.street || address.line1 || '').toUpperCase())}</div>${apartment ? `<div class="v11-address">APT ${esc(apartment.toUpperCase())}</div>` : ''}` : ''}<div class="v11-meta">${esc(customer?.customerNumber || 'WALK-IN')} (${esc(order.register || register)}) ${esc(order.createdBy || staff)} <span>${esc(v11ReceiptDateTime(order.createdAt))}</span></div><div class="rt-hr"></div><div class="v11-service-row"><strong>${esc(service.toUpperCase())}</strong></div>${lines}${order.notes ? `<div class="v11-notes"><strong>NOTES:</strong> ${esc(String(order.notes).toUpperCase())}</div>` : ''}<div class="rt-hr"></div><div class="v11-totals"><div class="v11-piece-count">${serviceId === 'washfold' ? `${esc(String((order.lineItems || [])[0]?.qty || order.pieceCount || 1))} lb` : `${esc(String(order.pieceCount || 1))} pc`}</div><div><div class="rt-row"><span>Sub.T</span><strong>${money(subtotal)}</strong></div><div class="rt-row"><span>Tax</span><strong>${money(tax)}</strong></div>${fee ? `<div class="rt-row"><span>Card Fee 3%</span><strong>${money(fee)}</strong></div>` : ''}<div class="rt-row rt-total"><span>G.Total</span><strong>${money(grand)}</strong></div><div class="rt-row"><span>PrePay</span><strong>${money(prepaid)}</strong></div><div class="rt-row rt-total"><span>Balance</span><strong>${money(balance)}</strong></div></div></div><div class="v11-hours">MON-FRI 8:00 AM - 6:00 PM<br>SATURDAY 9:00 AM - 4:00 PM</div><div class="v11-action">${esc(action)}</div>${isDelivery ? '<div class="v11-pickup-warning">** THIS TICKET IS NOT VALID FOR PICK UP **</div>' : ''}<div class="v11-ready-line"><span>Ready</span><strong>${esc(v11ReadyDate(order))}</strong><span>After ${esc(dueTime)}</span></div><div class="v11-bottom-ticket">${esc(ticket)}</div>${v8BarcodeHTML(order.barcode || v8MakeBarcode(order.ticket || order.id))}</section>`;
};

/* ------------------------ CREATE CORRECT PHYSICAL TICKETS ------------------------ */
posCompleteDropOff = function v17CompleteDropOff() {
  v9CommitPendingCurrentService(false, false);
  v14EnsureDraft(counterDraft);
  const draft = counterDraft, groups = v8DraftGroups(); if (!groups.length) return;
  const customer = draft.customerId ? customerById(draft.customerId) : null;
  const fulfillment = customer && v17CustomerDefault(customer) === 'delivery' && !draft.deliveryOverrideConfirmed ? 'delivery' : draft.fulfillment;
  if (fulfillment === 'delivery' && (!customer || !customer.addresses?.length)) return toast('Delivery needs an address on the customer profile', false, 'alerttriangle');
  const batchId = uid('visit_'), created = [];
  groups.forEach(group => {
    const service = group.service, key = v14GroupKey(group), ticket = state.nextTicket++, dueDate = draft.serviceDueDates[key] || draft.serviceDueDates[service] || v8DefaultDue(service);
    group.items.forEach(v17StampFlatLine);
    const subtotal = v8ServiceSubtotal(group.items), surcharge = draft.payNow && draft.paymentMethod === 'card' ? v17Round(subtotal * 0.03) : 0, pieceCount = v8PieceCount(group.items, service), rush = (draft.rushGroups || []).includes(key);
    const instruction = v14InstructionText(service), notes = [rush ? 'RUSH — SAME DAY' : '', instruction, String(draft.notes || '').trim()].filter(Boolean).join(' · '), needsTag = v17RequiresTag(service);
    const dueTime = rush ? v17FormatClock(draft.serviceDueTimes[key] || state.workflowSettings.rushReadyTime) : '04:00 PM';
    const order = {
      id:`HC-${ticket}`, ticket:String(ticket), barcode:v8MakeBarcode(ticket), channel:fulfillment === 'delivery' ? 'delivery' : 'counter', fulfillment, deliveryOverrideConfirmed:!!draft.deliveryOverrideConfirmed,
      customerId:draft.customerId, customerName:draft.customerId ? null : (draft.guestName.trim() || 'Walk-in Guest'), address:fulfillment === 'delivery' ? customer.addresses[0].id : null,
      items:`${V8_SERVICE_NAMES[service]} · ${pieceCount}${service === 'washfold' ? ' bag' : ` piece${pieceCount === 1 ? '' : 's'}`}`, services:[service], serviceType:service,
      total:subtotal, subtotal, surcharge, amountCharged:draft.payNow ? subtotal + surcharge : null, lineItems:group.items.map(item => ({ ...item })), itemsDetail:group.items.map(item => ({ ...item })),
      status:fulfillment === 'delivery' ? 'in_cleaning' : 'dropped_off', stageIndex:fulfillment === 'delivery' ? 2 : 0, rack:null, placedLabel:'Today', dateLabel:'Today', createdAt:v8NowISO(), dueDate, dueTime, rush,
      paid:false, paymentMethod:null, pointsAwarded:false, notes, tags:[...draft.tags.filter(tag => tag !== 'rush'), ...(rush ? ['rush'] : [])], garmentPhotos:draft.photos.slice(), deliveryPhotos:[], assignedDriverId:null, invoiced:false,
      intakeBatchId:batchId, pieceCount, tagNumber:null, tagNumbers:[], tagColor:null, tagColorHex:null, tagAssignedAt:null, register:state.session?.register || 'Store POS', createdBy:v6CurrentStaff()?.name || 'Staff', activity:[], aiTranscript:draft.aiTranscript || null, ticketGroup:key,
    };
    if (draft.payNow) { order.paymentMethod = draft.paymentMethod; finalizePayment(order); }
    v8AddActivity(order, 'created', `${V8_SERVICE_NAMES[service]} ticket created · ${needsTag ? 'awaiting physical tag assignment' : 'no garment tag required'}`, { dueDate, dueTime, barcode:order.barcode, rush });
    state.orders.unshift(order); created.push(order);
    recordSync(`Ticket #${ticket} created · ${V8_SERVICE_NAMES[service]} · Due ${dueDate}${rush ? ' · RUSH' : ''}`);
  });
  saveState();
  const visitTotal = created.reduce((sum, order) => sum + order.total + (order.surcharge || 0), 0);
  counterDraft = v8FreshCounterDraft(); posCustomerSearch = ''; state.posNav = 'orders'; v14CounterMode = 'home'; renderPosContent();
  openPosModal(`<h3>${icon('checkcircle', 17)} ${created.length} Separate Ticket${created.length === 1 ? '' : 's'} Created</h3><p class="pm-sub">One customer visit · ${money(visitTotal)} total</p>${created.map(order => `<div class="v5-subticket"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong>#${esc(order.ticket)} · ${esc(V8_SERVICE_NAMES[order.serviceType])}</strong><div class="row-sub">Due ${esc(order.dueDate)}${order.rush ? ` · RUSH after ${esc(order.dueTime)}` : ''} · ${money(order.total + (order.surcharge || 0))} · ${esc(order.barcode)}</div></div>${v17RequiresTag(order) ? '<span class="v8-tag-chip v12-awaiting-tag">Assign tag after intake</span>' : '<span class="v8-tag-chip">No garment tag</span>'}</div></div>`).join('')}<button class="btn btn-primary btn-block" onclick="v8PrintCreatedBatch('${batchId}')">${icon('printer', 16)} Print All on Star TSP100IV</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Done</button>`);
  toast(`${created.length} ticket${created.length === 1 ? '' : 's'} created with unique barcodes`, true, 'checkcircle');
};

/* ---------------------------- COUNTER ENHANCEMENTS ---------------------------- */
function v17BalanceBanner(customer) {
  if (!customer) return '';
  const outstanding = arBalance(customer.id), credit = Number(customer.storeCredit || 0);
  return `<div class="v17-balance-banner"><div class="v17-balance-box ${outstanding > 0 ? 'owes' : 'neutral'}"><small>Customer balance due</small><strong>${money(outstanding)}</strong></div><div class="v17-balance-box ${credit > 0 ? 'credit' : 'neutral'}"><small>Store credit available</small><strong>${money(credit)}</strong></div></div>`;
}
function v17ShirtColorsHTML() {
  const selected = counterDraft?.shirts?.colorId || 'white';
  return `<div class="v17-shirt-colors"><span class="field-label">Shirt color (optional)</span><div class="color-grid">${GARMENT_COLORS.map(color => `<div class="color-tile ${selected === color.id ? 'selected' : ''}" onclick="v17SetShirtColor('${color.id}')"><span class="color-swatch" style="background:${color.sw}"></span>${esc(color.name)}</div>`).join('')}</div></div>`;
}
function v17EnhanceMaterialLabels(content) {
  const materials = v8UpchargeMaterials();
  content.querySelectorAll('.chip,.v14-instruction-chip').forEach(node => {
    const material = materials.find(item => String(node.textContent || '').trim().toLowerCase().startsWith(String(item.name).toLowerCase()));
    if (material) node.textContent = `${material.name} · +${money(v17MaterialUpcharge(material.id))} flat`;
  });
}
function v17EnhanceCounter(content) {
  const ticketPanel = content.querySelector('.ticket-panel'), customer = counterDraft?.customerId ? customerById(counterDraft.customerId) : null;
  if (ticketPanel && customer && !ticketPanel.querySelector('.v17-balance-banner')) ticketPanel.querySelector('h3')?.parentElement?.insertAdjacentHTML('afterend', v17BalanceBanner(customer));
  if (counterDraft?.serviceMode === 'shirts' && !content.querySelector('.v17-shirt-colors')) {
    const starch = [...content.querySelectorAll('.field-label')].find(node => /^Starch$/i.test(String(node.textContent || '').trim()));
    if (starch) starch.insertAdjacentHTML('beforebegin', v17ShirtColorsHTML());
    else {
      const finish = [...content.querySelectorAll('.v14-instructions')].find(node => /Shirt finish/i.test(node.textContent || ''));
      finish?.insertAdjacentHTML('beforeend', v17ShirtColorsHTML());
    }
  }
  v17EnhanceMaterialLabels(content);
  content.querySelectorAll('.v8-ai-card,#v14-simple-ai').forEach(card => {
    if (card.querySelector('.v17-mic-tools')) return;
    const button = document.createElement('div'); button.className = 'v17-mic-tools';
    button.innerHTML = `<button class="btn btn-secondary btn-sm" id="v17-server-voice-btn" type="button" onclick="v17ToggleServerVoice()">${icon('mic', 14)} Reliable Windows recording</button><button class="btn btn-ghost btn-sm" type="button" onclick="v17OpenMicDiagnostic()">${icon('mic', 14)} Test Windows microphone</button><span class="v2-note">Typed intake always remains available.</span>`;
    card.appendChild(button);
  });
}
const v17BaseRenderCounter = renderPosCounter;
renderPosCounter = function v17RenderCounter(content) {
  v14EnsureDraft(counterDraft);
  v17BaseRenderCounter(content);
  v17EnhanceCounter(content);
};
const v17BaseRenderSimpleCounter = v13RenderSimpleCounter;
v13RenderSimpleCounter = function v17RenderSimpleCounter(content) {
  v14EnsureDraft(counterDraft);
  v17BaseRenderSimpleCounter(content);
  v17EnhanceCounter(content);
};

document.addEventListener('keyup', event => {
  if (event.key !== 'Shift' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
  if (!state.session?.loggedIn || state.posNav !== 'counter' || v14CounterMode !== 'dropoff') return;
  const input = document.getElementById('v17-free-instruction');
  if (input) { input.focus(); toast('Type any special instruction', true, 'list'); }
});

/* ------------------------ WINDOWS VOICE RELIABILITY ------------------------ */
let v17VoiceWanted = false, v17VoiceSeed = '', v17VoiceFinal = '';
let v17MicStream = null, v17MicContext = null, v17MicAnimation = null;
let v17ServerRecorder = null, v17ServerVoiceStream = null, v17ServerVoiceChunks = [], v17ServerVoiceTimer = null;
function v17VoiceStatus(message) {
  const status = document.getElementById('v3-mic-status'); if (status) status.textContent = message;
}
function v17SetListening(listening) {
  if (counterDraft) counterDraft.aiListening = listening;
  document.querySelectorAll('#v3-mic-btn').forEach(button => button.classList.toggle('listening', listening));
}
function v17VoiceErrorMessage(code) {
  return ({
    'not-allowed':'Microphone permission is blocked in Chrome or Windows.',
    'service-not-allowed':'Windows speech services are blocked for this browser.',
    'audio-capture':'Windows did not provide an active microphone to Chrome.',
    'network':'Windows speech recognition could not reach its speech service.',
    'aborted':'Voice intake stopped.',
    'no-speech':'No speech was detected. Move closer and try again.',
  })[code] || `Voice recognition error: ${code || 'unknown'}.`;
}
function v17ServerVoiceButton(recording) {
  document.querySelectorAll('#v17-server-voice-btn').forEach(button => {
    button.classList.toggle('recording', recording);
    button.innerHTML = recording ? `${icon('x', 14)} Stop &amp; transcribe` : `${icon('mic', 14)} Reliable Windows recording`;
  });
}
function v17StopServerVoiceTracks() {
  if (v17ServerVoiceTimer) window.clearTimeout(v17ServerVoiceTimer);
  v17ServerVoiceTimer = null;
  v17ServerVoiceStream?.getTracks?.().forEach(track => track.stop());
  v17ServerVoiceStream = null;
}
async function v17ToggleServerVoice() {
  if (v17ServerRecorder?.state === 'recording') { v17ServerRecorder.stop(); return; }
  if (!window.MediaRecorder) return toast('This Chrome version cannot record audio. Update Chrome or keep typing.', false, 'alerttriangle');
  try {
    v17VoiceWanted = false; try { posVoiceRecognition?.stop(); } catch (_) { /* browser recognition is already stopped */ }
    v17ServerVoiceStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported?.(type));
    v17ServerVoiceChunks = [];
    v17ServerRecorder = new MediaRecorder(v17ServerVoiceStream, preferred ? { mimeType:preferred } : undefined);
    v17ServerRecorder.ondataavailable = event => { if (event.data?.size) v17ServerVoiceChunks.push(event.data); };
    v17ServerRecorder.onerror = () => { v17StopServerVoiceTracks(); v17ServerVoiceButton(false); v17VoiceStatus('Windows recording failed. Run the microphone test or keep typing.'); };
    v17ServerRecorder.onstop = async () => {
      v17StopServerVoiceTracks(); v17ServerVoiceButton(false);
      const blob = new Blob(v17ServerVoiceChunks, { type:v17ServerRecorder?.mimeType || 'audio/webm' }); v17ServerVoiceChunks = [];
      if (blob.size < 800) return v17VoiceStatus('No usable audio was recorded. Check the Windows input meter and try again.');
      if (blob.size > 4.5 * 1024 * 1024) return v17VoiceStatus('That recording is too long. Record a shorter intake and try again.');
      v17VoiceStatus('Securely transcribing the Windows recording…');
      try {
        const response = await v16Api('voice-transcribe', { method:'POST', body:JSON.stringify({ audioDataUrl:await v17FileDataUrl(blob) }) });
        if (!response.ok) throw new Error(response.data?.error || 'The secure transcription service could not complete the recording.');
        const transcript = String(response.data?.transcript || '').trim();
        if (!transcript) throw new Error('No speech was found in the recording.');
        const existing = String(document.getElementById('v3-ai-transcript')?.value || counterDraft?.aiTranscript || '').trim();
        const combined = [existing, transcript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        counterDraft.aiTranscript = combined;
        const box = document.getElementById('v3-ai-transcript'); if (box) box.value = combined;
        v17VoiceStatus('Windows recording transcribed. Review it, then choose Interpret.');
        toast('Voice intake transcribed', true, 'checkcircle');
      } catch (error) { v17VoiceStatus(error.message); toast(error.message, false, 'alerttriangle'); }
    };
    v17ServerRecorder.start(250); v17ServerVoiceButton(true);
    v17VoiceStatus('Recording reliably on Windows… speak naturally, then press Stop & transcribe.');
    v17ServerVoiceTimer = window.setTimeout(() => { if (v17ServerRecorder?.state === 'recording') v17ServerRecorder.stop(); }, 45000);
  } catch (error) {
    v17StopServerVoiceTracks(); v17ServerVoiceButton(false);
    v17VoiceStatus(v17VoiceErrorMessage(error?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture'));
    v17OpenMicDiagnostic();
  }
}
async function v17RequestMicrophone() {
  if (!window.isSecureContext) throw new Error('secure-context');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('media-unavailable');
  const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
  stream.getTracks().forEach(track => track.stop());
}
posToggleAiVoice = async function v17ToggleAiVoice() {
  if (!counterDraft) return;
  if (v17VoiceWanted || counterDraft.aiListening) {
    v17VoiceWanted = false; v17SetListening(false);
    try { posVoiceRecognition?.stop(); } catch (_) { /* already stopped */ }
    v17VoiceStatus('Voice stopped. Review the transcript or keep typing.');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return toast('Chrome voice recognition is unavailable. You can keep typing the intake.', false, 'alerttriangle');
  v17VoiceStatus('Checking the Windows microphone…');
  try { await v17RequestMicrophone(); }
  catch (error) {
    const blocked = ['NotAllowedError', 'SecurityError'].includes(error?.name);
    v17VoiceStatus(blocked ? 'Microphone blocked. Open the microphone test for exact Windows steps.' : 'No working Windows microphone was found.');
    toast(blocked ? 'Allow microphone access in Chrome and Windows' : 'Windows did not provide a working microphone', false, 'alerttriangle');
    v17OpenMicDiagnostic(); return;
  }
  v17VoiceWanted = true;
  v17VoiceSeed = String(document.getElementById('v3-ai-transcript')?.value || counterDraft.aiTranscript || '').trim();
  v17VoiceFinal = '';
  const startRecognition = () => {
    if (!v17VoiceWanted) return;
    const recognition = new SpeechRecognition(); posVoiceRecognition = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { v17SetListening(true); v17VoiceStatus('Listening on Windows… speak naturally; tap the mic to stop.'); };
    recognition.onresult = event => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const phrase = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) v17VoiceFinal += `${phrase} `; else interim += phrase;
      }
      const text = [v17VoiceSeed, v17VoiceFinal.trim(), interim.trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      counterDraft.aiTranscript = text;
      const box = document.getElementById('v3-ai-transcript'); if (box) box.value = text;
      v17VoiceStatus(interim ? `Hearing: “${interim.trim()}”` : 'Speech captured. Keep talking or tap to stop.');
    };
    recognition.onerror = event => {
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error);
      v17VoiceStatus(v17VoiceErrorMessage(event.error));
      if (fatal) { v17VoiceWanted = false; v17SetListening(false); toast(v17VoiceErrorMessage(event.error), false, 'alerttriangle'); }
    };
    recognition.onend = () => {
      v17SetListening(false);
      if (v17VoiceWanted) window.setTimeout(startRecognition, 260);
      else v17VoiceStatus('Voice stopped. Review the transcript, then choose Interpret.');
    };
    try { recognition.start(); }
    catch (error) { v17VoiceWanted = false; v17SetListening(false); v17VoiceStatus('Chrome could not start speech recognition. Use the microphone test below.'); }
  };
  startRecognition();
};
function v17StopMicDiagnostic() {
  if (v17MicAnimation) cancelAnimationFrame(v17MicAnimation);
  v17MicAnimation = null;
  v17MicStream?.getTracks?.().forEach(track => track.stop()); v17MicStream = null;
  try { v17MicContext?.close?.(); } catch (_) { /* already closed */ }
  v17MicContext = null;
}
function v17OpenMicDiagnostic() {
  openPosModal(`<div class="v17-mic-diagnostic"><h3>${icon('mic', 18)} Windows Microphone Check</h3><p class="pm-sub">This tests the microphone before Chrome speech recognition starts.</p><div id="v17-mic-result" class="v17-import-warning">Press Start Test and speak. Chrome may ask for permission near the address bar.</div><div class="v17-mic-meter"><span id="v17-mic-level"></span></div><div id="v17-device-list" class="v17-device-list">Microphones have not been checked yet.</div><button class="btn btn-primary btn-block" onclick="v17StartMicDiagnostic()">Start Microphone Test</button><div class="v17-import-warning"><strong>If the meter does not move:</strong><br>1. Windows Settings → Privacy &amp; security → Microphone → turn access on.<br>2. Windows Settings → System → Sound → Input → choose the microphone and raise its volume.<br>3. In Chrome, click the icon left of the site address → Site settings → Microphone → Allow.<br>4. Reload the POS once after changing permission.</div><button class="btn btn-ghost btn-block" onclick="v17StopMicDiagnostic();closePosModal()">Close</button></div>`);
}
async function v17StartMicDiagnostic() {
  v17StopMicDiagnostic();
  const result = document.getElementById('v17-mic-result');
  try {
    if (!window.isSecureContext) throw new Error('The POS must be opened from its HTTPS Netlify address.');
    v17MicStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const devices = await navigator.mediaDevices.enumerateDevices(), microphones = devices.filter(device => device.kind === 'audioinput');
    const list = document.getElementById('v17-device-list');
    if (list) list.innerHTML = `<strong>${microphones.length} microphone${microphones.length === 1 ? '' : 's'} found</strong><br>${microphones.map((device, index) => esc(device.label || `Microphone ${index + 1} (label appears after permission)`)).join('<br>')}`;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    v17MicContext = new AudioContext();
    const analyser = v17MicContext.createAnalyser(), source = v17MicContext.createMediaStreamSource(v17MicStream), samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    const update = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0; samples.forEach(value => { peak = Math.max(peak, Math.abs(value - 128)); });
      const percent = Math.min(100, peak * 2.6), meter = document.getElementById('v17-mic-level'); if (meter) meter.style.width = `${percent}%`;
      if (result) result.innerHTML = percent > 4 ? '<strong>Microphone is working.</strong> The meter is receiving your voice.' : 'Microphone is connected. Speak louder and watch the meter.';
      v17MicAnimation = requestAnimationFrame(update);
    };
    update();
  } catch (error) {
    if (result) result.innerHTML = `<strong>Microphone test failed.</strong> ${esc(error?.message || error?.name || 'Permission or Windows input error')}`;
  }
}
const v17BaseClosePosModal = closePosModal;
closePosModal = function v17ClosePosModal() { v17StopMicDiagnostic(); return v17BaseClosePosModal(); };

/* ------------------------------- SETTINGS ------------------------------- */
function v17SetWorkflowSetting(key, value) {
  v17EnsureData(); state.workflowSettings[key] = value; saveState();
  if (state.posNav === 'settings') renderPosContent();
}
function v17SetMaterialUpcharge(materialId, value) {
  const material = state.materials.find(item => item.id === materialId); if (!material) return;
  material.upcharge = v17Round(Math.max(0, Number(value || 0))); saveState();
}
function v17WorkflowSettingsHTML() {
  const manager = !!v6CurrentStaff()?.manager;
  return `<div class="pos-card"><h3>${icon('clock', 17)} Rush, Printing &amp; Production</h3><div class="v17-settings-grid"><label class="v17-settings-field"><span>Default RUSH ready time</span><input class="text-input" type="time" value="${esc(v17ClockInput(state.workflowSettings.rushReadyTime))}" onchange="v17SetWorkflowSetting('rushReadyTime',this.value)"></label><label class="pref-row"><div><div class="pr-label">Print enabled Chinese instructions</div><div class="pr-sub">Adds Chinese beneath recognized production details and selected translated instructions.</div></div><input type="checkbox" style="width:22px;height:22px" ${state.workflowSettings.printChineseInstructions ? 'checked' : ''} onchange="v17SetWorkflowSetting('printChineseInstructions',this.checked)"></label></div><div class="v2-note" style="margin-top:9px">RUSH defaults to same day after ${esc(v17FormatClock(state.workflowSettings.rushReadyTime))}; staff can edit the time on each ticket.</div></div>
  <div class="pos-card"><h3>Flat Special-Material Upcharges</h3><div class="v2-note">These amounts are added once per ticket line, not multiplied by garment quantity. Standard cotton has no material charge.</div><div class="v17-material-table">${v8UpchargeMaterials().map(material => `<label class="v17-material-row"><strong>${esc(material.name)}</strong><input class="text-input" type="number" min="0" step=".25" value="${Number(v17MaterialUpcharge(material.id)).toFixed(2)}" onchange="v17SetMaterialUpcharge('${material.id}',this.value)"></label>`).join('')}</div></div>
  <div class="pos-card"><h3>${icon('list', 17)} English → Chinese Ticket Instructions</h3><div class="v2-note">Turn on only the translations you want printed. English always remains visible.</div><div class="v17-translation-grid">${Object.keys(V14_SERVICE_INSTRUCTIONS).map(service => `<h4>${esc(V8_SERVICE_NAMES[service])}</h4>${v14InstructionRows(service).map(row => `<div class="v17-translation-row"><label>${esc(row.label)}</label><input class="text-input" value="${esc(row.zh || '')}" onchange="v17SetTranslation('${service}','${row.id}','zh',this.value)"><label><input type="checkbox" ${row.enabled ? 'checked' : ''} onchange="v17SetTranslation('${service}','${row.id}','enabled',this.checked)"> Print</label></div>`).join('')}`).join('')}</div></div>
  <div class="pos-card"><h3>${icon('mic', 17)} Windows Voice Intake</h3><div class="v2-note">Run this at each Windows counter after a browser or Windows update.</div><button class="btn btn-secondary" style="margin-top:10px" onclick="v17OpenMicDiagnostic()">Test Windows Microphone</button></div>
  ${manager ? `<div class="pos-card"><h3>${icon('users', 17)} Legacy POS Import Center</h3><div class="v2-note">Import customer exports, ticket history, balances, credits, notes and revenue. Screenshots are extracted into a review draft and never written until you approve.</div><div class="v15-two-actions" style="margin-top:10px"><button class="btn btn-primary" onclick="v17OpenImportCenter()">Open Guided Import</button><button class="btn btn-secondary" onclick="v17DownloadBackup()">Download Current Backup</button></div></div>` : ''}`;
}
const v17BaseRenderSettings = renderPosSettings;
renderPosSettings = function v17RenderSettings(content) {
  v17EnsureData(); v17BaseRenderSettings(content);
  content.insertAdjacentHTML('afterbegin', v17WorkflowSettingsHTML());
  content.querySelectorAll('.v16-eyebrow').forEach(node => { node.textContent = V17_VERSION; });
};

/* -------------------------- GUIDED LEGACY IMPORT -------------------------- */
let v17ImportPreview = null;
function v17EmptyImport() { return { customers:[], tickets:[], daily_revenue:[], warnings:[], sources:[] }; }
function v17ImportNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value ?? '').replace(/[$,()\s]/g, match => match === '(' ? '-' : ''));
  return Number.isFinite(number) ? number : null;
}
function v17NormalizeHeader(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function v17Pick(row, names) {
  for (const name of names) if (row[name] !== undefined && String(row[name]).trim() !== '') return row[name];
  return null;
}
function v17ParseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(field); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field); if (row.some(cell => String(cell).trim())) rows.push(row); row = []; field = '';
    } else field += character;
  }
  row.push(field); if (row.some(cell => String(cell).trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(v17NormalizeHeader);
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
function v17RowsToImport(rows, sourceName) {
  const output = v17EmptyImport(); output.sources.push(sourceName);
  rows.forEach(row => {
    const normalized = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [v17NormalizeHeader(key), value]));
    const ticketNumber = v17Pick(normalized, ['ticket_number', 'ticket_no', 'ticket', 'order_number', 'order_no']);
    const customerNumber = v17Pick(normalized, ['customer_number', 'customer_no', 'customer_id', 'account_number', 'account_no', 'no']);
    const name = v17Pick(normalized, ['customer_name', 'name', 'full_name']) || [v17Pick(normalized, ['last_name', 'lastname']), v17Pick(normalized, ['first_name', 'firstname'])].filter(Boolean).join(', ');
    const date = v17Pick(normalized, ['revenue_date', 'business_date', 'date']);
    const revenue = v17Pick(normalized, ['gross_revenue', 'revenue', 'gross_sales', 'net_sales']);
    if (ticketNumber) {
      output.tickets.push({
        ticket_number:String(ticketNumber), customer_number:customerNumber ? String(customerNumber) : null, customer_name:name ? String(name) : null,
        created_at:v17Pick(normalized, ['created_at', 'in_datetime', 'in_date', 'dropoff_date', 'date']) || null,
        due_date:v17Pick(normalized, ['due_date', 'ready_date']) || null, status:v17Pick(normalized, ['status', 'ticket_status']) || null,
        total:v17ImportNumber(v17Pick(normalized, ['grand_total', 'g_total', 'total', 'amount'])), balance:v17ImportNumber(v17Pick(normalized, ['balance', 'amount_due'])),
        service:v17Pick(normalized, ['service', 'type', 'ticket_type']) || null, items:v17Pick(normalized, ['items', 'description', 'garments']) || null,
        notes:v17Pick(normalized, ['notes', 'memo', 'special_instructions']) || null,
      });
    } else if (name || customerNumber || v17Pick(normalized, ['phone', 'phone_number', 'telephone'])) {
      output.customers.push({
        customer_number:customerNumber ? String(customerNumber) : null, name:name ? String(name) : null,
        phone:v17Pick(normalized, ['phone', 'phone_number', 'telephone', 'mobile']) || null, email:v17Pick(normalized, ['email', 'email_address']) || null,
        address_line1:v17Pick(normalized, ['address', 'address_line1', 'street', 'street_address']) || null, apartment:v17Pick(normalized, ['apartment', 'apt', 'unit']) || null,
        city:v17Pick(normalized, ['city']) || null, state:v17Pick(normalized, ['state', 'region']) || null, postal_code:v17Pick(normalized, ['zip', 'zip_code', 'postal_code']) || null,
        balance:v17ImportNumber(v17Pick(normalized, ['balance', 'amount_due', 'debit_amount'])), store_credit:v17ImportNumber(v17Pick(normalized, ['store_credit', 'credit_amount', 'credit'])),
        memo:v17Pick(normalized, ['memo', 'notes', 'customer_notes']) || null, preferences:v17Pick(normalized, ['preferences', 'garment_preferences', 'special_instructions']) || null,
        default_fulfillment:v17Pick(normalized, ['default_fulfillment', 'fulfillment', 'delivery_or_pickup', 'route_type']) || null,
      });
    } else if (date && revenue !== null) {
      output.daily_revenue.push({ date:String(date), gross:v17ImportNumber(revenue), net:v17ImportNumber(v17Pick(normalized, ['net_revenue', 'net_sales'])), cash:v17ImportNumber(v17Pick(normalized, ['cash'])), card:v17ImportNumber(v17Pick(normalized, ['card', 'credit_card'])), refunds:v17ImportNumber(v17Pick(normalized, ['refunds'])) });
    }
  });
  if (!output.customers.length && !output.tickets.length && !output.daily_revenue.length) output.warnings.push(`${sourceName}: no recognizable customer, ticket or revenue columns were found.`);
  return output;
}
function v17NormalizeImportShape(value, sourceName) {
  if (Array.isArray(value)) return v17RowsToImport(value, sourceName);
  const output = v17EmptyImport(); output.sources.push(sourceName);
  const customers = value?.customers || value?.customer_records || [], tickets = value?.tickets || value?.orders || value?.ticket_records || [], revenue = value?.daily_revenue || value?.revenue || [];
  output.customers.push(...customers); output.tickets.push(...tickets); output.daily_revenue.push(...revenue); output.warnings.push(...(value?.warnings || []));
  if (!output.customers.length && !output.tickets.length && !output.daily_revenue.length) return v17RowsToImport([value], sourceName);
  return output;
}
function v17MergeImport(target, incoming) {
  target.customers.push(...(incoming.customers || [])); target.tickets.push(...(incoming.tickets || [])); target.daily_revenue.push(...(incoming.daily_revenue || [])); target.warnings.push(...(incoming.warnings || [])); target.sources.push(...(incoming.sources || []));
  return target;
}
function v17OpenImportCenter() {
  if (!v6CurrentStaff()?.manager) return toast('Manager access is required for data import', false, 'alerttriangle');
  v17ImportPreview = v17EmptyImport();
  openPosModal(`<div class="v17-import-center"><h3>${icon('users', 18)} Guided Legacy POS Import</h3><p class="pm-sub">Start with an export file whenever possible. For screens that cannot export, upload clear screenshots or photos. Nothing is applied until the final approval button.</p><label id="v17-import-drop" class="v17-import-drop" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="v17ImportDrop(event)"><div><strong>Drop files here or choose files</strong><span>CSV, JSON, PNG or JPG · multiple files allowed</span></div><input id="v17-import-files" type="file" multiple accept=".csv,.json,image/png,image/jpeg" onchange="v17ImportFiles(this.files)"></label><div class="v17-import-warning"><strong>Safest order:</strong> customers first, then ticket history, then daily revenue. A backup downloads automatically before Apply.<br><strong>Privacy:</strong> never upload card numbers, card photos, PINs or passwords. Every extracted row must be reviewed.</div><div id="v17-import-status" class="v17-import-status"></div><div id="v17-import-preview" class="v17-import-preview"></div><div class="v15-two-actions" style="margin-top:12px"><button class="btn btn-primary" id="v17-import-apply" disabled onclick="v17ApplyImport()">Review Complete — Apply Import</button><button class="btn btn-secondary" onclick="v17DownloadBackup()">Download Backup</button></div><button class="btn btn-ghost btn-block" style="margin-top:9px" onclick="closePosModal()">Cancel</button></div>`);
  document.getElementById('pos-modal')?.classList.add('v15-wide-modal');
}
function v17ImportDrop(event) {
  event.preventDefault(); event.currentTarget.classList.remove('drag'); v17ImportFiles(event.dataTransfer.files);
}
function v17FileDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}
async function v17ImportImageDataUrl(file) {
  const original = await v17FileDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = original;
  });
  const maxSide = 2200, scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d', { alpha:false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .84);
}
async function v17ImportFiles(fileList) {
  const files = [...(fileList || [])]; if (!files.length) return;
  const status = document.getElementById('v17-import-status');
  for (const file of files) {
    if (status) status.innerHTML = `<span class="spinner mini"></span> Reading ${esc(file.name)}…`;
    try {
      let imported;
      if (/\.csv$/i.test(file.name)) imported = v17RowsToImport(v17ParseCsv(await file.text()), file.name);
      else if (/\.json$/i.test(file.name)) imported = v17NormalizeImportShape(JSON.parse(await file.text()), file.name);
      else if (/^image\/(png|jpeg)$/i.test(file.type)) {
        const response = await v16Api('legacy-import-extract', { method:'POST', body:JSON.stringify({ sourceName:file.name, imageDataUrl:await v17ImportImageDataUrl(file) }) });
        if (!response.ok) throw new Error(response.data?.error || 'The secure image extractor could not read this image.');
        imported = v17NormalizeImportShape(response.data.extracted, file.name);
      } else throw new Error('Unsupported file type');
      v17MergeImport(v17ImportPreview, imported);
    } catch (error) { v17ImportPreview.warnings.push(`${file.name}: ${error.message}`); }
  }
  v17RenderImportPreview();
  if (status) status.textContent = `Review ${v17ImportPreview.customers.length} customer, ${v17ImportPreview.tickets.length} ticket and ${v17ImportPreview.daily_revenue.length} revenue record(s).`;
}
function v17RenderImportPreview() {
  const host = document.getElementById('v17-import-preview'); if (!host || !v17ImportPreview) return;
  const rows = [
    ...v17ImportPreview.customers.map((record, index) => ({ collection:'customers', index, type:'Customer', key:record.customer_number || record.name || 'Unidentified', detail:[record.phone, record.address_line1, record.apartment, record.balance !== null && record.balance !== undefined ? `Balance ${money(record.balance)}` : '', record.store_credit ? `Credit ${money(record.store_credit)}` : ''].filter(Boolean).join(' · ') })),
    ...v17ImportPreview.tickets.map((record, index) => ({ collection:'tickets', index, type:'Ticket', key:record.ticket_number || 'Unnumbered', detail:[record.customer_name || record.customer_number, record.created_at, record.service, record.total !== null && record.total !== undefined ? money(record.total) : ''].filter(Boolean).join(' · ') })),
    ...v17ImportPreview.daily_revenue.map((record, index) => ({ collection:'daily_revenue', index, type:'Revenue', key:record.date || 'Unknown date', detail:`Gross ${record.gross === null || record.gross === undefined ? '—' : money(record.gross)} · Net ${record.net === null || record.net === undefined ? '—' : money(record.net)}` })),
  ];
  host.innerHTML = `${v17ImportPreview.warnings.length ? `<div class="v17-import-warning"><strong>Needs review</strong><br>${v17ImportPreview.warnings.map(esc).join('<br>')}</div>` : ''}${rows.length ? `<table><thead><tr><th>Record</th><th>Identity</th><th>Extracted details</th><th>Keep?</th></tr></thead><tbody>${rows.slice(0, 300).map(row => `<tr><td>${esc(row.type)}</td><td><strong>${esc(row.key)}</strong></td><td>${esc(row.detail)}</td><td><button class="btn btn-ghost btn-sm" type="button" onclick="v17RemoveImportRecord('${row.collection}',${row.index})">Remove</button></td></tr>`).join('')}</tbody></table>${rows.length > 300 ? `<div class="v17-import-warning">Showing the first 300 of ${rows.length} records. Import large exports in smaller batches when practical.</div>` : ''}` : '<div class="table-empty">No recognizable records yet.</div>'}`;
  const apply = document.getElementById('v17-import-apply'); if (apply) apply.disabled = !rows.length;
}
function v17RemoveImportRecord(collection, index) {
  if (!['customers', 'tickets', 'daily_revenue'].includes(collection) || !Array.isArray(v17ImportPreview?.[collection])) return;
  v17ImportPreview[collection].splice(Number(index), 1);
  v17RenderImportPreview();
  const status = document.getElementById('v17-import-status');
  if (status) status.textContent = 'Record removed from this review draft. No live data has changed.';
}
function v17DownloadBackup() {
  const snapshot = typeof v16BuildSnapshot === 'function' ? v16BuildSnapshot() : v17DeepClone(state);
  const blob = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(), version:V17_VERSION, snapshot }, null, 2)], { type:'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `hattan-pos-backup-${v8TodayISO()}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function v17ImportPhone(value) { return String(value || '').replace(/\D/g, ''); }
function v17ImportDate(value) {
  if (!value) return v8NowISO();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? v8NowISO() : parsed.toISOString();
}
function v17FindImportCustomer(record) {
  const number = String(record.customer_number || '').replace(/\D/g, ''), phone = v17ImportPhone(record.phone), name = String(record.name || record.customer_name || '').trim().toLowerCase();
  return state.customers.find(customer => (number && String(customer.customerNumber || '').replace(/\D/g, '') === number) || (phone && v17ImportPhone(customer.phone) === phone) || (name && String(customer.name || '').trim().toLowerCase() === name));
}
function v17ApplyCustomerImport(record) {
  let customer = v17FindImportCustomer(record), created = false;
  if (!customer) {
    const name = String(record.name || `Legacy Customer ${record.customer_number || state.nextCustomerNumber}`).trim();
    customer = { id:uid('cust_'), customerNumber:String(record.customer_number || `C-${state.nextCustomerNumber++}`), name, initials:v14Initials(name), phone:'', email:'', memberSince:'Legacy import', points:0, storeCredit:0, preferredChannel:'pickup', defaultFulfillment:'pickup', addresses:[], paymentMethods:[], garmentPrefs:{ starch:'light', fold:'hang', fragranceFree:false, notes:'' } };
    state.customers.push(customer); created = true;
  }
  if (record.customer_number) customer.customerNumber = String(record.customer_number);
  const customerDigits = Number(String(customer.customerNumber || '').replace(/\D/g, ''));
  if (Number.isSafeInteger(customerDigits)) state.nextCustomerNumber = Math.max(Number(state.nextCustomerNumber || 10001), customerDigits + 1);
  if (record.name) { customer.name = String(record.name); customer.initials = v14Initials(customer.name); }
  if (record.phone) customer.phone = String(record.phone);
  if (record.email) customer.email = String(record.email);
  if ([record.address_line1, record.apartment, record.city, record.state, record.postal_code].some(Boolean)) {
    const address = customer.addresses?.[0] || { id:uid('addr_'), label:'Home' };
    address.street = String(record.address_line1 || address.street || ''); address.apartment = String(record.apartment || address.apartment || ''); address.city = String(record.city || address.city || ''); address.state = String(record.state || address.state || ''); address.postalCode = String(record.postal_code || address.postalCode || '');
    address.line1 = [address.street, address.apartment ? `Apt ${address.apartment}` : ''].filter(Boolean).join(', '); address.line2 = [address.city, address.state, address.postalCode].filter(Boolean).join(' '); address.building = address.street || 'Legacy address';
    customer.addresses = customer.addresses || []; if (!customer.addresses.length) customer.addresses.push(address);
  }
  if (record.balance !== null && record.balance !== undefined) {
    const balance = Number(record.balance || 0);
    customer.openingBalance = Math.max(0, balance);
    if (balance < 0) customer.storeCredit = Math.max(Number(customer.storeCredit || 0), Math.abs(balance));
  }
  if (record.store_credit !== null && record.store_credit !== undefined) customer.storeCredit = Math.max(0, Number(record.store_credit || 0));
  if (/^deliver/i.test(String(record.default_fulfillment || ''))) customer.defaultFulfillment = customer.preferredChannel = 'delivery';
  if (/^pick|counter/i.test(String(record.default_fulfillment || ''))) customer.defaultFulfillment = customer.preferredChannel = 'pickup';
  if (record.preferences) { customer.garmentPrefs = customer.garmentPrefs || {}; customer.garmentPrefs.notes = String(record.preferences); }
  if (record.memo) state.customerMemos[customer.id] = [state.customerMemos[customer.id], String(record.memo)].filter(Boolean).join(' · ');
  return { customer, created };
}
function v17ImportService(value) {
  const text = String(value || '').toLowerCase();
  if (/wash|fold/.test(text)) return 'washfold'; if (/shirt|launder/.test(text)) return 'shirts'; if (/alter|tailor/.test(text)) return 'alterations'; return 'dryclean';
}
function v17ApplyTicketImport(record, balanceCustomers) {
  const ticket = String(record.ticket_number || '').trim(); if (!ticket) return false;
  if (state.orders.some(order => String(order.ticket || '') === ticket || String(order.legacyTicketNumber || '') === ticket)) return false;
  let customer = v17FindImportCustomer({ customer_number:record.customer_number, name:record.customer_name });
  if (!customer && record.customer_name) customer = v17ApplyCustomerImport({ customer_number:record.customer_number, name:record.customer_name }).customer;
  const total = Math.max(0, Number(record.total || 0)), balance = Math.max(0, Number(record.balance || 0)), statusText = String(record.status || '').toLowerCase();
  const closed = /picked|deliver|complete|closed|out/.test(statusText) || (!statusText && balance <= 0), status = closed ? 'picked_up' : (/ready/.test(statusText) ? 'ready' : 'dropped_off');
  const service = v17ImportService(record.service), accounted = !!(customer && balanceCustomers.has(customer.id));
  const amountPaid = Math.max(0, total - balance);
  const order = { id:uid('legacy_order_'), legacyTicketNumber:ticket, ticket, barcode:v8MakeBarcode(ticket), channel:'counter', fulfillment:'pickup', customerId:customer?.id || null, customerName:customer ? null : (record.customer_name || 'Legacy Customer'), address:null, items:String(record.items || record.service || V8_SERVICE_NAMES[service]), services:[service], serviceType:service, total, subtotal:total, surcharge:0, amountCharged:amountPaid, amountPaid, lineItems:[], itemsDetail:[], status, stageIndex:status === 'ready' ? 4 : 0, rack:null, placedLabel:'Legacy import', dateLabel:'Legacy import', createdAt:v17ImportDate(record.created_at), dueDate:record.due_date || null, dueTime:'04:00 PM', rush:false, paid:balance <= 0, paymentMethod:'legacy', pointsAwarded:false, notes:String(record.notes || ''), tags:[], garmentPhotos:[], deliveryPhotos:[], assignedDriverId:null, invoiced:false, pieceCount:1, tagNumber:null, tagNumbers:[], tagColor:null, activity:[], importedAt:v8NowISO(), legacyBalanceAccounted:accounted };
  v8AddActivity(order, 'import', 'Imported from legacy POS review'); state.orders.push(order);
  const ticketDigits = Number(ticket.replace(/\D/g, ''));
  if (Number.isSafeInteger(ticketDigits)) state.nextTicket = Math.max(Number(state.nextTicket || 1), ticketDigits + 1);
  return true;
}
function v17ApplyImport() {
  if (!v6CurrentStaff()?.manager || !v17ImportPreview) return;
  const count = v17ImportPreview.customers.length + v17ImportPreview.tickets.length + v17ImportPreview.daily_revenue.length;
  if (!confirm(`Apply ${count} reviewed legacy record(s)? A JSON backup will download first.`)) return;
  v17DownloadBackup();
  let customersCreated = 0, customersUpdated = 0, ticketsAdded = 0, revenueAdded = 0;
  const balanceCustomers = new Set();
  v17ImportPreview.customers.forEach(record => { const result = v17ApplyCustomerImport(record); if (result.created) customersCreated++; else customersUpdated++; if (record.balance !== null && record.balance !== undefined) balanceCustomers.add(result.customer.id); });
  v17ImportPreview.tickets.forEach(record => { if (v17ApplyTicketImport(record, balanceCustomers)) ticketsAdded++; });
  v17ImportPreview.daily_revenue.forEach(record => {
    const key = String(record.date || ''); if (!key) return;
    const existing = state.dailyRevenue.find(row => String(row.date) === key), normalized = { date:key, gross:Number(record.gross || 0), net:Number(record.net ?? record.gross ?? 0), cash:Number(record.cash || 0), card:Number(record.card || 0), refunds:Number(record.refunds || 0), importedAt:v8NowISO() };
    if (existing) Object.assign(existing, normalized); else { state.dailyRevenue.push(normalized); revenueAdded++; }
  });
  state.legacyImports.unshift({ id:uid('legacy_import_'), at:v8NowISO(), by:v6CurrentStaff()?.name || 'Manager', sources:[...new Set(v17ImportPreview.sources)], customersCreated, customersUpdated, ticketsAdded, revenueAdded, warnings:v17ImportPreview.warnings.slice() });
  recordSync(`Legacy import · ${customersCreated} customers created · ${customersUpdated} updated · ${ticketsAdded} tickets · ${revenueAdded} revenue days`); saveState(); closePosModal(); renderPosContent();
  toast(`Import complete: ${customersCreated} new customers, ${customersUpdated} updated, ${ticketsAdded} tickets`, true, 'checkcircle');
}

/* Version labels are cosmetic; all state changes above are functional. */
const v17BasePosShellHTML = posShellHTML;
posShellHTML = function v17PosShellHTML() {
  return v17BasePosShellHTML().replace(/Staff POS(?: · V[\w. ]+)?/g, `Staff POS · ${V17_VERSION}`);
};

v17EnsureData();
