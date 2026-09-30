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

/* V32.3 — printed ticket clean-up
 * - Chinese only on Wash & Fold tickets (for the laundry team's special directions), never on other tickets.
 * - Totals: no Tax / Sub.T / G.Total clutter — just the total or balance; PrePay only for a partial prepayment;
 *   the 3% cash/check price only when the customer is paying cash/check.
 * - CleanBase addresses keep the apartment in line2 — read it, so the big apartment number prints on top. */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const unitOf = a => String(a?.apartment || a?.apt || a?.unit || a?.line2 || '').replace(/^(?:apt\.?|apartment|unit|#)\s*/i, '').trim();

  // 1) addresses: street/apartment from line1/line2
  if (typeof v8AddressForOrder === 'function') {
    const baseAddr = v8AddressForOrder;
    const w = function v32AddressForOrder() {
      const a = baseAddr.apply(this, arguments);
      if (!a || typeof a !== 'object') return a;
      const apt = unitOf(a);
      if ((a.street || !a.line1) && (a.apartment || !apt)) return a;
      const out = { ...a, street: a.street || a.line1 || '', apartment: apt };
      if (apt && String(a.line2 || '').replace(/^(?:apt\.?|apartment|unit|#)\s*/i, '').trim() === apt) delete out.line2;
      return out;
    };
    window.v8AddressForOrder = w; try { v8AddressForOrder = w; } catch (_) {}
  }

  // 2) Wash & Fold directions in Chinese
  const WF_ZH = [
    [/separate|darks?\s*(?:&|and|\/)\s*whites?|sort\s+colou?rs?/i, '深色与白色分开'], [/low\s*(?:heat|dry)|delicate\s+dry/i, '低温烘干'],
    [/no\s+(?:fabric\s+)?softener/i, '不使用柔顺剂'], [/own\s+(?:soap|detergent)|customer'?s?\s+(?:soap|detergent)|provided\s+detergent/i, '使用客户自带洗衣液'],
    [/hang\s*(?:dry|to\s+dry)|air\s*dry/i, '悬挂晾干'], [/fragrance[- ]?free|unscented|hypo/i, '无香洗衣液'],
    [/cold\s+(?:wash|water)/i, '冷水洗'], [/no\s+bleach/i, '不要漂白'], [/bleach\s+whites?/i, '白色衣物可漂白'],
    [/no\s+dry(?:er)?\b|do\s+not\s+dry/i, '不要烘干'], [/fold\s+only/i, '只折叠'], [/black\s+bag/i, '黑色洗衣袋'], [/white\s+bag/i, '白色洗衣袋'],
  ];
  const zhFor = text => { const out = []; WF_ZH.forEach(([re, zh]) => { if (re.test(String(text || '')) && !out.includes(zh)) out.push(zh); }); return out.join(' · '); };
  const serviceOf = o => { try { return v8OrderService(o); } catch (_) { return o?.serviceType || ''; } };

  // 3) totals
  function totalsRows(order) {
    const subtotal = Number(order.subtotal ?? order.total ?? 0), fee = Number(order.surcharge || 0), tax = Number(order.tax || 0), cashDisc = Number(order.cashDiscount || 0);
    const grand = subtotal + fee + tax - cashDisc;
    const credit = Number(order.storeCreditApplied || 0);
    const prepaid = Math.min(grand, Math.max(0, Number(order.amountCharged ?? (order.paid ? grand : 0)) || 0));
    const balance = Math.max(0, grand - prepaid);
    const row = (label, value, big) => `<div class="rt-row${big ? ' rt-total' : ''}"><span>${label}</span><strong>${value}</strong></div>`;
    const rows = [];
    if (fee || cashDisc || tax) {
      rows.push(row('Subtotal', money(subtotal)));
      if (fee) rows.push(row('Card Fee 3%', money(fee)));
      if (cashDisc) rows.push(row('Cash Discount 3%', '-' + money(cashDisc)));
      if (tax) rows.push(row('Tax', money(tax)));
    }
    const payingCash = /cash|check/i.test(String(order.paymentMethod || order.intendedPaymentMethod || order.payLaterMethod || ''));
    const cardPriced = !!(window.hcPricing && hcPricing.cardPriced && hcPricing.cardPriced(order));
    const cashLine = cardPriced && payingCash && balance > 0.004 && order.cashPrice != null ? row('Cash / check price (3% off)', money(Math.max(0, Number(order.cashPrice) - Number(order.discount || 0) - prepaid))) : '';
    if (balance < 0.005) {
      rows.push(row('Total', money(grand), true)); rows.push(row('PAID', money(grand)));
    } else if (prepaid > 0.004) {
      rows.push(row('Total', money(grand)));
      if (credit > 0.004) rows.push(row('Store Credit', '−' + money(Math.min(credit, prepaid))));
      if (prepaid - credit > 0.004) rows.push(row('PrePay', money(prepaid - credit)));
      rows.push(row('Balance', money(balance), true)); if (cashLine) rows.push(cashLine);
    } else {
      rows.push(row('Balance', money(balance), true)); if (cashLine) rows.push(cashLine);
    }
    return rows.join('');
  }

  const prev = (typeof window.receiptTicketHTML === 'function') ? window.receiptTicketHTML : (typeof receiptTicketHTML === 'function' ? receiptTicketHTML : null);
  if (!prev) return;
  function v32Receipt(order) {
    let html = prev.apply(this, arguments);
    if (!order || typeof html !== 'string') return html;
    try {
      const wf = serviceOf(order) === 'washfold';
      // Chinese: drop from every item line; Wash & Fold gets one Chinese line for its directions.
      html = html.replace(/<span class="v17-zh-line">[\s\S]*?<\/span>/g, '');
      if (wf) {
        const text = [order.notes, ...(order.lineItems || []).map(l => [l.garmentNote, l.instructions, (typeof v8LinePrintDescription === 'function' ? v8LinePrintDescription(l).detail : '')].join(' ')), ...(order.instructions || [])].join(' · ');
        const zh = zhFor(text);
        if (zh) {
          const block = `<div class="v32-wf-zh"><span>洗衣房说明</span>${E(zh)}</div>`;
          const notesAt = html.indexOf('<div class="v11-notes">');
          if (notesAt >= 0) { const end = html.indexOf('</div>', notesAt) + 6; html = html.slice(0, end) + block + html.slice(end); }
          else { const at = html.indexOf('<div class="rt-hr"></div><div class="v11-totals">'); if (at >= 0) html = html.slice(0, at) + block + html.slice(at); }
        }
      }
      // Totals
      const start = html.indexOf('<div class="v11-totals">'), end = html.indexOf('<div class="v11-hours">');
      if (start >= 0 && end > start) {
        const piece = (/<div class="v11-piece-count">[\s\S]*?<\/div>/.exec(html.slice(start, end)) || [''])[0];
        html = html.slice(0, start) + `<div class="v11-totals">${piece}<div>${totalsRows(order)}</div></div>` + html.slice(end);
      }
    } catch (e) { console.error('V32 ticket', e); }
    return html;
  }
  window.receiptTicketHTML = v32Receipt;
  try { receiptTicketHTML = v32Receipt; } catch (_) {}
})();

/* V32.4 — Simple version customer search: no lag.
 * Every key used to redraw the whole Simple counter screen and the box lost focus, so typing stalled
 * after each letter. Now only the result list updates (after a short pause), the box keeps focus,
 * CleanBase directory customers are included, and Enter picks the first match. */
(function () {
  'use strict';
  if (typeof posCustomerSearchInput !== 'function') return;
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
  const isSimpleBox = el => el && el.tagName === 'INPUT' && el.classList.contains('v13-giant-input') && /name or phone|nombre o tel/i.test(el.placeholder || '');
  let timer = null, first = null;

  function draw(input) {
    const q = String(posCustomerSearch || '').trim();
    let box = input.parentNode.querySelector(':scope > .v32-simple-results');
    // Remove the list the full redraw put there (it is replaced by ours).
    [...input.parentNode.children].forEach(el => { if (el !== box && !el.className && el.querySelector && el.querySelector(':scope > .v13-cust-row')) el.remove(); });
    if (!box) { box = document.createElement('div'); box.className = 'v32-simple-results'; input.insertAdjacentElement('afterend', box); }
    first = null;
    if (!q) { box.innerHTML = ''; return; }
    let local = [];
    try { local = (typeof v8CustomerSearchResults === 'function' ? v8CustomerSearchResults(q) : []).slice(0, 8); } catch (_) {}
    let dir = [];
    try { if (typeof window.v296CounterMatches === 'function') dir = window.v296CounterMatches(q, new Set((state.customers || []).map(c => String(c.customerNumber || '')).filter(Boolean))).slice(0, Math.max(0, 8 - local.length)); } catch (_) {}
    if (local[0]) first = () => posPickCustomer(local[0].id); else if (dir[0]) first = () => window.v296CounterPick(dir[0].num, true);
    box.innerHTML = local.map(c => `<div class="v13-cust-row" onclick="posPickCustomer('${E(c.id)}')"><div class="avatar">${E(c.initials || '')}</div><div style="flex:1"><strong>${E(c.name)}</strong><small>${E(fmtPhone(c.phone))}</small></div>${icon('chevronright', 20)}</div>`).join('')
      + dir.map(r => `<div class="v13-cust-row" onclick="v296CounterPick('${E(r.num)}', true)"><div class="avatar">${icon('user', 18)}</div><div style="flex:1"><strong>${E(r.name || 'Customer #' + r.num)}</strong><small>${E(fmtPhone(r.phone))}${r.street ? ' · ' + E(r.street) + (r.apt ? ' #' + E(r.apt) : '') : ''} · #${E(r.num)}</small></div>${icon('chevronright', 20)}</div>`).join('')
      || `<div class="helper-text" style="padding:10px 4px">No match yet — keep typing, or tap New Customer.</div>`;
  }

  const base = posCustomerSearchInput;
  const w = function v32CustomerSearchInput(value) {
    const el = document.activeElement;
    if (!isSimpleBox(el)) return base.apply(this, arguments);
    posCustomerSearch = value;
    if (!el.dataset.v32) {
      el.dataset.v32 = '1'; el.autocomplete = 'off';
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); draw(el); if (first) first(); } });
    }
    clearTimeout(timer);
    timer = setTimeout(() => draw(el), 120);
  };
  window.posCustomerSearchInput = w; try { posCustomerSearchInput = w; } catch (_) {}
})();

/* V32.5 — Simple version Pay screen: the daily "charge every card on file" batch, same as the
 * Payments screen in the regular version (same safety: manager only, once per ticket, no double charge). */
(function () {
  'use strict';
  if (typeof v13RenderSimplePay !== 'function') return;
  const base = v13RenderSimplePay;
  const w = function v32RenderSimplePay(content) {
    const r = base.apply(this, arguments);
    try {
      if (!(typeof v13PayOrderId !== 'undefined' && v13PayOrderId) && typeof window.v297Panel === 'function') {
        const wrap = content.querySelector('.v13-simple-wrap') || content;
        wrap.insertAdjacentHTML('beforeend', `<div class="v32-simple-batch">${window.v297Panel()}</div>`);
      }
    } catch (e) { console.error('V32 simple batch', e); }
    return r;
  };
  window.v13RenderSimplePay = w; try { v13RenderSimplePay = w; } catch (_) {}
})();
