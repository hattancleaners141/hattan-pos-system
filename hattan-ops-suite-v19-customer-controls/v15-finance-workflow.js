/* ============================================================================
   HATTAN OPS V15 — refunds, store credit, pickup recalls and correction tools
   Loaded after V14. Financial corrections preserve the original transaction
   and append an audit entry instead of deleting or overwriting history.
============================================================================ */

function v15RoundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function v15GrossTotal(order) {
  if (!order || order.status === 'voided') return 0;
  return Math.max(0, v15RoundMoney(Number(order.total || 0) - Number(order.discount || 0) + Number(order.surcharge || 0)));
}
function v15RefundedTotal(order) {
  return v15RoundMoney((order?.refunds || []).reduce((sum, refund) => sum + Number(refund.amount || 0), 0));
}
function v15PaidAmount(order) {
  if (!order) return 0;
  if (Number.isFinite(Number(order.amountPaid)) && order.amountPaid !== null && order.amountPaid !== '') return Math.max(0, v15RoundMoney(order.amountPaid));
  if (!order.paid) return 0;
  const charged = order.amountCharged;
  return Math.max(0, v15RoundMoney(charged === null || charged === undefined ? v15GrossTotal(order) : charged));
}
function v15OrderBalance(order) { return Math.max(0, v15RoundMoney(v15GrossTotal(order) - v15PaidAmount(order))); }
function v15Refundable(order) { return Math.max(0, v15RoundMoney(v15PaidAmount(order) - v15RefundedTotal(order))); }
function v15NetRevenue(order) { return Math.max(0, v15RoundMoney(v15GrossTotal(order) - v15RefundedTotal(order))); }

function v15EnsureData() {
  state.v15ArSearch = state.v15ArSearch || '';
  state.customers = state.customers || [];
  state.orders = state.orders || [];
  state.customers.forEach(customer => {
    customer.storeCredit = Math.max(0, Number(customer.storeCredit || 0));
    customer.storeCreditHistory = customer.storeCreditHistory || [];
  });
  state.orders.forEach(order => {
    order.refunds = order.refunds || [];
    order.pickupRecallHistory = order.pickupRecallHistory || [];
    order.ticketEditHistory = order.ticketEditHistory || [];
    if (order.paid && (order.amountPaid === undefined || order.amountPaid === null)) order.amountPaid = v15PaidAmount(order);
  });
}

const v15BaseSaveState = saveState;
saveState = function v15SaveState() {
  v15BaseSaveState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.v15ArSearch = state.v15ArSearch || '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (error) { /* Optional V15 view state can reset. */ }
};
const v15BaseLoadState = loadState;
loadState = function v15LoadState() {
  v15BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (typeof raw.v15ArSearch === 'string') state.v15ArSearch = raw.v15ArSearch;
  } catch (error) { /* Browser storage unavailable. */ }
  v15EnsureData();
};

/* ------------------------- CONSISTENT BALANCES AND PAYMENTS ------------------------- */
v12OrderBalance = v15OrderBalance;
arBalance = function v15ArBalance(customerId) {
  return v15RoundMoney(state.orders.filter(order => order.customerId === customerId).reduce((sum, order) => sum + v15OrderBalance(order), 0));
};
customersWithBalance = function v15CustomersWithBalance() { return state.customers.filter(customer => arBalance(customer.id) > 0.004); };
v7Outstanding = arBalance;
v7TicketBalanceHTML = function v15TicketBalanceHTML(order) {
  const balance = v15OrderBalance(order);
  return balance > 0.004 ? `<span class="v7-balance bad">${money(balance)} due</span>` : `<span class="v7-balance good">${v15RefundedTotal(order) ? 'Refund recorded' : 'Paid'}</span>`;
};
v7AnnualSpend = function v15AnnualSpend(customer) {
  return state.orders.filter(order => order.customerId === customer.id && v15PaidAmount(order) > 0).reduce((sum, order) => sum + v15NetRevenue(order), 0);
};
v6CustomerAnnualSpend = function v15CustomerAnnualSpend(customer, days = 365) {
  const cutoff = Date.now() - days * 86400000;
  return state.orders.filter(order => order.customerId === customer.id && (!order.createdAt || new Date(order.createdAt).getTime() >= cutoff))
    .reduce((sum, order) => sum + v15NetRevenue(order), 0);
};

function v15MarkPaidAmount(order) {
  if (!order || !order.paid) return;
  order.amountPaid = v15GrossTotal(order);
  order.paymentStatus = order.paymentStatus === 'refunded' ? 'refunded' : 'paid';
}
const v15BaseFinalizePayment = finalizePayment;
finalizePayment = function v15FinalizePayment(order) { v15BaseFinalizePayment(order); v15MarkPaidAmount(order); };
const v15BaseSimplePay = v13SimplePay;
v13SimplePay = function v15SimplePay(orderId, method) {
  v15BaseSimplePay(orderId, method);
  const order = state.orders.find(item => item.id === orderId); v15MarkPaidAmount(order); saveState();
};
const v15BaseRecordPayment = v7RecordPayment;
v7RecordPayment = function v15RecordPayment(orderId) {
  v15BaseRecordPayment(orderId);
  const order = state.orders.find(item => item.id === orderId); v15MarkPaidAmount(order); saveState();
};
const v15BaseRecordArPayment = posRecordArPayment;
posRecordArPayment = function v15RecordArPayment(customerId) {
  const ids = state.orders.filter(order => order.customerId === customerId && v15OrderBalance(order) > 0.004).map(order => order.id);
  v15BaseRecordArPayment(customerId);
  ids.forEach(id => v15MarkPaidAmount(state.orders.find(order => order.id === id))); saveState();
};
const v15BaseChargeAll = v2ChargeAll;
v2ChargeAll = function v15ChargeAll() {
  v15BaseChargeAll(); state.orders.filter(order => order.paid && (order.amountPaid === undefined || order.amountPaid === null)).forEach(v15MarkPaidAmount); saveState();
};

/* ------------------------- STORE CREDIT WITH AN AUDIT LEDGER ------------------------- */
function v15ApplyStoreCredit(customerId, signedAmount, reason, source = 'manual') {
  const customer = customerById(customerId), amount = v15RoundMoney(signedAmount), note = String(reason || '').trim();
  if (!customer) return { ok:false, error:'Customer not found' };
  if (!amount) return { ok:false, error:'Enter an amount greater than $0.00' };
  if (!note) return { ok:false, error:'Enter a reason for the store-credit change' };
  if (amount < 0 && Math.abs(amount) > Number(customer.storeCredit || 0) + 0.004) return { ok:false, error:'The debit is larger than the available store credit' };
  const before = v15RoundMoney(customer.storeCredit || 0), after = Math.max(0, v15RoundMoney(before + amount));
  customer.storeCredit = after;
  customer.storeCreditHistory = customer.storeCreditHistory || [];
  const entry = { id:uid('credit_'), at:v8NowISO(), by:v6CurrentStaff()?.name || 'Staff', amount, before, after, reason:note, source };
  customer.storeCreditHistory.unshift(entry);
  customer.storeCreditHistory = customer.storeCreditHistory.slice(0, 100);
  recordSync(`Store credit ${amount > 0 ? 'added' : 'debited'} · ${customer.name} · ${money(Math.abs(amount))} · ${note}`);
  return { ok:true, entry, customer };
}
function v15StoreCreditHistoryHTML(customer, limit = 8) {
  const rows = (customer.storeCreditHistory || []).slice(0, limit);
  if (!rows.length) return '<div class="helper-text">No store-credit adjustments yet.</div>';
  return `<div class="v15-money-ledger">${rows.map(entry => `<div><span><strong>${entry.amount >= 0 ? '+' : '−'}${money(Math.abs(entry.amount))}</strong> · ${esc(entry.reason)}</span><small>${v8TimeLabel(entry.at)} · ${esc(entry.by || 'Staff')} · Balance ${money(entry.after)}</small></div>`).join('')}</div>`;
}
function v15OpenStoreCredit(customerId) {
  const customer = customerById(customerId); if (!customer) return;
  openPosModal(`<h3>${icon('wallet',18)} Store Credit · ${esc(customer.name)}</h3>
    <div class="v15-credit-balance"><span>Available balance</span><strong>${money(customer.storeCredit || 0)}</strong></div>
    <span class="field-label">Amount</span><input id="v15-credit-amount" class="text-input" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" style="margin-bottom:10px">
    <span class="field-label">Reason</span><input id="v15-credit-reason" class="text-input" placeholder="Service recovery, promotion, correction…" style="margin-bottom:12px">
    <div class="v15-two-actions"><button class="btn btn-primary" onclick="v15SaveStoreCredit('${customer.id}',1)">${icon('plus',15)} Add Credit</button><button class="btn btn-secondary" onclick="v15SaveStoreCredit('${customer.id}',-1)">${icon('minus',15)} Deduct Credit</button></div>
    <span class="field-label" style="margin-top:18px">Credit history</span>${v15StoreCreditHistoryHTML(customer)}
    <button class="btn btn-ghost btn-block" style="margin-top:14px" onclick="closePosModal()">Close</button>`);
  setTimeout(() => document.getElementById('v15-credit-amount')?.focus(), 0);
}
function v15SaveStoreCredit(customerId, sign) {
  const amount = Number(document.getElementById('v15-credit-amount')?.value || 0) * Number(sign || 1);
  const reason = document.getElementById('v15-credit-reason')?.value || '';
  const result = v15ApplyStoreCredit(customerId, amount, reason);
  if (!result.ok) return toast(result.error, false, 'alerttriangle');
  toast(`Store credit is now ${money(result.customer.storeCredit)}`, true, 'wallet'); closePosModal();
  if (state.v7CustomerId === customerId) renderV7CustomerProfile(); else if (state.posNav === 'ar') renderPosContent();
}
v7AddStoreCredit = v15OpenStoreCredit;
posOpenCreditAdjust = v15OpenStoreCredit;

/* ------------------------- REFUNDS: ORIGINAL PAYMENT, CASH OR CREDIT ------------------------- */
const V15_REFUND_METHODS = { original:'Original payment', cash:'Cash', store_credit:'Store credit' };
function v15ApplyRefund(orderId, details = {}) {
  const order = state.orders.find(item => item.id === orderId); if (!order) return { ok:false, error:'Ticket not found' };
  const amount = v15RoundMoney(details.amount), method = V15_REFUND_METHODS[details.method] ? details.method : 'original';
  const reason = String(details.reason || '').trim(), available = v15Refundable(order);
  if (amount <= 0) return { ok:false, error:'Enter a refund amount greater than $0.00' };
  if (amount > available + 0.004) return { ok:false, error:`Only ${money(available)} remains refundable on this ticket` };
  if (!reason) return { ok:false, error:'Enter a reason for the refund' };
  const customer = order.customerId ? customerById(order.customerId) : null;
  if (method === 'store_credit' && !customer) return { ok:false, error:'Store-credit refunds require a customer profile' };
  const refund = {
    id:uid('refund_'), amount, method, methodLabel:V15_REFUND_METHODS[method], reason,
    at:v8NowISO(), by:v6CurrentStaff()?.name || 'Staff',
    processorStatus:method === 'original' ? 'processor action required in production' : 'completed'
  };
  order.refunds = order.refunds || []; order.refunds.unshift(refund); order.refundedAt = refund.at;
  const remaining = v15Refundable(order);
  order.paymentStatus = remaining <= 0.004 ? 'refunded' : 'partially_refunded';
  if (method === 'store_credit') {
    const creditResult = v15ApplyStoreCredit(customer.id, amount, `Refund for #${order.ticket || order.id}: ${reason}`, 'refund');
    refund.storeCreditEntryId = creditResult.entry?.id || null;
  }
  v8AddActivity(order, 'refund', `${V15_REFUND_METHODS[method]} refund · ${money(amount)} · ${reason}`, { refundId:refund.id });
  recordSync(`Refund recorded · #${order.ticket || order.id} · ${money(amount)} · ${V15_REFUND_METHODS[method]} · ${reason}`);
  return { ok:true, refund, order, remaining };
}
function v15RefundHistoryHTML(order) {
  const rows = order.refunds || []; if (!rows.length) return '';
  return `<div class="v15-refund-history"><strong>Refund history · ${money(v15RefundedTotal(order))}</strong>${rows.map(refund => `<div><span>${money(refund.amount)} · ${esc(refund.methodLabel || V15_REFUND_METHODS[refund.method] || refund.method)}</span><small>${esc(refund.reason)} · ${v8TimeLabel(refund.at)} · ${esc(refund.by || 'Staff')}</small></div>`).join('')}</div>`;
}
function v15OpenRefund(orderId) {
  const order = state.orders.find(item => item.id === orderId); if (!order) return;
  const available = v15Refundable(order), customer = order.customerId ? customerById(order.customerId) : null;
  if (available <= 0.004) return toast('There is no refundable payment remaining on this ticket', false, 'alerttriangle');
  openPosModal(`<h3>${icon('refresh',18)} Refund · #${esc(order.ticket || order.id)}</h3>
    <p class="pm-sub">Original payment remains in the audit history. This adds a separate refund transaction.</p>
    <div class="v15-refund-kpis"><div><small>Paid</small><strong>${money(v15PaidAmount(order))}</strong></div><div><small>Already refunded</small><strong>${money(v15RefundedTotal(order))}</strong></div><div><small>Available</small><strong>${money(available)}</strong></div></div>
    <span class="field-label">Refund amount</span><input id="v15-refund-amount" class="text-input" type="number" min="0.01" max="${available.toFixed(2)}" step="0.01" value="${available.toFixed(2)}" style="margin-bottom:10px">
    <span class="field-label">Refund method</span><select id="v15-refund-method" class="text-input" style="margin-bottom:10px"><option value="original">Original payment</option><option value="cash">Cash</option>${customer ? '<option value="store_credit">Store credit</option>' : ''}</select>
    <span class="field-label">Reason</span><textarea id="v15-refund-reason" rows="3" placeholder="Required: reason for refund"></textarea>
    <div class="v8-secure-note" style="margin-top:10px">In this test build, original-card refunds are logged for the processor. The production version must submit them through the connected payment processor.</div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v15SubmitRefund('${order.id}')">Record Refund</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="posOpenOrderDetail('${order.id}')">Cancel</button>`);
}
function v15SubmitRefund(orderId) {
  const result = v15ApplyRefund(orderId, {
    amount:document.getElementById('v15-refund-amount')?.value,
    method:document.getElementById('v15-refund-method')?.value,
    reason:document.getElementById('v15-refund-reason')?.value
  });
  if (!result.ok) return toast(result.error, false, 'alerttriangle');
  toast(`${money(result.refund.amount)} refund recorded`, true, 'refresh'); posOpenOrderDetail(orderId); renderPosContent();
}

/* ------------------------- PICKUP RECALLS WITH ORIGINAL TIMESTAMP ------------------------- */
function v15RememberPickupLocation(order) {
  if (!order) return;
  order.pickupLocationSnapshot = { rack:order.rack || null, conveyorNumber:order.conveyorNumber || null, status:order.status, stageIndex:order.stageIndex, readyAt:order.readyAt || null, at:v8NowISO() };
}
const v15BaseCompletePickup = v14CompletePickup;
v14CompletePickup = function v15CompletePickup(method) {
  const ids = [...(v14PickupState?.selected || [])]; ids.forEach(id => v15RememberPickupLocation(state.orders.find(order => order.id === id)));
  const result = v15BaseCompletePickup(method);
  ids.forEach(id => { const order = state.orders.find(item => item.id === id); if (order?.paid) v15MarkPaidAmount(order); }); saveState(); return result;
};
const v15BasePickUpOrder = v7PickUpOrder;
v7PickUpOrder = function v15PickUpOrder(orderId) {
  const order = state.orders.find(item => item.id === orderId); v15RememberPickupLocation(order); const result = v15BasePickUpOrder(orderId); saveState(); return result;
};
function v15ApplyPickupRecall(orderId, reason) {
  const order = state.orders.find(item => item.id === orderId), note = String(reason || '').trim();
  if (!order) return { ok:false, error:'Ticket not found' };
  if (order.status !== 'picked_up') return { ok:false, error:'Only a picked-up ticket can be recalled from pickup' };
  if (!note) return { ok:false, error:'Enter a reason for recalling the pickup' };
  const recalledAt = v8NowISO(), originalPickupAt = order.pickedUpAt || null, previous = order.pickupLocationSnapshot || {};
  order.pickupRecallHistory = order.pickupRecallHistory || [];
  order.pickupRecallHistory.unshift({ id:uid('pickup_recall_'), at:recalledAt, by:v6CurrentStaff()?.name || 'Staff', reason:note, originalPickupAt, restoredLocation:{ rack:previous.rack || null, conveyorNumber:previous.conveyorNumber || null } });
  const stages = getStages(order), readyIndex = stages.findIndex(stage => stage.id === 'ready');
  order.status = 'ready'; order.stageIndex = readyIndex >= 0 ? readyIndex : Math.max(0, stages.length - 2);
  order.rack = previous.rack || null; order.conveyorNumber = previous.conveyorNumber || null; order.readyAt = previous.readyAt || recalledAt;
  order.pickedUpAt = null; order.pickupRecalledAt = recalledAt; order.pickupRecallReason = note;
  order.needsLocationAssignment = !order.rack && !order.conveyorNumber;
  v8AddActivity(order, 'pickup_recall', `Picked-up ticket recalled · ${note}`, { originalPickupAt, recalledAt });
  recordSync(`Pickup recalled · #${order.ticket || order.id} · original pickup ${originalPickupAt || 'unknown'} · ${note}`);
  return { ok:true, order };
}
function v15OpenPickupRecall(orderId) {
  const order = state.orders.find(item => item.id === orderId); if (!order) return;
  openPosModal(`<h3>${icon('refresh',18)} Recall Picked-Up Ticket</h3><p class="pm-sub">#${esc(order.ticket || order.id)} · Picked up ${v8TimeLabel(order.pickedUpAt)}</p>
    <div class="warn-banner">${icon('alerttriangle',15)}<span>The payment stays recorded. The ticket returns to Ready, and the original pickup time stays in history.</span></div>
    <span class="field-label" style="margin-top:14px">Reason</span><textarea id="v15-pickup-recall-reason" rows="3" placeholder="Required: why is this pickup being recalled?"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="v15SubmitPickupRecall('${order.id}')">Recall to Ready</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="posOpenOrderDetail('${order.id}')">Cancel</button>`);
}
function v15SubmitPickupRecall(orderId) {
  const result = v15ApplyPickupRecall(orderId, document.getElementById('v15-pickup-recall-reason')?.value);
  if (!result.ok) return toast(result.error, false, 'alerttriangle');
  toast(`#${result.order.ticket || result.order.id} returned to Ready`, true, 'refresh'); posOpenOrderDetail(orderId); renderPosContent();
}

/* ------------------------- FULL OPEN-TICKET EDITOR ------------------------- */
let v15TicketEditDraft = null;
function v15EditLineId() { return uid('edit_'); }
function v15NormalizeEditLine(line = {}) {
  const garment = garmentById(line.garmentId) || state.garmentCatalog[0], materialId = line.materialId === 'cotton' ? 'standard' : (line.materialId || 'standard');
  return { _editId:line._editId || v15EditLineId(), garmentId:garment?.id || '', materialId, colorId:line.colorId || 'black', qty:Math.max(0.01, Number(line.qty || 1)), unitPrice:Math.max(0, v15RoundMoney(line.unitPrice === undefined ? garmentUnitPrice(garment?.id, materialId) : line.unitPrice)), buttonType:line.buttonType || 'standard', garmentNote:line.garmentNote || '', serviceType:line.serviceType || garment?.service || 'dryclean', priceMode:line.priceMode || null, alterationVariantId:line.alterationVariantId || null };
}
function v15CreateTicketEditDraft(order) {
  return { orderId:order.id, dueDate:order.dueDate || v8DefaultDue(v8OrderService(order)), rush:!!order.rush, notes:order.notes || '', lineItems:(order.lineItems || order.itemsDetail || []).map(v15NormalizeEditLine) };
}
function v15EditorTotal(draft = v15TicketEditDraft) { return v15RoundMoney((draft?.lineItems || []).reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unitPrice || 0), 0)); }
function v15EditMaterialOptions(selected) {
  const rows = [{ id:'standard', name:'Standard / Cotton — no upcharge' }, ...(state.materials || []).filter(material => !['cotton','standard'].includes(material.id))];
  return rows.map(material => `<option value="${esc(material.id)}" ${material.id === selected ? 'selected' : ''}>${esc(material.name)}</option>`).join('');
}
function v15TicketEditorHTML() {
  const draft = v15TicketEditDraft, order = state.orders.find(item => item.id === draft?.orderId); if (!draft || !order) return '';
  const lines = draft.lineItems.map((line, index) => {
    const garment = garmentById(line.garmentId);
    return `<div class="v15-edit-line">
      <div class="v15-edit-line-head"><strong>Item ${index + 1}</strong><button class="v15-remove-line" onclick="v15RemoveEditLine(${index})" aria-label="Remove item">${icon('x',14)} Remove</button></div>
      <label><span>Garment / service</span><select class="text-input" onchange="v15EditTicketLine(${index},'garmentId',this.value)">${state.garmentCatalog.map(item => `<option value="${item.id}" ${item.id === line.garmentId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      <label><span>Quantity</span><input class="text-input" type="number" min="0.01" step="0.01" value="${line.qty}" oninput="v15EditTicketLine(${index},'qty',this.value,false)"></label>
      <label><span>Material / upcharge</span><select class="text-input" onchange="v15EditTicketLine(${index},'materialId',this.value)">${v15EditMaterialOptions(line.materialId)}</select></label>
      <label><span>Color</span><select class="text-input" onchange="v15EditTicketLine(${index},'colorId',this.value,false)">${GARMENT_COLORS.map(color => `<option value="${color.id}" ${color.id === line.colorId ? 'selected' : ''}>${esc(color.name)}</option>`).join('')}</select></label>
      <label><span>Unit price</span><input class="text-input" type="number" min="0" step="0.01" value="${Number(line.unitPrice).toFixed(2)}" oninput="v15EditTicketLine(${index},'unitPrice',this.value,false)"></label>
      <label class="wide"><span>Item notes</span><input class="text-input" value="${esc(line.garmentNote)}" placeholder="Color detail, damage, press only…" oninput="v15EditTicketLine(${index},'garmentNote',this.value,false)"></label>
      <div class="v15-edit-line-total">${esc(garment?.unit || 'piece')} · <strong>${money(Number(line.qty) * Number(line.unitPrice))}</strong></div>
    </div>`;
  }).join('');
  return `<div class="v15-ticket-editor"><div class="v15-editor-head"><div><h3>Edit Entire Ticket · #${esc(order.ticket || order.id)}</h3><p>Change existing items, remove them, or add new garments and services.</p></div><div class="v15-editor-total"><small>New subtotal</small><strong id="v15-editor-total">${money(v15EditorTotal())}</strong></div></div>
    <div class="v15-editor-due"><label><span>Due date</span><input id="v15-edit-due" class="text-input" type="date" value="${esc(draft.dueDate)}" oninput="v15TicketEditDraft.dueDate=this.value"></label><button class="btn btn-secondary" onclick="v15SetEditDue(1,false)">Tomorrow</button><button class="btn v15-rush-button ${draft.rush ? 'active' : ''}" onclick="v15SetEditDue(0,true)">RUSH · SAME DAY</button></div>
    <div class="v15-edit-lines">${lines || '<div class="table-empty">This older ticket has no garment lines yet. Add an item below to create the detail.</div>'}</div>
    <button class="btn btn-secondary btn-block" onclick="v15AddEditLine()">${icon('plus',16)} Add Another Item / Service</button>
    <span class="field-label" style="margin-top:14px">Ticket notes</span><textarea rows="3" oninput="v15TicketEditDraft.notes=this.value">${esc(draft.notes)}</textarea>
    <div class="v15-editor-footer"><button class="btn btn-ghost" onclick="posOpenOrderDetail('${order.id}')">Cancel</button><button class="btn btn-primary" onclick="v15SaveTicketEdit()">Save Full Ticket & Audit Change</button></div></div>`;
}
function v15RenderTicketEditor() { openPosModal(v15TicketEditorHTML()); document.getElementById('pos-modal')?.classList.add('v15-wide-modal'); }
function v15OpenFullTicketEditor(orderId) {
  const order = state.orders.find(item => item.id === orderId); if (!order) return;
  if (!v12IsOpen(order)) return toast('Only an open ticket can be edited. Recall a picked-up ticket first.', false, 'alerttriangle');
  v15TicketEditDraft = v15CreateTicketEditDraft(order); v15RenderTicketEditor();
}
function v15EditTicketLine(index, field, value, rerender = true) {
  const line = v15TicketEditDraft?.lineItems?.[index]; if (!line) return;
  if (field === 'qty') line.qty = Math.max(0.01, Number(value || 0.01));
  else if (field === 'unitPrice') line.unitPrice = Math.max(0, v15RoundMoney(value));
  else if (field === 'garmentId') { const garment = garmentById(value); line.garmentId = value; line.serviceType = garment?.service || 'dryclean'; line.unitPrice = garmentUnitPrice(value, line.materialId); }
  else if (field === 'materialId') { line.materialId = value; line.unitPrice = garmentUnitPrice(line.garmentId, value); }
  else line[field] = value;
  if (rerender) v15RenderTicketEditor();
  else {
    const total = document.getElementById('v15-editor-total'); if (total) total.textContent = money(v15EditorTotal());
  }
}
function v15AddEditLine() {
  const garment = garmentById('g_pants') || state.garmentCatalog[0];
  v15TicketEditDraft.lineItems.push(v15NormalizeEditLine({ garmentId:garment.id, materialId:'standard', colorId:'black', qty:1, unitPrice:garment.basePrice, serviceType:garment.service })); v15RenderTicketEditor();
}
function v15RemoveEditLine(index) { v15TicketEditDraft.lineItems.splice(index, 1); v15RenderTicketEditor(); }
function v15SetEditDue(days, rush) { v15TicketEditDraft.dueDate = v8DatePlus(days); v15TicketEditDraft.rush = !!rush; v15RenderTicketEditor(); }
function v15LineSummary(lines) {
  return lines.map(line => `${garmentById(line.garmentId)?.name || 'Service item'} × ${line.qty}`).join(', ');
}
function v15ApplyTicketEdit(orderId, draft) {
  const order = state.orders.find(item => item.id === orderId); if (!order) return { ok:false, error:'Ticket not found' };
  if (!v12IsOpen(order)) return { ok:false, error:'Only open tickets can be edited' };
  const lines = (draft?.lineItems || []).map(v15NormalizeEditLine);
  if (!lines.length) return { ok:false, error:'Add at least one item before saving the ticket' };
  if (!draft.dueDate) return { ok:false, error:'Choose a due date' };
  const previousPaid = v15PaidAmount(order), before = { total:order.total, gross:v15GrossTotal(order), dueDate:order.dueDate, rush:!!order.rush, lineCount:(order.lineItems || []).length, summary:order.items || '' };
  order.lineItems = lines.map(({ _editId, ...line }) => line); order.itemsDetail = order.lineItems.map(line => ({ ...line }));
  order.total = v15EditorTotal({ lineItems:lines }); order.subtotal = order.total;
  order.serviceType = lines[0].serviceType || v8ServiceForItem(lines[0]); order.services = [...new Set(lines.map(line => line.serviceType || v8ServiceForItem(line)))];
  order.pieceCount = Math.max(1, Math.round(lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)));
  order.items = v15LineSummary(lines); order.notes = String(draft.notes || '').trim(); order.dueDate = draft.dueDate; order.rush = !!draft.rush; order.dueTime = draft.rush ? 'AS SOON AS POSSIBLE' : (order.dueTime === 'AS SOON AS POSSIBLE' ? '04:00 PM' : order.dueTime || '04:00 PM');
  if (Number(order.surcharge || 0) > 0 && /card/i.test(String(order.paymentMethod || ''))) order.surcharge = v15RoundMoney(Math.max(0, order.total - Number(order.discount || 0)) * 0.03);
  if (previousPaid > 0) order.amountPaid = previousPaid;
  const balance = v15OrderBalance(order); order.paid = previousPaid > 0 && balance <= 0.004;
  if (balance > 0.004 && previousPaid > 0) order.paymentStatus = 'balance_due_after_edit';
  const after = { total:order.total, gross:v15GrossTotal(order), dueDate:order.dueDate, rush:!!order.rush, lineCount:order.lineItems.length, summary:order.items };
  const entry = { id:uid('ticket_edit_'), at:v8NowISO(), by:v6CurrentStaff()?.name || 'Staff', before, after };
  order.ticketEditHistory = order.ticketEditHistory || []; order.ticketEditHistory.unshift(entry);
  v8AddActivity(order, 'edit', `Whole ticket edited · ${before.lineCount} → ${after.lineCount} lines · ${money(before.gross)} → ${money(after.gross)}`, { editId:entry.id });
  recordSync(`Whole ticket edited · #${order.ticket || order.id} · ${money(before.gross)} → ${money(after.gross)}`);
  return { ok:true, order, entry, balance };
}
function v15SaveTicketEdit() {
  const result = v15ApplyTicketEdit(v15TicketEditDraft?.orderId, v15TicketEditDraft);
  if (!result.ok) return toast(result.error, false, 'alerttriangle');
  toast(`Ticket #${result.order.ticket || result.order.id} updated${result.balance > 0.004 ? ` · ${money(result.balance)} balance due` : ''}`, true, 'checkcircle');
  v15TicketEditDraft = null; closePosModal(); if (state.v7CustomerId) renderV7CustomerProfile(); else renderPosContent();
}
v7EditOpenTicket = v15OpenFullTicketEditor;

/* ------------------------- SEARCHABLE A/R BY PERSON ------------------------- */
function v15ArCustomerBlob(customer) {
  return [customer.customerNumber, customer.name, customer.phone, customer.email, ...(customer.addresses || []).flatMap(address => [address.street, address.line1, address.apartment, address.line2, address.city, address.zip])].filter(Boolean).join(' ').toLowerCase();
}
function v15ArMatches(query = state.v15ArSearch) {
  const value = String(query || '').trim().toLowerCase();
  return value ? state.customers.filter(customer => v15ArCustomerBlob(customer).includes(value)) : customersWithBalance();
}
function v15ArSearchInput(value) {
  state.v15ArSearch = value; renderPosContent();
  setTimeout(() => { const input = document.getElementById('v15-ar-search'); if (input) { input.focus(); try { input.setSelectionRange(value.length, value.length); } catch (error) {} } }, 0);
}
function v15ArSearchKeydown(event) { if (event.key !== 'Enter') return; event.preventDefault(); const customer = v15ArMatches()[0]; if (customer) v15OpenArCustomer(customer.id); }
function v15OpenArCustomer(customerId) { state.posNav = 'customers'; state.v7CustomerId = customerId; state.v7CustomerTab = 'payments'; v7RememberCustomer(customerId); renderV7CustomerProfile(); }
renderPosAR = function v15RenderPosAR(content) {
  const withBalance = customersWithBalance(), totalOutstanding = withBalance.reduce((sum, customer) => sum + arBalance(customer.id), 0), rows = v15ArMatches();
  content.innerHTML = `<div class="stat-row"><div class="stat-tile"><div class="st-label">Total Outstanding</div><div class="st-value">${money(totalOutstanding)}</div></div><div class="stat-tile"><div class="st-label">Accounts w/ Balance</div><div class="st-value">${withBalance.length}</div></div></div>
    <div class="pos-card"><div class="v15-ar-head"><div><h3>${icon('receipt',17)} Accounts Receivable</h3><div class="v2-note">Search any person by customer number, name, phone, email, or address.</div></div><div class="pos-search"><span class="search-ic">${icon('search',15)}</span><input id="v15-ar-search" autocomplete="off" placeholder="Search for a person…" value="${esc(state.v15ArSearch || '')}" oninput="v15ArSearchInput(this.value)" onkeydown="v15ArSearchKeydown(event)"></div></div>
      ${rows.length ? `<table class="pos-table"><thead><tr><th>Customer</th><th>Contact</th><th>Unpaid Tickets</th><th>Balance</th><th></th></tr></thead><tbody>${rows.map(customer => { const balance = arBalance(customer.id), unpaid = state.orders.filter(order => order.customerId === customer.id && v15OrderBalance(order) > 0.004); return `<tr><td><strong>${esc(customer.name)}</strong><div class="row-sub">${esc(customer.customerNumber || 'No customer #')}</div></td><td>${esc(customer.phone || customer.email || 'No contact information')}</td><td>${unpaid.length}</td><td><strong class="${balance > 0.004 ? 'v12-balance-due' : ''}">${money(balance)}</strong></td><td><div class="v12-row-actions"><button class="btn btn-secondary btn-sm" onclick="v15OpenArCustomer('${customer.id}')">View Customer</button>${balance > 0.004 ? `<button class="btn btn-gold btn-sm" onclick="posOpenStatement('${customer.id}')">Statement</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>` : `<div class="table-empty">${state.v15ArSearch ? 'No customer matches this search.' : 'No outstanding balances — everyone is paid up.'}</div>`}</div>`;
};
posOpenStatement = function v15OpenStatement(customerId) {
  const customer = customerById(customerId); if (!customer) return;
  const unpaid = state.orders.filter(order => order.customerId === customer.id && v15OrderBalance(order) > 0.004), total = arBalance(customerId);
  openPosModal(`<h3>${icon('receipt',17)} Statement · ${esc(customer.name)}</h3><p class="pm-sub">${esc(customer.customerNumber || '')}${customer.email ? ' · ' + esc(customer.email) : ''}${customer.phone ? ' · ' + esc(customer.phone) : ''}</p>
    <div class="pos-card" style="padding:14px;margin-bottom:14px">${unpaid.length ? unpaid.map(order => `<div class="receipt-row"><span>#${esc(order.ticket || order.id)} — ${esc(order.items || 'Ticket')}</span><span>${money(v15OrderBalance(order))}</span></div>`).join('') : '<div class="helper-text">No unpaid tickets.</div>'}<div class="receipt-row total"><span>Amount Due</span><span>${money(total)}</span></div></div>
    ${customer.email ? `<button class="btn btn-primary btn-block" onclick="posSendStatementEmail('${customer.id}')">${icon('send',16)} Email Statement to ${esc(customer.email)}</button>` : '<div class="v8-secure-note">Add an email address to send this statement electronically.</div>'}
    ${total > 0.004 ? `<button class="btn btn-gold btn-block" style="margin-top:8px" onclick="posRecordArPayment('${customer.id}')">${icon('cash',16)} Record Payment · ${money(total)}</button>` : ''}
    <button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="v15OpenArCustomer('${customer.id}')">View Customer Profile</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Close</button>`);
};

/* ------------------------- CUSTOMER PROFILE CORRECTION ACTIONS ------------------------- */
function v15TicketPaymentBadge(order) {
  const balance = v15OrderBalance(order), refunded = v15RefundedTotal(order);
  if (balance > 0.004) return `<span class="v7-balance bad">${money(balance)} due</span>`;
  if (refunded > 0.004) return `<span class="v7-balance warn">${order.paymentStatus === 'refunded' ? 'Refunded' : 'Partial refund'} · ${money(refunded)}</span>`;
  return '<span class="v7-balance good">Paid</span>';
}
function v15TicketCard(order) {
  const open = v12IsOpen(order), refundable = v15Refundable(order);
  return `<div class="v7-ticket-card"><div class="top"><div style="min-width:0"><strong>#${esc(order.ticket || order.id)} · ${esc(V8_SERVICE_NAMES[v8OrderService(order)] || 'Service')}</strong><div class="v7-ticket-meta">${esc(order.items || '')}<br>Status: ${esc(v12StatusLabel(order))} · ${esc(v8OrderLocation(order))} · Due ${esc(order.dueDate || '—')}<br>Barcode ${esc(order.barcode || '—')} · ${v8TagBadgeHTML(order)}</div></div><div>${v15TicketPaymentBadge(order)}</div></div>
    ${v8HistoryLineItems(order)}${v15RefundHistoryHTML(order)}${v8ActivityHTML(order)}
    <div class="v7-actions"><button class="btn btn-ghost btn-sm" onclick="posOpenOrderDetail('${order.id}')">View Detail</button>${open ? `<button class="btn btn-secondary btn-sm" onclick="v15OpenFullTicketEditor('${order.id}')">Edit Whole Ticket</button>` : ''}${order.status === 'picked_up' ? `<button class="btn btn-secondary btn-sm" onclick="v15OpenPickupRecall('${order.id}')">Recall Pickup</button>` : ''}${refundable > 0.004 ? `<button class="btn btn-gold btn-sm" onclick="v15OpenRefund('${order.id}')">Refund</button>` : ''}${!order.paid && v15OrderBalance(order) > 0.004 ? `<button class="btn btn-gold btn-sm" onclick="v7RecordPayment('${order.id}')">Mark Paid</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="posPrintReceipt('${order.id}')">Print</button></div></div>`;
}
function v15CustomerRefundsHTML(customerId) {
  const rows = state.orders.filter(order => order.customerId === customerId && (order.refunds || []).length).flatMap(order => order.refunds.map(refund => ({ order, refund }))).sort((a, b) => new Date(b.refund.at) - new Date(a.refund.at));
  if (!rows.length) return '<div class="helper-text">No refunds recorded for this customer.</div>';
  return `<div class="v15-money-ledger">${rows.map(({ order, refund }) => `<div><span><strong>${money(refund.amount)}</strong> · #${esc(order.ticket || order.id)} · ${esc(refund.methodLabel || V15_REFUND_METHODS[refund.method])}</span><small>${esc(refund.reason)} · ${v8TimeLabel(refund.at)}</small></div>`).join('')}</div>`;
}
renderV7CustomerProfile = function v15RenderCustomerProfile() {
  const content = document.getElementById('pos-content'); if (!content) return; const customer = customerById(state.v7CustomerId); if (!customer) { renderPosCustomers(content); return; }
  const rank = v7AnnualRank(customer), open = v7OpenTickets(customer.id), previous = v7PreviousTickets(customer.id), delivered = v7DeliveredTickets(customer.id), balance = arBalance(customer.id), memo = (state.customerMemos || {})[customer.id] || '', tab = state.v7CustomerTab || 'overview';
  const cards = orders => orders.length ? orders.map(v15TicketCard).join('') : '<div class="helper-text">No tickets in this section.</div>';
  content.innerHTML = `<div class="v7-profile-head"><div class="v7-profile-main"><div class="v6-section-title"><div><h2 style="margin:0">${esc(customer.name)} <span class="v9-customer-number">${esc(customer.customerNumber || '—')}</span></h2><div class="row-sub">${esc(customer.phone || 'No phone')}${customer.email ? ' · ' + esc(customer.email) : ''}</div>${customer.addresses?.length ? `<div class="row-sub" style="margin-top:3px">${customer.addresses.map(address => esc(v8AddressText(address))).join('<br>')}</div>` : ''}</div><button class="btn btn-ghost btn-sm" onclick="v7CloseCustomerProfile()">Back to Customers</button></div>
      <div class="v4-due-kpis"><div><small>Open Tickets</small><strong>${open.length}</strong></div><div><small>Outstanding</small><strong>${money(balance)}</strong></div><div class="v15-credit-kpi"><small>Store Credit</small><strong>${money(customer.storeCredit || 0)}</strong></div></div>
      <div class="v7-actions"><button class="btn btn-secondary btn-sm" onclick="v15OpenStoreCredit('${customer.id}')">${icon('wallet',14)} Manage Store Credit</button><button class="btn btn-secondary btn-sm" onclick="v8OpenAddCard('${customer.id}')">${icon('creditcard',14)} Add Card Securely</button>${balance > 0 ? `<button class="btn btn-gold btn-sm" onclick="posOpenStatement('${customer.id}')">View A/R</button>` : ''}</div></div><div class="v7-rank"><small>Year Spend Rank</small><strong>#${rank.rank || '—'}</strong><div>${money(rank.spend)} net spend · ${rank.total} customers</div></div></div>
    <div class="v7-customer-tabs">${['overview','open','previous','delivered','payments','notes'].map(value => `<div class="v7-customer-tab ${tab === value ? 'active' : ''}" onclick="v7SetCustomerTab('${value}')">${({ overview:'Overview', open:'Open Tickets', previous:'Previous Tickets', delivered:'Delivered', payments:'Payments & A/R', notes:'Notes' })[value]}</div>`).join('')}</div>
    ${tab === 'overview' ? `<div class="pos-card"><h3>Open Tickets</h3>${cards(open)}</div><div class="pos-card"><h3>Recent History</h3>${cards(previous.slice(0, 5))}</div><div class="pos-card"><h3>Customer Memo</h3><div class="v7-note-box">${memo ? esc(memo) : '<span class="muted">No memo yet.</span>'}</div><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="v7AddMemo('${customer.id}')">Edit Memo</button></div>` : tab === 'open' ? `<div class="pos-card"><h3>Open Tickets · Full Editing Available</h3><div class="v2-note" style="margin-bottom:10px">Edit the entire ticket, change existing lines, or add new garments without recreating the order.</div>${cards(open)}</div>` : tab === 'previous' ? `<div class="pos-card"><h3>Previous Tickets</h3>${cards(previous)}</div>` : tab === 'delivered' ? `<div class="pos-card"><h3>Delivered Tickets</h3>${cards(delivered)}</div>` : tab === 'payments' ? `<div class="pos-card"><h3>Payments, Refunds & A/R</h3><div class="price-line"><span>Outstanding balance</span><strong>${money(balance)}</strong></div><div class="price-line"><span>Store credit</span><strong>${money(customer.storeCredit || 0)}</strong></div><div class="price-line"><span>Cards on file</span><span>${(customer.paymentMethods || []).map(card => `${esc(card.brand)} •••• ${esc(card.last4)}`).join(', ') || 'None'}</span></div><div class="v8-secure-note">Full card numbers and expiration dates are never stored or displayed. Production charges and refunds use processor tokens.</div><div class="v15-two-actions" style="margin-top:10px"><button class="btn btn-secondary" onclick="v15OpenStoreCredit('${customer.id}')">Manage Store Credit</button><button class="btn btn-secondary" onclick="v8OpenAddCard('${customer.id}')">Add Card Securely</button></div><span class="field-label" style="margin-top:18px">Store-credit history</span>${v15StoreCreditHistoryHTML(customer)}<span class="field-label" style="margin-top:18px">Refund history</span>${v15CustomerRefundsHTML(customer.id)}<span class="field-label" style="margin-top:18px">All tickets</span>${cards(state.orders.filter(order => order.customerId === customer.id))}</div>` : `<div class="pos-card"><h3>Customer Notes</h3><div class="v7-note-box">${memo ? esc(memo) : '<span class="muted">No memo yet.</span>'}</div><button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="v7AddMemo('${customer.id}')">Edit Memo</button></div>`}`;
};

/* ------------------------- CORRECT DETAIL NAVIGATION ------------------------- */
let v15DetailOrderIds = [], v15DetailIndex = -1, v15DetailModalActive = false;
function v15DetailSourceIds(orderId) {
  if (state.posNav === 'orders') return v12LedgerRows().map(order => order.id);
  const order = state.orders.find(item => item.id === orderId);
  if (order?.customerId) return state.orders.filter(item => item.customerId === order.customerId).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(item => item.id);
  return state.orders.map(item => item.id);
}
function v15DetailControlsHTML(order) {
  const refundable = v15Refundable(order), open = v12IsOpen(order);
  return `<div class="v15-detail-corrections">${v15RefundHistoryHTML(order)}<div class="v15-detail-actions">${open ? `<button class="btn btn-secondary" onclick="v15OpenFullTicketEditor('${order.id}')">Edit Whole Ticket / Add Items</button>` : ''}${order.status === 'picked_up' ? `<button class="btn btn-secondary" onclick="v15OpenPickupRecall('${order.id}')">Recall Picked-Up Ticket</button>` : ''}${refundable > 0.004 ? `<button class="btn btn-gold" onclick="v15OpenRefund('${order.id}')">Refund up to ${money(refundable)}</button>` : ''}</div></div>`;
}
const v15BaseOpenOrderDetail = posOpenOrderDetail;
posOpenOrderDetail = function v15OpenOrderDetail(orderId) {
  v15DetailOrderIds = v15DetailSourceIds(orderId); v15DetailIndex = v15DetailOrderIds.indexOf(orderId); v14LedgerSelectedId = orderId;
  v15BaseOpenOrderDetail(orderId);
  v15DetailModalActive = true;
  const order = state.orders.find(item => item.id === orderId), modal = document.getElementById('pos-modal'); if (!order || !modal) return;
  const heading = modal.querySelector?.('h3');
  if (heading && v15DetailOrderIds.length > 1) heading.insertAdjacentHTML('afterend', `<div class="v15-detail-nav"><button ${v15DetailIndex <= 0 ? 'disabled' : ''} onclick="v15OpenDetailAt(${v15DetailIndex - 1})">${icon('chevronup',14)} Previous</button><strong>Ticket ${v15DetailIndex + 1} of ${v15DetailOrderIds.length}</strong><button ${v15DetailIndex >= v15DetailOrderIds.length - 1 ? 'disabled' : ''} onclick="v15OpenDetailAt(${v15DetailIndex + 1})">Next ${icon('chevrondown',14)}</button></div>`);
  const closeButton = modal.querySelector?.('button[onclick="closePosModal()"]');
  if (closeButton) closeButton.insertAdjacentHTML('beforebegin', v15DetailControlsHTML(order)); else modal.insertAdjacentHTML('beforeend', v15DetailControlsHTML(order));
};
function v15OpenDetailAt(index) {
  const next = Math.max(0, Math.min(v15DetailOrderIds.length - 1, Number(index))); const id = v15DetailOrderIds[next]; if (id) posOpenOrderDetail(id);
}
document.addEventListener('keydown', event => {
  if (!['ArrowUp','ArrowDown'].includes(event.key)) return;
  const overlay = document.getElementById('pos-modal-overlay'); if (!v15DetailModalActive || !overlay?.classList?.contains('show') || v15DetailIndex < 0) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return;
  event.preventDefault(); v15OpenDetailAt(v15DetailIndex + (event.key === 'ArrowDown' ? 1 : -1));
});

/* ------------------------- MARKETING AI: TRY AGAIN / DRAFT HISTORY ------------------------- */
const v15BaseAiMarketingCopy = aiDraftMarketingCopy;
function v15AlternativeMarketingCopy(draft, attempt) {
  if (attempt <= 1) return v15BaseAiMarketingCopy(draft);
  const pct = Math.max(0, Number(draft.discountPct) || 0), index = (attempt - 2) % 3;
  const toneOpeners = {
    friendly:['Hi {first} — a little something from Hattan Cleaners:','Hi {first}! We saved something special for you:','Hi {first}, your wardrobe called — we can help.'],
    professional:['Hello {first}, an update from Hattan Cleaners:','Hello {first}, we would like to share this offer:','Hello {first}, thank you for choosing Hattan Cleaners.'],
    urgent:['Hi {first} — this ends soon:','Hi {first}, last call from Hattan Cleaners:','Hi {first} — your limited-time offer is ready:']
  };
  const bodies = {
    promo:[`save ${pct || 15}% on your next cleaning order this week.`,`bring in your next order and enjoy ${pct || 15}% off.`,`refresh your favorite pieces with ${pct || 15}% off your next visit.`],
    winback:[`we miss you. Come back for ${pct || 15}% off your next order.`,`it has been a while—let us welcome you back with ${pct || 15}% off.`,`your next visit can be easier and ${pct || 15}% less.`],
    announce:['we have an update we think you will appreciate. Reply for details or stop in.','something new is happening at the shop—reply to learn more.','we wanted you to hear our latest shop update first.'],
    review:['if we made your day easier, would you share a quick review?','your feedback helps our neighborhood business—would you leave a quick review?','tell us how we did with a quick review when you have a moment.'],
    thanks:['thank you for trusting us with the clothes you care about.','we appreciate every visit and wanted to say thank you.','thank you for being part of the Hattan Cleaners community.'],
    custom:[String(draft.customGoal || 'we have an update from Hattan Cleaners.').trim(),String(draft.customGoal || 'we wanted to share a quick update.').trim(),String(draft.customGoal || 'here is the latest from Hattan Cleaners.').trim()]
  };
  const tone = toneOpeners[draft.tone] ? draft.tone : 'friendly', goal = bodies[draft.goalId] ? draft.goalId : 'custom';
  return `${toneOpeners[tone][index]} ${bodies[goal][index]} Reply STOP to opt out.`.replace(/\s+/g, ' ').trim();
}
function v15GenerateMarketingDraft() {
  marketingDraft.aiAttempt = Number(marketingDraft.aiAttempt || 0) + 1; marketingDraft.aiHistory = marketingDraft.aiHistory || [];
  if (marketingDraft.customBody) marketingDraft.aiHistory.unshift(marketingDraft.customBody);
  marketingDraft.customBody = v15AlternativeMarketingCopy(marketingDraft, marketingDraft.aiAttempt); renderPosContent();
  toast(marketingDraft.aiAttempt > 1 ? `New draft ${marketingDraft.aiAttempt} ready` : 'Draft ready — edit as needed before sending', true, 'sparkle');
}
posAiDraftMarketingCopy = v15GenerateMarketingDraft;
function v15TryAgainMarketing() { v15GenerateMarketingDraft(); }
function v15ResetMarketingAttempts() { marketingDraft.aiAttempt = 0; marketingDraft.aiHistory = []; }
const v15BaseSetMktGoal = posSetMktGoal, v15BaseSetMktTone = posSetMktTone, v15BaseSetMktTemplate = posSetMktTemplate;
posSetMktGoal = function v15SetMktGoal(id) { v15ResetMarketingAttempts(); v15BaseSetMktGoal(id); };
posSetMktTone = function v15SetMktTone(id) { v15ResetMarketingAttempts(); v15BaseSetMktTone(id); };
posSetMktTemplate = function v15SetMktTemplate(id) { v15ResetMarketingAttempts(); v15BaseSetMktTemplate(id); };
const v15BaseRenderMarketing = renderPosMarketing;
renderPosMarketing = function v15RenderMarketing(content) {
  v15BaseRenderMarketing(content);
  const button = content.querySelector?.('button[onclick="posAiDraftMarketingCopy()"]');
  if (button && Number(marketingDraft.aiAttempt || 0) > 0) button.insertAdjacentHTML('afterend', `<button class="btn btn-ghost btn-block v15-try-again" style="margin-top:8px" onclick="v15TryAgainMarketing()">${icon('refresh',16)} Try Again — Make a Different Draft</button><div class="v15-draft-count">Draft ${marketingDraft.aiAttempt}${marketingDraft.aiHistory?.length ? ` · ${marketingDraft.aiHistory.length} previous version${marketingDraft.aiHistory.length === 1 ? '' : 's'} kept this session` : ''}</div>`);
};

/* Keep wide editing modals from affecting the next ordinary dialog. */
const v15BaseOpenPosModal = openPosModal;
openPosModal = function v15OpenPosModal(html) { v15DetailModalActive = false; document.getElementById('pos-modal')?.classList?.remove('v15-wide-modal'); return v15BaseOpenPosModal(html); };

v15EnsureData(); saveState();
if (typeof renderPosRoot === 'function') renderPosRoot();
