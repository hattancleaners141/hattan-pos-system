/* ============================================================================
   HATTAN OPS V19 — CUSTOMER CONTROLS
   Customer finance, delivery safeguards, bilingual Wash & Fold production
   instructions, exact post-intake tag queues and large thermal priority flags.
============================================================================ */

const V19_VERSION = 'V19 Customer Controls';
const V19_TAG_SERVICES = new Set(['dryclean', 'shirts', 'alterations']);
const V19_WASHFOLD_CHINESE = {
  lowdry:{ label:'Low dry', zh:'低温烘干' },
  nosoftener:{ label:'No softener', zh:'不使用柔顺剂' },
  delicate:{ label:'Delicate cycle', zh:'轻柔洗涤' },
  separate:{ label:'Separate darks & whites', zh:'深色与白色分开' },
};

function v19Round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function v19EnsureDraft(draft) {
  if (!draft) return draft;
  v14EnsureDraft(draft);
  if (typeof draft.useStoreCredit !== 'boolean') draft.useStoreCredit = false;
  if (typeof draft.deliveryOverrideConfirmed !== 'boolean') draft.deliveryOverrideConfirmed = false;
  if (draft.instructionOpen?.washfold === undefined) draft.instructionOpen.washfold = true;
  return draft;
}

function v19EnsureTagRules() {
  for (let index = V12_TAG_COLORS.length - 1; index >= 0; index--) {
    if (String(V12_TAG_COLORS[index]?.name || '').toLowerCase() === 'black') V12_TAG_COLORS.splice(index, 1);
  }
  if (!V12_TAG_COLORS.some(color => String(color.name).toLowerCase() === 'white')) {
    V12_TAG_COLORS.unshift({ name:'White', hex:'#ffffff' });
  }
}

function v19EnsureData() {
  const washRows = V14_SERVICE_INSTRUCTIONS.washfold || (V14_SERVICE_INSTRUCTIONS.washfold = []);
  if (!washRows.some(row => row.id === 'delicate')) washRows.push({ id:'delicate', label:'Delicate cycle' });
  Object.entries(V19_WASHFOLD_CHINESE).forEach(([id, defaults]) => {
    const row = washRows.find(item => item.id === id);
    if (row) row.label = defaults.label;
  });
  state.v14InstructionOrder = state.v14InstructionOrder || v14CloneInstructionOrder();
  state.v14InstructionOrder.washfold = state.v14InstructionOrder.washfold || [];
  Object.keys(V19_WASHFOLD_CHINESE).forEach(id => {
    if (!state.v14InstructionOrder.washfold.includes(id)) state.v14InstructionOrder.washfold.push(id);
  });
  state.workflowSettings = state.workflowSettings || {};
  state.instructionTranslations = state.instructionTranslations || {};
  state.instructionTranslations.washfold = state.instructionTranslations.washfold || {};
  const firstMigration = !state.workflowSettings.v19BilingualDefaultsApplied;
  Object.entries(V19_WASHFOLD_CHINESE).forEach(([id, defaults]) => {
    const current = state.instructionTranslations.washfold[id] || {};
    state.instructionTranslations.washfold[id] = {
      zh:current.zh || defaults.zh,
      enabled:firstMigration ? true : current.enabled !== false,
    };
  });
  if (firstMigration) {
    state.workflowSettings.printChineseInstructions = true;
    state.workflowSettings.v19BilingualDefaultsApplied = true;
  }
  (state.customers || []).forEach(customer => {
    customer.storeCredit = Math.max(0, Number(customer.storeCredit || 0));
    customer.defaultFulfillment = customer.defaultFulfillment || customer.preferredChannel || 'pickup';
  });
  v19EnsureTagRules();
  if (counterDraft) v19EnsureDraft(counterDraft);
}

const v19BaseSaveState = saveState;
saveState = function v19SaveState() {
  v19EnsureData();
  return v19BaseSaveState();
};
const v19BaseLoadState = loadState;
loadState = function v19LoadState() {
  const result = v19BaseLoadState();
  v19EnsureData();
  return result;
};
const v19BaseFreshCounterDraft = v8FreshCounterDraft;
v8FreshCounterDraft = function v19FreshCounterDraft() {
  return v19EnsureDraft(v19BaseFreshCounterDraft());
};
freshCounterDraft = v8FreshCounterDraft;
v19EnsureData();

/* ------------------------- EXACT TAG-ASSIGN QUEUE ------------------------- */
function v19RequiresTag(orderOrService) {
  const service = typeof orderOrService === 'string' ? orderOrService : v8OrderService(orderOrService);
  return V19_TAG_SERVICES.has(service);
}
v17RequiresTag = v19RequiresTag;

const v19BaseRenderTags = v12RenderTags;
v12RenderTags = function v19RenderTags(content) {
  v19EnsureTagRules();
  v19BaseRenderTags(content);
  const header = content.querySelector('.v12-tag-scan-card .v12-section-head');
  if (header && !content.querySelector('.v19-tag-rule')) {
    header.insertAdjacentHTML('afterend', `<div class="v19-tag-rule"><strong>Physical tags only:</strong> Dry Cleaning · Tailoring / Alterations · Shirt on Hanger / Laundered Shirts <span>Wash &amp; Fold is excluded.</span></div>`);
  }
};

const v19BaseSimpleTags = v13RenderSimpleTags;
v13RenderSimpleTags = function v19RenderSimpleTags(content) {
  if (v13TagState.order && !v19RequiresTag(v13TagState.order)) v13TagState = { order:null, tags:[] };
  v19BaseSimpleTags(content);
  const needCount = state.orders.filter(order => v12IsOpen(order) && v19RequiresTag(order) && !(order.tagNumbers || []).length).length;
  const pulse = content.querySelector('.v13-scan-pulse');
  if (pulse) pulse.innerHTML = `<span></span>${needCount} ticket${needCount === 1 ? '' : 's'} need physical tags`;
  const head = content.querySelector('.v13-simple-head');
  if (head && !content.querySelector('.v19-tag-rule')) head.insertAdjacentHTML('afterend', '<div class="v19-tag-rule"><strong>Dry Cleaning · Tailoring · Shirt on Hanger only.</strong> Wash &amp; Fold never enters this queue.</div>');
};

const v19BaseSimpleTagScan = v13TagScanKeydown;
v13TagScanKeydown = function v19TagScanKeydown(event) {
  if (event.key !== 'Enter') return v19BaseSimpleTagScan(event);
  const order = v3FindOrderByScan(String(event.currentTarget?.value || '').trim());
  if (order && !v19RequiresTag(order)) {
    event.preventDefault();
    event.currentTarget.value = '';
    return toast('Wash & Fold tickets do not use physical garment tags', false, 'alerttriangle');
  }
  return v19BaseSimpleTagScan(event);
};

/* ------------------- BILINGUAL WASH & FOLD PRODUCTION ------------------- */
const v19BaseInstructionText = v14InstructionText;
v14InstructionText = function v19InstructionText(service) {
  if (service !== 'washfold') return v19BaseInstructionText(service);
  v19EnsureDraft(counterDraft);
  const selected = counterDraft.serviceInstructions.washfold || [];
  const lines = v14InstructionRows('washfold').filter(row => selected.includes(row.id)).map(row => {
    if (!state.workflowSettings?.printChineseInstructions || !row.enabled || !row.zh) return row.label;
    return `${row.label}\n${row.zh}`;
  });
  const custom = String(counterDraft.serviceInstructionNotes.washfold || '').trim();
  if (custom) lines.push(custom);
  return lines.join('\n');
};

const v19BaseTranslateProductionDetail = v17TranslateProductionDetail;
v17TranslateProductionDetail = function v19TranslateProductionDetail(text) {
  const translated = v19BaseTranslateProductionDetail(text);
  if (!state.workflowSettings?.printChineseInstructions || !/delicate\s+cycle/i.test(String(text || ''))) return translated;
  return [...new Set([translated, V19_WASHFOLD_CHINESE.delicate.zh].filter(Boolean))].join(' · ');
};

/* Voice parsing never gets to silently undo a customer's saved Delivery
   preference. The normal customer picker already applies it; this guard also
   protects restored drafts and future parser additions. */
const v19BaseVoiceParse = v3VoiceParse;
v3VoiceParse = function v19VoiceParse() {
  const result = v19BaseVoiceParse();
  const customer = counterDraft?.customerId ? customerById(counterDraft.customerId) : null;
  if (customer && v17CustomerDefault(customer) === 'delivery' && !counterDraft.deliveryOverrideConfirmed && counterDraft.fulfillment !== 'delivery') {
    counterDraft.fulfillment = 'delivery';
    renderPosContent();
  }
  return result;
};

function v19DecorateWashFoldOptions(content) {
  if (counterDraft?.serviceMode !== 'washfold') return;
  const aliases = {
    lowdry:'low dry', nosoftener:'no softener', delicate:'delicate cycle', separate:'separate darks',
  };
  content.querySelectorAll('.v4-option,.v14-instruction-chip').forEach(node => {
    if (node.querySelector('.v19-option-zh,.v17-instruction-zh')) return;
    const text = String(node.textContent || '').trim().toLowerCase();
    const id = Object.keys(aliases).find(key => text.startsWith(aliases[key]));
    if (!id) return;
    node.insertAdjacentHTML('beforeend', `<span class="v19-option-zh">${esc(V19_WASHFOLD_CHINESE[id].zh)}</span>`);
  });
}

/* ----------------------- DELIVERY DEFAULT SAFEGUARD ----------------------- */
const v19BasePickCustomer = posPickCustomer;
posPickCustomer = function v19PickCustomer(customerId) {
  if (counterDraft) {
    counterDraft.deliveryOverrideConfirmed = false;
    counterDraft.useStoreCredit = false;
  }
  const result = v19BasePickCustomer(customerId);
  v19EnsureDraft(counterDraft);
  return result;
};
const v19BaseClearCustomer = posClearCustomer;
posClearCustomer = function v19ClearCustomer() {
  const result = v19BaseClearCustomer();
  if (counterDraft) {
    counterDraft.deliveryOverrideConfirmed = false;
    counterDraft.useStoreCredit = false;
  }
  return result;
};
const v19BaseSetFulfillment = v3SetFulfillment;
v3SetFulfillment = function v19SetFulfillment(fulfillment) {
  v19EnsureDraft(counterDraft);
  const customer = counterDraft.customerId ? customerById(counterDraft.customerId) : null;
  if (fulfillment === 'pickup' && customer && v17CustomerDefault(customer) === 'delivery' && !counterDraft.deliveryOverrideConfirmed) {
    openPosModal(`<h3>${icon('truck',18)} Customer Usually Receives Delivery</h3><p class="pm-sub">${esc(customer.name)} is set to Delivery on the customer profile.</p><div class="warn-banner">${icon('alerttriangle',16)}<span>Are you sure this one ticket should be held for counter pickup?</span></div><button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v19KeepCustomerDelivery()">Keep Delivery</button><button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="v19ConfirmOneTimePickup()">Yes — Pickup This Ticket Only</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
    return;
  }
  if (fulfillment === 'delivery') counterDraft.deliveryOverrideConfirmed = false;
  return v19BaseSetFulfillment(fulfillment);
};
function v19KeepCustomerDelivery() {
  v19EnsureDraft(counterDraft);
  counterDraft.deliveryOverrideConfirmed = false;
  counterDraft.fulfillment = 'delivery';
  closePosModal(); renderPosContent();
}
function v19ConfirmOneTimePickup() {
  v19EnsureDraft(counterDraft);
  counterDraft.deliveryOverrideConfirmed = true;
  counterDraft.fulfillment = 'pickup';
  closePosModal(); renderPosContent();
  toast('One-time pickup override confirmed', true, 'box');
}

const v19BaseEffectiveDelivery = v17EffectiveDelivery;
v17EffectiveDelivery = function v19EffectiveDelivery(order, customer) {
  if (order?.deliveryOverrideConfirmed && order.fulfillment === 'pickup') return false;
  return v19BaseEffectiveDelivery(order, customer);
};

/* ---------------- CUSTOMER BALANCE, REPORT AND STORE CREDIT ---------------- */
function v19CustomerReportText(customer) {
  const unpaid = state.orders.filter(order => order.customerId === customer.id && v15OrderBalance(order) > 0.004);
  const rows = unpaid.map(order => `#${order.ticket || order.id}: ${money(v15OrderBalance(order))} due`).join('\n');
  return [`Hattan Cleaners account report`, customer.name, customer.customerNumber || '', `Balance due: ${money(arBalance(customer.id))}`, `Store credit: ${money(customer.storeCredit || 0)}`, rows || 'No unpaid tickets.'].filter(Boolean).join('\n');
}

async function v19TextCustomerReport(customerId) {
  const customer = customerById(customerId); if (!customer) return;
  if (!customer.phone) return toast('Add a phone number to this customer first', false, 'alerttriangle');
  const body = v19CustomerReportText(customer), campaignId = uid('report_');
  if (typeof callBackend === 'function') {
    const response = await callBackend('/send-sms', { method:'POST', body:JSON.stringify({ campaignId, campaignName:'Customer Account Report', recipients:[{ phone:customer.phone, name:customer.name, body }] }) });
    if (response.ok) {
      recordSync(`Account report texted · ${customer.name}`);
      return toast(`Account report texted to ${customer.phone}`, true, 'send');
    }
  }
  try { await navigator.clipboard?.writeText?.(body); } catch (_) { /* clipboard is an optional fallback */ }
  const phone = String(customer.phone).replace(/[^+\d]/g, '');
  window.location.href = `sms:${phone}?body=${encodeURIComponent(body)}`;
  recordSync(`Account report text draft opened · ${customer.name}`);
  toast('Messaging app opened; the report was also copied when permitted', true, 'send');
}

function v19EmailCustomerReport(customerId) {
  const customer = customerById(customerId); if (!customer) return;
  if (!customer.email) return toast('Add an email address to this customer first', false, 'alerttriangle');
  const subject = `Hattan Cleaners account report — ${customer.name}`;
  window.location.href = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(v19CustomerReportText(customer))}`;
  recordSync(`Account report email draft opened · ${customer.name}`);
  toast(`Email draft opened for ${customer.email}`, true, 'send');
}
posSendStatementEmail = v19EmailCustomerReport;

posOpenStatement = function v19OpenStatement(customerId) {
  const customer = customerById(customerId); if (!customer) return;
  const unpaid = state.orders.filter(order => order.customerId === customer.id && v15OrderBalance(order) > 0.004);
  const total = arBalance(customer.id), credit = Number(customer.storeCredit || 0);
  openPosModal(`<h3>${icon('receipt',17)} Customer Account Report</h3><p class="pm-sub">${esc(customer.name)} · ${esc(customer.customerNumber || 'No customer #')}</p><div class="v19-report-kpis"><div class="owes"><small>Balance owed</small><strong>${money(total)}</strong></div><div class="credit"><small>Store credit</small><strong>${money(credit)}</strong></div></div><div class="pos-card v19-report-lines">${unpaid.length ? unpaid.map(order => `<div class="receipt-row"><span>#${esc(order.ticket || order.id)} — ${esc(order.items || 'Ticket')}</span><strong>${money(v15OrderBalance(order))}</strong></div>`).join('') : '<div class="helper-text">No unpaid tickets.</div>'}<div class="receipt-row total"><span>Total Amount Due</span><span>${money(total)}</span></div></div><div class="v19-report-actions"><button class="btn btn-secondary" onclick="v19TextCustomerReport('${customer.id}')" ${customer.phone ? '' : 'disabled'}>${icon('send',15)} Text Report</button><button class="btn btn-secondary" onclick="v19EmailCustomerReport('${customer.id}')" ${customer.email ? '' : 'disabled'}>${icon('send',15)} Email Report</button></div>${total > 0.004 ? `<button class="btn btn-gold btn-block" style="margin-top:8px" onclick="posRecordArPayment('${customer.id}')">${icon('cash',16)} Record Payment · ${money(total)}</button>` : ''}<button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="v15OpenArCustomer('${customer.id}')">View Customer Profile</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Close</button>`);
};

function v19DraftSubtotal() {
  return v19Round(v8DraftBaseTotal() + v9PendingSubtotal());
}
function v19DraftPaymentPreview(customer) {
  const subtotal = v19DraftSubtotal();
  const credit = counterDraft?.payNow && counterDraft?.useStoreCredit && customer ? Math.min(Number(customer.storeCredit || 0), subtotal) : 0;
  const externalBase = Math.max(0, subtotal - credit);
  const fee = counterDraft?.payNow && counterDraft?.paymentMethod === 'card' ? v19Round(externalBase * 0.03) : 0;
  return { subtotal, credit:v19Round(credit), externalBase:v19Round(externalBase), fee, externalDue:v19Round(externalBase + fee), visitTotal:v19Round(subtotal + fee) };
}
function v19SetDraftStoreCredit(useCredit) {
  v19EnsureDraft(counterDraft);
  counterDraft.useStoreCredit = !!useCredit;
  renderPosContent();
}
const v19BaseSetPayNow = posSetPayNow;
posSetPayNow = function v19SetPayNow(payNow) {
  v19EnsureDraft(counterDraft);
  if (!payNow) counterDraft.useStoreCredit = false;
  return v19BaseSetPayNow(payNow);
};

function v19FinancialPanelHTML(customer) {
  if (!customer) return '';
  const outstanding = arBalance(customer.id), credit = Number(customer.storeCredit || 0), preview = v19DraftPaymentPreview(customer);
  return `<section class="v19-financial-panel"><div class="v19-financial-kpis"><div class="${outstanding > 0.004 ? 'owes' : 'clear'}"><small>Customer owes us</small><strong>${money(outstanding)}</strong></div><div class="${credit > 0.004 ? 'credit' : 'clear'}"><small>Store credit</small><strong>${money(credit)}</strong></div></div><div class="v19-financial-actions"><button type="button" onclick="posOpenStatement('${customer.id}')">Generate Report</button><button type="button" onclick="v19TextCustomerReport('${customer.id}')" ${customer.phone ? '' : 'disabled'}>Text Report</button><button type="button" onclick="v19EmailCustomerReport('${customer.id}')" ${customer.email ? '' : 'disabled'}>Email Report</button></div>${counterDraft.payNow && credit > 0.004 ? `<div class="v19-credit-question"><strong>Use store credit on this visit?</strong><small>${money(credit)} is available. Staff must choose Yes; it is never applied automatically.</small><div class="segmented"><button class="seg ${!counterDraft.useStoreCredit ? 'selected' : ''}" onclick="v19SetDraftStoreCredit(false)">No — Keep Credit</button><button class="seg ${counterDraft.useStoreCredit ? 'selected' : ''}" onclick="v19SetDraftStoreCredit(true)">Yes — Apply Up To ${money(Math.min(credit, preview.subtotal))}</button></div>${counterDraft.useStoreCredit ? `<div class="v19-credit-preview"><span>Store credit applied <strong>−${money(preview.credit)}</strong></span><span>${counterDraft.paymentMethod === 'card' ? 'Card total after 3% fee' : 'Cash due'} <strong>${money(preview.externalDue)}</strong></span></div>` : ''}</div>` : ''}</section>`;
}

let v19DropOffCreditContext = null;
const v19BaseFinalizePayment = finalizePayment;
finalizePayment = function v19FinalizePayment(order) {
  const context = v19DropOffCreditContext;
  if (!context?.enabled || !order || order.customerId !== context.customerId) return v19BaseFinalizePayment(order);
  const originalMethod = String(order.paymentMethod || 'card');
  const subtotal = Math.max(0, v19Round(Number(order.total || 0) - Number(order.discount || 0)));
  const requestedCredit = Math.min(context.remaining, subtotal);
  let credit = 0, creditEntryId = null;
  if (requestedCredit > 0.004) {
    const result = v15ApplyStoreCredit(order.customerId, -requestedCredit, `Applied to ticket #${order.ticket || order.id}`, 'ticket_payment');
    if (result.ok) {
      credit = requestedCredit;
      creditEntryId = result.entry?.id || null;
      context.remaining = Number(result.customer.storeCredit || 0);
      context.applied = v19Round(context.applied + credit);
    }
  }
  const externalBase = Math.max(0, v19Round(subtotal - credit));
  const card = /card/i.test(originalMethod);
  const fee = card ? v19Round(externalBase * 0.03) : 0;
  order.surcharge = fee;
  order.storeCreditApplied = v19Round(credit);
  order.externalPaymentAmount = v19Round(externalBase + fee);
  order.amountCharged = v19Round(subtotal + fee);
  order.paymentBreakdown = { storeCredit:order.storeCreditApplied, external:order.externalPaymentAmount, externalMethod:originalMethod };
  if (creditEntryId) order.storeCreditEntryId = creditEntryId;
  order.paymentMethod = credit >= subtotal - 0.004 ? 'store credit' : (credit > 0.004 ? `${originalMethod} + store credit` : originalMethod);
  return v19BaseFinalizePayment(order);
};

const v19BaseCompleteDropOff = posCompleteDropOff;
posCompleteDropOff = function v19CompleteDropOff() {
  v19EnsureDraft(counterDraft);
  const draft = counterDraft, customer = draft.customerId ? customerById(draft.customerId) : null;
  const previousIds = new Set(state.orders.map(order => order.id));
  v19DropOffCreditContext = {
    enabled:!!(draft.payNow && draft.useStoreCredit && customer && Number(customer.storeCredit || 0) > 0.004),
    customerId:customer?.id || null,
    remaining:Number(customer?.storeCredit || 0),
    applied:0,
  };
  const pickupOverride = !!draft.deliveryOverrideConfirmed;
  try {
    return v19BaseCompleteDropOff();
  } finally {
    const created = state.orders.filter(order => !previousIds.has(order.id));
    if (pickupOverride) created.forEach(order => {
      order.deliveryOverrideConfirmed = true;
      v8AddActivity(order, 'fulfillment_override', 'One-time counter pickup confirmed; customer profile remains Delivery');
    });
    if (created.length && (pickupOverride || v19DropOffCreditContext.applied > 0.004)) saveState();
    v19DropOffCreditContext = null;
  }
};

const v19BaseFinishCheckout = posFinishCheckout;
posFinishCheckout = function v19FinishCheckout(orderId) {
  const order = state.orders.find(item => item.id === orderId), customer = order?.customerId ? customerById(order.customerId) : null;
  const before = Number(customer?.storeCredit || 0), requested = !!checkoutState.useCredit, requestedMethod = checkoutState.method;
  const result = v19BaseFinishCheckout(orderId);
  const after = Number(customer?.storeCredit || 0), applied = requested ? v19Round(before - after) : 0;
  if (customer && applied > 0.004) {
    customer.storeCreditHistory = customer.storeCreditHistory || [];
    const entry = { id:uid('credit_'), at:v8NowISO(), by:v6CurrentStaff()?.name || 'Staff', amount:-applied, before, after, reason:`Applied to ticket #${order?.ticket || orderId}`, source:'pickup_payment' };
    customer.storeCreditHistory.unshift(entry);
    customer.storeCreditHistory = customer.storeCreditHistory.slice(0, 100);
    if (order) {
      order.storeCreditApplied = applied;
      order.storeCreditEntryId = entry.id;
      order.externalPaymentAmount = v19Round(Number(order.amountCharged || 0));
      order.paymentBreakdown = { storeCredit:applied, external:order.externalPaymentAmount, externalMethod:requestedMethod };
      v8AddActivity(order, 'store_credit', `Store credit applied · ${money(applied)}`);
    }
    recordSync(`Store credit applied · ${customer.name} · ${money(applied)} · #${order?.ticket || orderId}`);
    saveState();
  }
  return result;
};

/* ------------------------- COUNTER UI ENHANCEMENTS ------------------------- */
function v19EnhanceCounter(content) {
  v19EnsureDraft(counterDraft);
  v19DecorateWashFoldOptions(content);
  const customer = counterDraft.customerId ? customerById(counterDraft.customerId) : null;
  content.querySelectorAll('.v17-balance-banner').forEach(node => node.remove());
  if (!customer) return;
  const panel = v19FinancialPanelHTML(customer);
  const ticketPanel = content.querySelector('.ticket-panel');
  if (ticketPanel && !ticketPanel.querySelector('.v19-financial-panel')) ticketPanel.firstElementChild?.insertAdjacentHTML('afterend', panel);
  const simpleVisit = content.querySelector('.v13-visit-card');
  if (simpleVisit && !simpleVisit.querySelector('.v19-financial-panel')) {
    simpleVisit.firstElementChild?.insertAdjacentHTML('afterend', panel);
    const total = simpleVisit.querySelector('.v13-total-banner');
    if (total && !simpleVisit.querySelector('.v19-simple-payment')) {
      total.insertAdjacentHTML('beforebegin', `<div class="v19-simple-payment"><strong>Payment</strong><div class="segmented"><button class="seg ${!counterDraft.payNow ? 'selected' : ''}" onclick="posSetPayNow(false)">Pay Later</button><button class="seg ${counterDraft.payNow ? 'selected' : ''}" onclick="posSetPayNow(true)">Pay Now</button></div>${counterDraft.payNow ? `<div class="segmented"><button class="seg ${counterDraft.paymentMethod === 'card' ? 'selected' : ''}" onclick="posSetPayMethod('card')">Card +3%</button><button class="seg ${counterDraft.paymentMethod === 'cash' ? 'selected' : ''}" onclick="posSetPayMethod('cash')">Cash</button></div>` : ''}</div>`);
    }
  }
  const preview = v19DraftPaymentPreview(customer);
  const feeNode = content.querySelector('#v9-visit-fee');
  if (feeNode) {
    feeNode.textContent = money(preview.fee);
    const label = feeNode.previousElementSibling; if (label) label.textContent = counterDraft.useStoreCredit ? 'Card fee after store credit (3%)' : 'Card convenience fee (3%)';
  }
  const totalNode = content.querySelector('#v9-visit-total'); if (totalNode) totalNode.textContent = money(preview.visitTotal);
  const simpleTotal = simpleVisit?.querySelector('.v13-total-banner strong'); if (simpleTotal) simpleTotal.textContent = money(preview.visitTotal);
}

const v19BaseEnhanceCounter = v17EnhanceCounter;
v17EnhanceCounter = function v19CounterEnhancer(content) {
  v19BaseEnhanceCounter(content);
  v19EnhanceCounter(content);
};

/* ------------------------ THERMAL PRIORITY MARKERS ------------------------ */
const v19BaseReceiptTicketHTML = receiptTicketHTML;
receiptTicketHTML = function v19ReceiptTicketHTML(order) {
  let html = v19BaseReceiptTicketHTML(order);
  html = html.replace('<div class="v17-top-alert">RUSH</div>', '<div class="v17-top-alert v19-top-rush">RUSH</div>');
  html = html.replace(/<div class="v17-top-unit">APT ([^<]*)<\/div>/, (_match, unit) => `<div class="v17-top-unit v19-top-unit">${String(unit).replace(/\s*\*+\s*$/, '').trim()} *</div>`);
  if (Number(order?.storeCreditApplied || 0) > 0.004) {
    const external = Number(order.externalPaymentAmount || 0);
    html = html.replace('<div class="rt-row"><span>PrePay</span>', `<div class="rt-row v19-credit-receipt"><span>Store Credit</span><strong>−${money(order.storeCreditApplied)}</strong></div>${external > 0.004 ? `<div class="rt-row v19-credit-receipt"><span>${esc(String(order.paymentBreakdown?.externalMethod || 'Payment'))}</span><strong>${money(external)}</strong></div>` : ''}<div class="rt-row"><span>PrePay</span>`);
  }
  return html;
};

/* Version labels. */
const v19BasePosShellHTML = posShellHTML;
posShellHTML = function v19PosShellHTML() {
  return v19BasePosShellHTML().replace(/Staff POS(?: · V[\w. ]+)?/g, `Staff POS · ${V19_VERSION}`);
};
const v19BaseRenderSettings = renderPosSettings;
renderPosSettings = function v19RenderSettings(content) {
  v19BaseRenderSettings(content);
  content?.querySelectorAll?.('.v16-eyebrow').forEach(node => { node.textContent = V19_VERSION; });
};
