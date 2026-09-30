/* Hattan Ops Suite V32 — counter fixes
 * - "Scan for Delivery" list and chosen driver survive a page reload on this computer.
 * - Checkout Pickup / Delivery buttons show which one is chosen (CSS in v32-pos-fixes.css).
 * - Sync pill: steady "Saved · Live" / "Saving…" with a fixed width so the header doesn't jump.
 */
(function () {
  'use strict';
  const KEY = 'hattan_delivery_scan_v32';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* storage blocked */ } };
  const ui = () => (state.deliveryUi = state.deliveryUi || { input: '', scanned: [], driverId: '' });
  const current = () => { const u = ui(); return JSON.stringify({ scanned: Array.isArray(u.scanned) ? u.scanned : [], driverId: u.driverId || '' }); };

  // Restore once at start-up (only fills an empty list, so it never overrides fresh work).
  let last = null;
  function restore() {
    const saved = read(); const u = ui();
    if (!Array.isArray(u.scanned)) u.scanned = [];
    if (saved && Array.isArray(saved.scanned) && saved.scanned.length && !u.scanned.length) u.scanned = saved.scanned.slice(0, 500);
    if (saved && saved.driverId && !u.driverId && (state.drivers || []).some(d => d.id === saved.driverId)) u.driverId = saved.driverId;
    last = current();
  }
  function persist() {
    if (!started) return;
    try {
      const now = current();
      if (now !== last) { last = now; write(JSON.parse(now)); }
    } catch (_) { /* ignore */ }
  }
  // The POS start-up (loadState on DOMContentLoaded) replaces state.deliveryUi, so restore after it.
  let started = false;
  function start() { if (started) return; started = true; restore(); setInterval(persist, 1000); }
  if (typeof loadState === 'function') {
    const baseLoad = loadState;
    loadState = function v32LoadState() { const r = baseLoad.apply(this, arguments); started ? restore() : start(); return r; };
  }
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  // Cheap check once a second (started above) plus on every save / before leaving the page.
  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);
  if (typeof saveState === 'function') {
    const base = saveState;
    saveState = function v32SaveState() { const r = base.apply(this, arguments); persist(); return r; };
  }
  // The live data loader replaces state after sign-in; put the scan list back if it got cleared.
  if (typeof v16ApplySnapshot === 'function') {
    const baseApply = v16ApplySnapshot;
    v16ApplySnapshot = function v32ApplySnapshot() {
      const keep = current();
      const r = baseApply.apply(this, arguments);
      const u = ui(); const k = JSON.parse(keep);
      if (!Array.isArray(u.scanned) || !u.scanned.length) u.scanned = k.scanned;
      if (!u.driverId && k.driverId) u.driverId = k.driverId;
      return r;
    };
  }
})();

/* V32.1 — "Edit Entire Ticket" can switch a ticket between Customer Pickup and Delivery. */
(function () {
  'use strict';
  if (typeof v15CreateTicketEditDraft !== 'function' || typeof v15TicketEditorHTML !== 'function' || typeof v15ApplyTicketEdit !== 'function') return;
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const isDel = o => o && (o.fulfillment === 'delivery' || o.channel === 'delivery');
  const addrText = a => { try { return typeof v8AddressText === 'function' ? v8AddressText(a) : [a.street, a.apartment && 'Apt ' + a.apartment].filter(Boolean).join(', '); } catch (_) { return a?.street || 'Address'; } };

  const baseDraft = v15CreateTicketEditDraft;
  v15CreateTicketEditDraft = function v32CreateTicketEditDraft(order) {
    const draft = baseDraft.apply(this, arguments);
    draft.fulfillment = isDel(order) ? 'delivery' : 'pickup';
    draft.originalFulfillment = draft.fulfillment;
    const c = order.customerId ? customerById(order.customerId) : null;
    draft.addressId = typeof order.address === 'string' ? order.address : (order.address && typeof order.address === 'object' ? '__order' : ((c?.addresses || [])[0]?.id || ''));
    return draft;
  };

  function block(draft, order) {
    const c = order.customerId ? customerById(order.customerId) : null;
    const addrs = c?.addresses || [];
    const del = draft.fulfillment === 'delivery';
    const opts = [
      ...(order.address && typeof order.address === 'object' ? [`<option value="__order" ${draft.addressId === '__order' ? 'selected' : ''}>${E(addrText(order.address))} (from the app)</option>`] : []),
      ...addrs.map(a => `<option value="${E(a.id)}" ${draft.addressId === a.id ? 'selected' : ''}>${E(a.label ? a.label + ' · ' : '')}${E(addrText(a))}</option>`),
    ];
    return `<div class="v32-edit-fulfill"><span class="field-label" style="margin:0 0 6px">How the customer gets it back</span>
      <div class="v32-fulfill-btns"><button type="button" class="${!del ? 'sel' : ''}" onclick="v32SetEditFulfillment('pickup')">${icon('box', 15)} Customer Pickup</button>
      <button type="button" class="${del ? 'sel' : ''}" onclick="v32SetEditFulfillment('delivery')">${icon('truck', 15)} Delivery</button></div>
      ${del ? (opts.length ? `<label style="display:block;margin-top:10px"><span class="field-label" style="margin:0 0 5px">Deliver to</span><select class="text-input" onchange="v15TicketEditDraft.addressId=this.value">${opts.join('')}</select></label>`
        : `<div class="warn-banner" style="margin-top:10px">${icon('alerttriangle', 15)}<span>${c ? 'This customer has no address on file — add one on the customer profile first.' : 'Walk-in guests can’t be delivered to — attach the ticket to a customer first.'}</span></div>`) : ''}
      ${draft.fulfillment !== draft.originalFulfillment ? `<div class="helper-text" style="margin-top:8px">Changes from ${draft.originalFulfillment === 'delivery' ? 'Delivery' : 'Customer Pickup'} to ${del ? 'Delivery' : 'Customer Pickup'} when you save.${!del && isDel(order) && order.assignedDriverId ? ' It will be taken off the driver’s route.' : ''}</div>` : ''}
    </div>`;
  }
  const baseHTML = v15TicketEditorHTML;
  v15TicketEditorHTML = function v32TicketEditorHTML() {
    const html = baseHTML.apply(this, arguments);
    const draft = v15TicketEditDraft, order = draft && state.orders.find(o => o.id === draft.orderId);
    if (!html || !order) return html;
    if (!draft.fulfillment) { draft.fulfillment = isDel(order) ? 'delivery' : 'pickup'; draft.originalFulfillment = draft.fulfillment; }
    const marker = '<div class="v15-edit-lines">';
    return html.includes(marker) ? html.replace(marker, block(draft, order) + marker) : html;
  };
  window.v32SetEditFulfillment = v => {
    if (!v15TicketEditDraft) return;
    v15TicketEditDraft.fulfillment = v === 'delivery' ? 'delivery' : 'pickup';
    const scroll = document.getElementById('pos-modal')?.scrollTop;
    v15RenderTicketEditor();
    const m = document.getElementById('pos-modal'); if (m && scroll != null) m.scrollTop = scroll;
  };

  const baseApply = v15ApplyTicketEdit;
  v15ApplyTicketEdit = function v32ApplyTicketEdit(orderId, draft) {
    const order = state.orders.find(o => o.id === orderId);
    const want = draft?.fulfillment;
    const changing = order && want && want !== (isDel(order) ? 'delivery' : 'pickup');
    let addressId = null;
    if (order && want === 'delivery') {
      const c = order.customerId ? customerById(order.customerId) : null;
      if (draft.addressId === '__order' && order.address && typeof order.address === 'object') addressId = '__order';
      else addressId = (c?.addresses || []).some(a => a.id === draft.addressId) ? draft.addressId : ((c?.addresses || [])[0]?.id || null);
      if (!addressId) return { ok: false, error: c ? 'Add a delivery address to this customer first' : 'Attach this ticket to a customer before choosing Delivery' };
    }
    const result = baseApply.apply(this, arguments);
    if (!result?.ok || !order) return result;
    const addressChanged = want === 'delivery' && addressId !== '__order' && order.address !== addressId;
    if (!changing && !addressChanged) return result;
    const from = isDel(order) ? 'Delivery' : 'Customer Pickup';
    if (want === 'delivery') {
      order.fulfillment = 'delivery'; order.channel = 'delivery';
      if (addressId !== '__order') order.address = addressId;
    } else {
      order.fulfillment = 'pickup'; if (order.channel === 'delivery') order.channel = 'counter';
      order.assignedDriverId = null; order.assignedDriverName = null; order.driverRouteReady = false;
      if (order.status === 'out_for_delivery') { order.status = 'ready'; order.stageIndex = 3; }
      order.deliveryScanStatus = null;
      try { if (state.deliveryUi?.scanned) state.deliveryUi.scanned = state.deliveryUi.scanned.filter(id => id !== order.id); } catch (_) {}
    }
    const to = want === 'delivery' ? 'Delivery' : 'Customer Pickup';
    const label = changing ? `Changed ${from} → ${to}` : 'Delivery address changed';
    if (result.entry) { result.entry.before.fulfillment = from; result.entry.after.fulfillment = to; }
    try { v8AddActivity(order, 'edit', label, {}); } catch (_) {}
    try { recordSync(`#${order.ticket || order.id} · ${label}`); } catch (_) {}
    if (typeof saveState === 'function') saveState();
    return result;
  };
})();

/* V32.2 — deliveries always reach a real driver.
 * The "Send route to driver" menu could show one driver while the saved choice was an old demo driver,
 * so manifests went out "Unassigned" and never reached a driver app. Now the choice is checked before
 * sending, and any delivery stuck without a real driver shows in a "Needs a driver" card to fix in one tap. */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const drivers = () => (state.drivers || []).filter(d => d && d.id);
  const valid = id => drivers().some(d => d.id === id);
  const fixChoice = () => { const u = state.deliveryUi || (state.deliveryUi = { input: '', scanned: [], driverId: '' }); if (!valid(u.driverId)) u.driverId = drivers()[0]?.id || ''; return u.driverId; };
  const stuck = () => (state.orders || []).filter(o => o && (o.fulfillment === 'delivery' || o.channel === 'delivery') && o.driverRouteReady && !['delivered', 'voided', 'picked_up'].includes(o.status) && !valid(o.assignedDriverId));

  if (typeof v8PrintDeliveryBatch === 'function') {
    const basePrint = v8PrintDeliveryBatch;
    v8PrintDeliveryBatch = function v32PrintDeliveryBatch() {
      if (!fixChoice()) return toast('Add a driver on the Team screen first', false, 'alerttriangle');
      return basePrint.apply(this, arguments);
    };
  }
  window.v32SendStuck = () => {
    const id = document.getElementById('v32-stuck-driver')?.value || fixChoice();
    const d = drivers().find(x => x.id === id); if (!d) return toast('Choose a driver', false, 'alerttriangle');
    const list = stuck(); if (!list.length) return;
    const batches = new Set();
    list.forEach(o => {
      o.assignedDriverId = d.id; o.assignedDriverName = d.name; o.assignedAt = new Date().toISOString();
      if (o.deliveryBatchId) batches.add(o.deliveryBatchId);
      try { v8AddActivity(o, 'delivery_manifest', `Sent to ${d.name}'s driver app`, { driverId: d.id }); } catch (_) {}
    });
    (state.deliveryBatches || []).forEach(b => { if (batches.has(b.id) && !valid(b.driverId)) b.driverId = d.id; });
    try { recordSync(`${list.length} deliver${list.length === 1 ? 'y' : 'ies'} sent to ${d.name}`); } catch (_) {}
    saveState(); toast(`${list.length} deliver${list.length === 1 ? 'y' : 'ies'} now on ${d.name}'s driver app`, true, 'truck'); renderPosContent();
  };
  function card() {
    const list = stuck(); if (!list.length) return '';
    const pick = fixChoice();
    return `<div class="pos-card v32-stuck"><h3 style="margin:0 0 4px">${icon('alerttriangle', 17)} Needs a driver · ${list.length} ticket${list.length === 1 ? '' : 's'}</h3>
      <div class="v2-note">These were sent without a real driver, so no driver app shows them. Pick the driver and send.</div>
      <div style="margin:8px 0">${list.map(o => `<div class="row-sub">#${E(o.ticket || o.id)} · ${E(customerLabel(o))}${o.deliveryBatchId ? ' · ' + E(o.deliveryBatchId) : ''}</div>`).join('')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><select id="v32-stuck-driver" class="text-input" style="flex:1;min-width:200px">${drivers().map(d => `<option value="${E(d.id)}" ${d.id === pick ? 'selected' : ''}>${E(d.name)}</option>`).join('')}</select>
      <button class="btn btn-primary" onclick="v32SendStuck()">${icon('truck', 15)} Send to driver app</button></div></div>`;
  }
  if (typeof renderPosDelivery === 'function') {
    const baseRender = renderPosDelivery;
    renderPosDelivery = function v32RenderDelivery(content) {
      fixChoice();
      const r = baseRender.apply(this, arguments);
      try { const html = card(); if (html && content && !content.querySelector('.v32-stuck')) { const scan = content.querySelector('.v8-scan-box'); if (scan) scan.insertAdjacentHTML('beforebegin', html); else content.insertAdjacentHTML('afterbegin', html); } } catch (e) { console.error('V32 stuck', e); }
      return r;
    };
  }
})();
