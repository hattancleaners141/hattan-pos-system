/* Hattan Ops Suite V39 — counter/rack fixes
 * 1. Rack screen: typing in the lookup search, a rack number, or the conveyor box is never lost
 *    when the screen redraws (search used to keep only the first letter and jump to the scan box).
 * 2. Printing: a print that never reports back (closed dialog, iPad, driver hiccup) can no longer
 *    block every later print with "Finish the current print queue first".
 * 3. Customer profile → open tickets: "Pick Up" (opens the counter pickup for that ticket, with
 *    payment) and "Text receipt" (texts a receipt link; copy-link fallback if not opted in).
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* ---------------- 1. rack screen typing ---------------- */
  const keyFor = el => el.id ? '#' + CSS.escape(el.id) : (el.placeholder ? `input[placeholder="${CSS.escape(el.placeholder)}"]` : null);
  if (typeof renderPosRack === 'function') {
    const baseRack = renderPosRack;
    renderPosRack = function v39RenderRack(content) {
      const ae = document.activeElement;
      let key = null, val = '', s0 = 0, s1 = 0;
      if (ae && ae.tagName === 'INPUT' && content && content.contains(ae) && ae.type !== 'date') {
        key = keyFor(ae); val = ae.value;
        try { s0 = ae.selectionStart; s1 = ae.selectionEnd; } catch (_) {}
      }
      const r = baseRack.apply(this, arguments);
      if (key) {
        const restore = () => {
          const el = content.querySelector(key); if (!el) return;
          if (el.value !== val) el.value = val;
          if (document.activeElement !== el) el.focus();
          try { el.setSelectionRange(s0, s1); } catch (_) {}
        };
        restore(); setTimeout(restore, 0); setTimeout(restore, 30);
      }
      return r;
    };
    try { window.renderPosRack = renderPosRack; } catch (_) {}
  }
  // Search: redraw shortly after typing stops instead of on every key.
  let searchTimer = null;
  window.v8RackSetSearch = function v39RackSetSearch(v) {
    state.rackUi.search = v;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (state.posNav === 'rack') renderPosContent(); }, 220);
  };
  try { v8RackSetSearch = window.v8RackSetSearch; } catch (_) {}

  /* ---------------- 2. printing that never gets stuck ---------------- */
  let queue = [], active = false, startedAt = 0, watchdog = null, afterHandler = null;
  const DELAY = () => Number(window.V23_PRINT_JOB_DELAY_MS || 2500);
  function finish(msg) {
    if (afterHandler) window.removeEventListener('afterprint', afterHandler);
    afterHandler = null; clearTimeout(watchdog); queue = []; active = false;
    if (typeof v8FinishReceiptPrint === 'function') v8FinishReceiptPrint();
    if (msg !== false) toast(msg || 'Ticket printing complete', true, 'printer');
  }
  function next() {
    if (!queue.length) return finish();
    const job = queue.shift();
    const area = document.getElementById('print-area');
    if (!area || typeof window.receiptTicketHTML !== 'function') return finish('Printing is not available on this screen — reload the page');
    area.innerHTML = window.receiptTicketHTML(job.order);
    document.documentElement.classList.add('v8-receipt-printing');
    let done = false;
    afterHandler = () => {
      if (done) return; done = true;
      window.removeEventListener('afterprint', afterHandler); afterHandler = null; clearTimeout(watchdog);
      setTimeout(next, queue.length ? DELAY() : 0);
    };
    window.addEventListener('afterprint', afterHandler, { once: true });
    // If the browser never reports that printing finished, release the queue after 45s.
    clearTimeout(watchdog);
    watchdog = setTimeout(() => { if (!done) afterHandler(); }, 45000);
    startedAt = Date.now();
    setTimeout(() => requestAnimationFrame(() => {
      try { window.print(); }
      catch (e) { done = true; finish(false); toast(`Printing failed: ${e.message}`, false, 'alerttriangle'); }
    }), 90);
  }
  window.v8PrintOrders = function v39PrintOrders(orders, label) {
    const clean = (orders || []).filter(Boolean);
    if (!clean.length) return;
    if (active) {
      if (Date.now() - startedAt < 8000) return toast('Still printing the last ticket — try again in a few seconds', false, 'printer');
      finish(false); // the last print never reported back; start fresh
    }
    clean.forEach(order => {
      try {
        if (typeof v8AddActivity === 'function') v8AddActivity(order, 'print', `${label || 'Ticket'} printed`, { printer: 'Star TSP100IV', mode: 'one-ticket-job' });
        if (typeof recordSync === 'function') recordSync(`Ticket printed · #${order.ticket || order.id}`);
      } catch (_) {}
    });
    if (typeof saveState === 'function') saveState();
    if (typeof closePosModal === 'function') closePosModal();
    try { localStorage.setItem('hcLastPrinted', JSON.stringify(clean.map(o => o.id))); } catch (_) {}
    queue = clean.map(order => ({ order, label }));
    active = true; startedAt = Date.now();
    if (clean.length > 1) toast(`${clean.length} tickets queued · each prints separately`, true, 'printer');
    next();
  };
  window.posDoPrint = function v39DoPrint(orderId) { const o = state.orders.find(x => x.id === orderId); if (o) window.v8PrintOrders([o], 'Ticket'); };
  window.posPrintReceipt = function v39PrintReceipt(orderId) { window.posDoPrint(orderId); };
  window.v8PrintCreatedBatch = function v39PrintCreatedBatch(batchId) {
    const orders = state.orders.filter(o => o.intakeBatchId === batchId).sort((a, b) => Number(a.ticket) - Number(b.ticket));
    window.v8PrintOrders(orders, 'Intake ticket');
  };
  window.v5PrintMasterOrder = function v39PrintMasterOrder(orderId) {
    const order = state.orders.find(x => x.id === orderId); if (!order) return;
    const batch = order.intakeBatchId ? state.orders.filter(x => x.intakeBatchId === order.intakeBatchId) : [order];
    window.v8PrintOrders(batch.sort((a, b) => Number(a.ticket) - Number(b.ticket)), 'Service ticket');
  };
  try { posPrintReceipt = window.posPrintReceipt; posDoPrint = window.posDoPrint; v8PrintOrders = window.v8PrintOrders; } catch (_) {}

  /* ---------------- 2b. "+" key = reprint ---------------- */
  // Press + (numpad or keyboard) anywhere outside a text box to reprint the last ticket(s)
  // printed on this computer. With the POS opened in the quick-print window (Edge/Chrome
  // --kiosk-printing) this prints straight to the Star printer with no print screen.
  function lastPrintedOrders() {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('hcLastPrinted') || '[]'); } catch (_) {}
    let orders = ids.map(id => state.orders.find(o => o.id === id)).filter(Boolean);
    if (!orders.length) {
      const newest = (state.orders || []).filter(o => o && !o.legacy && o.status !== 'voided').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
      if (newest) orders = [newest];
    }
    return orders;
  }
  // Which ticket does + mean right now? 1) the ticket highlighted in Ticket List, 2) a ticket
  // whose detail window is open, 3) otherwise the last ticket(s) printed on this computer.
  function targetedOrders() {
    const byId = id => id && state.orders.find(o => o.id === id);
    const focusedRow = document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-order-id]');
    if (focusedRow) { const o = byId(focusedRow.dataset.orderId); if (o) return [o]; }
    const selRow = document.querySelector('#pos-content tr.v14-ledger-selected[data-order-id]');
    if (selRow) { const o = byId(selRow.dataset.orderId); if (o) return [o]; }
    try { if (state.posNav === 'orders' && typeof v14LedgerSelectedId !== 'undefined') { const o = byId(v14LedgerSelectedId); if (o) return [o]; } } catch (_) {}
    const modal = [...document.querySelectorAll('.pos-modal-overlay.show, .modal-overlay.show, .pos-modal.show')].pop();
    if (modal) {
      const ids = [...new Set([...modal.querySelectorAll('[onclick*="posPrintReceipt("],[onclick*="posDoPrint("]')].map(b => (b.getAttribute('onclick').match(/(?:posPrintReceipt|posDoPrint)\('([^']+)'\)/) || [])[1]).filter(Boolean))];
      if (ids.length === 1) { const o = byId(ids[0]); if (o) return [o]; }
    }
    return null;
  }
  window.v39Reprint = () => {
    const orders = targetedOrders() || lastPrintedOrders();
    if (!orders.length) return toast('No ticket to reprint yet', false, 'printer');
    toast(`Reprinting ${orders.map(o => '#' + (o.ticket || o.id)).join(', ')}`, true, 'printer');
    window.v8PrintOrders(orders, 'Reprint');
  };
  document.addEventListener('keydown', e => {
    if (e.key !== '+' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    const scanBox = t && ['v3-conveyor-input', 'v13-rack-scan', 'v8-delivery-scan'].includes(t.id); // barcodes never contain +
    if (!scanBox && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable))) return;
    if (!state.session || !state.session.loggedIn) return;
    e.preventDefault();
    window.v39Reprint();
  }, true);

  /* ---------------- 3. profile ticket buttons ---------------- */
  const CLOSED = ['picked_up', 'delivered', 'voided'];
  // Pick Up from the profile: choose the ticket(s), take any balance, timestamp the pickup.
  // Uses the same pickup engine as the counter (v14CompletePickup), so payments, rack clearing,
  // pickup texts and recall history all behave exactly the same.
  const pickupOrdersFor = cid => state.orders.filter(o => String(o.customerId) === String(cid) && !CLOSED.includes(o.status) && o.fulfillment !== 'delivery' && o.channel !== 'delivery' && !o.legacy);
  function pickupModal() {
    const c = customerById(v14PickupState.customerId); if (!c) return;
    const orders = pickupOrdersFor(c.id), sel = v14PickupSelectedOrders(), due = v14PickupAmount(sel);
    const flex = document.querySelector('.v33-flex-btn') || (window.hcFlex && hcFlex.ready && hcFlex.ready());
    openPosModal(`<h3>${icon('box', 18)} Pick Up · ${E(c.name)}</h3><p class="pm-sub">Tick every ticket the customer is taking home.</p>
      <div class="v39-pk">${orders.map(o => `<label class="v38-row"><input type="checkbox" ${v14PickupState.selected.has(o.id) ? 'checked' : ''} onchange="v39PickToggle('${E(o.id)}',this.checked)"><span><strong>#${E(o.ticket || o.id)}</strong> · ${E(o.items || '')} · ${o.status === 'ready' || o.rack || o.conveyorNumber ? `<b style="color:#1f6f43">Ready${o.rack ? ' · Rack ' + E(o.rack) : o.conveyorNumber ? ' · Conveyor ' + E(o.conveyorNumber) : ''}</b>` : `<span style="color:#b54708">Not ready yet</span>`} · ${o.paid ? 'Paid' : money(v14PickupAmount([o])) + ' due'}</span></label>`).join('')}</div>
      ${!sel.length ? '<div class="helper-text">Select at least one ticket.</div>' : due > 0 ? `<div class="v39-due">Balance due: <strong>${money(due)}</strong></div>
        <div class="v39-pay">${typeof v33FlexPickup === 'function' && flex ? `<button class="btn btn-primary" onclick="closePosModal();v33FlexPickup()">Charge on Clover Flex</button>` : ''}<button class="btn btn-secondary" onclick="v39PickDone('card')">Paid by card</button><button class="btn btn-secondary" onclick="v39PickDone('cash')">Paid cash</button><button class="btn btn-secondary" onclick="v39PickDone('check')">Paid check</button></div>`
        : `<button class="btn btn-primary btn-block" onclick="v39PickDone(null)">Complete pickup (${sel.length} ticket${sel.length === 1 ? '' : 's'})</button>`}
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
  }
  window.v39ProfilePickup = orderId => {
    const o = state.orders.find(x => x.id === orderId); if (!o) return;
    if (typeof v14CompletePickup !== 'function') return v7PickUpOrder(orderId);
    v14PickupState = { query: '', customerId: o.customerId, selected: new Set([o.id]), stage: 'select' };
    pickupModal();
  };
  window.v39PickToggle = (id, on) => { if (on) v14PickupState.selected.add(id); else v14PickupState.selected.delete(id); pickupModal(); };
  window.v39PickDone = method => {
    const sel = v14PickupSelectedOrders(); if (!sel.length) return;
    if (v14PickupAmount(sel) > 0 && !method) return;
    closePosModal();
    v14CompletePickup(method);
    setTimeout(() => { try { if (state.posNav === 'customers' && state.v7CustomerId && !document.querySelector('.pos-modal-overlay.show')) renderV7CustomerProfile(); } catch (_) {} }, 50);
  };
  window.v39TextReceipt = async orderId => {
    const o = state.orders.find(x => x.id === orderId); if (!o) return;
    const c = customerById(o.customerId); if (!c) return toast('This ticket has no customer', false, 'alerttriangle');
    try { if (typeof window.hcPushAndWait === 'function') await hcPushAndWait(); } catch (_) {}
    const r = await v16Api('sms-notify', { method: 'POST', body: JSON.stringify({ kind: 'receipt', customerId: c.id, orderIds: [o.id] }) });
    const d = r.data || {};
    if (r.ok && d.sent) return toast(`Receipt for #${o.ticket || o.id} texted to ${c.name}`, true, 'checkcircle');
    const why = window.hcTexts && hcTexts.why ? hcTexts.why(r) : (d.error || d.skipped || 'not sent');
    if (!d.link) return toast(`Receipt not texted: ${why}`, false, 'alerttriangle');
    openPosModal(`<h3>Receipt link · #${E(o.ticket || o.id)}</h3><p class="pm-sub">Not texted: ${E(why)}. Copy the link and send it another way.</p>
      <input id="v39-link" class="text-input" readonly value="${E(d.link)}" onclick="this.select()">
      <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="(async()=>{const t=document.getElementById('v39-link');try{await navigator.clipboard.writeText(t.value)}catch(_){t.select()}toast('Link copied',true,'checkcircle')})()">Copy link</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Close</button>`);
  };
  function injectTicketButtons() {
    if (state.posNav !== 'customers' || !state.v7CustomerId) return;
    const content = document.getElementById('pos-content'); if (!content) return;
    content.querySelectorAll('button[onclick^="posPrintReceipt("]').forEach(btn => {
      const row = btn.parentElement; if (!row || row.querySelector('.v39-tbtn')) return;
      const id = (btn.getAttribute('onclick').match(/posPrintReceipt\('([^']+)'\)/) || [])[1];
      const o = id && state.orders.find(x => x.id === id); if (!o) return;
      let html = '';
      const hasPickup = [...row.querySelectorAll('button')].some(b => /pick\s*up/i.test(b.textContent));
      if (!CLOSED.includes(o.status) && o.fulfillment !== 'delivery' && o.channel !== 'delivery' && !hasPickup) html += `<button class="btn btn-primary btn-sm v39-tbtn" onclick="v39ProfilePickup('${E(o.id)}')">Pick Up</button>`;
      if (o.status !== 'voided') html += `<button class="btn btn-ghost btn-sm v39-tbtn" onclick="v39TextReceipt('${E(o.id)}')">📱 Text receipt</button>`;
      if (html) btn.insertAdjacentHTML('beforebegin', html); else btn.insertAdjacentHTML('afterend', '<span class="v39-tbtn" hidden></span>');
    });
  }
  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; try { injectTicketButtons(); } catch (e) { console.error('V39', e); } }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();


/* V41 — "Check Clover now" on the Payments screen: pulls voids / refunds done on the Clover
   machine or dashboard into the POS (this also runs automatically every 15 minutes). */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const isMgr = () => { try { return typeof v6IsManager === 'function' && v6IsManager(); } catch (_) { return false; } };
  window.v41CheckClover = async () => {
    const btn = document.getElementById('v41-check'); if (btn) { btn.disabled = true; btn.textContent = 'Checking Clover…'; }
    const r = await v16Api('clover-sync', { method: 'POST', body: JSON.stringify({ days: 30 }) });
    if (btn) { btn.disabled = false; btn.textContent = '↩️ Check Clover for voids / refunds'; }
    if (!r.ok) return toast(r.data?.error || 'Could not reach Clover', false, 'alerttriangle');
    const d = r.data, ticket = id => { const o = state.orders.find(x => x.id === id); return o ? '#' + (o.ticket || o.id) : id; };
    const rows = (d.results || []).filter(x => x.state && x.state !== 'ok' || x.error);
    openPosModal(`<h3>↩️ Clover check</h3><p class="pm-sub">Checked ${d.checked} card charge${d.checked === 1 ? '' : 's'} from the last 30 days · ${d.changed ? `<strong>${d.changed} updated in the POS</strong>` : 'nothing new'}.</p>
      ${rows.length ? `<div class="pos-table-wrap"><table class="pos-table"><thead><tr><th>Clover charge</th><th>Tickets</th><th>Clover says</th></tr></thead><tbody>${rows.map(x => `<tr><td>${E(x.chargeId)}</td><td>${E((x.orders || []).map(ticket).join(', '))}</td><td>${x.error ? `<span style="color:#b42318">${E(x.error)}</span>` : E(x.state + (x.refundedCents ? ' · $' + (x.refundedCents / 100).toFixed(2) : ''))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="helper-text">No voids or refunds found on Clover.</div>'}
      <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="closePosModal();renderPosContent()">Done</button>`);
  };
  function inject() {
    if (state.posNav !== 'payments' || !isMgr()) return;
    const content = document.getElementById('pos-content'); if (!content || content.querySelector('#v41-check')) return;
    content.insertAdjacentHTML('afterbegin', `<div class="v41-bar"><button id="v41-check" class="btn btn-secondary" onclick="v41CheckClover()">↩️ Check Clover for voids / refunds</button><span class="helper-text" style="margin:0">Voids and refunds done on the Clover machine or dashboard are pulled in automatically every 15 minutes — tickets go back to unpaid and you get a 🔔 alert.</span></div>`);
  }
  let q = false;
  const obs = new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(() => { q = false; try { inject(); } catch (_) {} }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  const css = document.createElement('style'); css.textContent = '.v41-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px}'; document.head.appendChild(css);
})();

/* V42 — Scheduled pickup slips print like the classic "Pick-Up Order" slip (day + window big,
   customer, address, apartment big, phone, memo) instead of a $0.00 cleaning ticket. */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const isPickupSlip = o => !!o && (o.pickupOnly === true || /scheduled customer pickup/i.test(String(o.items || '')) || (o.status === 'scheduled' && !(o.lineItems || []).length));
  const addrFor = o => {
    try { if (typeof v8AddressForOrder === 'function') { const a = v8AddressForOrder(o); if (a) return a; } } catch (_) {}
    const c = o.customerId && customerById(o.customerId);
    return (c && (c.addresses || []).find(a => a.id === o.address || a.id === o.addressId)) || (c && (c.addresses || [])[0]) || null;
  };
  const unitOf = a => String(a?.apartment || a?.unit || a?.apt || a?.line2 || '').replace(/^(?:apt\.?|apartment|unit|#)\s*/i, '').replace(/\s*\*+\s*$/, '').trim();
  const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
  function slipHTML(o) {
    const c = o.customerId ? customerById(o.customerId) : null, a = addrFor(o), unit = unitOf(a);
    const dayStr = String(o.dateLabel || o.pickupDate || o.scheduledDate || o.dueDate || '').slice(0, 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dayStr) ? new Date(dayStr + 'T12:00:00') : null;
    const weekday = d ? d.toLocaleDateString('en-US', { weekday: 'long' }) : 'Pickup';
    const dateTxt = d ? d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '';
    const win = o.window || o.pickupWindow || '';
    const driver = o.assignedDriverId && typeof driverById === 'function' ? (driverById(o.assignedDriverId)?.name || '') : '';
    const name = c ? String(c.name || '').toUpperCase() : String(o.customerName || '').toUpperCase();
    const street = a ? String(a.street || a.line1 || a.address1 || a.label || '').toUpperCase() : '';
    const memo = o.pickupNotes || (String(o.items || '').split(' · ').slice(1).join(' · ')) || '';
    const now = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '');
    return `<section class="v8-print-ticket v42-slip">
      ${unit ? `<div class="v28210-unit-hero">${E(unit.toUpperCase())}</div>` : ''}
      <div class="v11-store-name">Hattan Cleaners</div>
      <div class="v11-store-line">141 3RD AVENUE</div><div class="v11-store-line">BET. 14TH &amp; 15TH</div><div class="v11-store-line">212 477 1740</div>
      <div class="v42-stamp">${E(now)}</div>
      <div class="v42-title">Pick-Up Order</div>
      <div class="v42-num">${E(c?.customerNumber || '')}</div>
      <div class="v42-day">${E(weekday)}</div>
      <div class="v42-date">${E(dateTxt)}${win ? ' · ' + E(win) : ''}</div>
      <div class="v42-row"><span>From: ${E(c?.customerNumber || '')}</span><span>Route: ${E(driver)}</span></div>
      <div class="v42-name">${E(name)}</div>
      ${street ? `<div class="v42-addr">${E(street)}</div>` : ''}
      ${unit ? `<div class="v42-unit">#${E(unit.toUpperCase())}</div>` : ''}
      ${c?.phone ? `<div class="v42-phone">${E(fmtPhone(c.phone))}</div>` : ''}
      <div class="v42-memo">Memo: ${E(memo)}</div>
      ${o.dueDate ? `<div class="v42-ready">Ready: ${E(new Date(o.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: '2-digit' }))} 04:00 PM</div>` : ''}
      <div class="v42-id">${E(o.ticket || o.id)}</div>
    </section>`;
  }
  const prev = window.receiptTicketHTML;
  if (typeof prev === 'function') {
    // Apartment at the top: as big as fits (long ones like "PH-12B" shrink so they never get cut off).
    const fitUnit = html => String(html).replace(/<div class="v28210-unit-hero">([^<]*)<\/div>/, (m, t) => { const n = t.replace(/&[a-z#0-9]+;/gi, 'x').length; const px = n <= 3 ? 84 : n === 4 ? 72 : n === 5 ? 60 : n <= 7 ? 46 : 36; return `<div class="v28210-unit-hero" style="font-size:${px}px!important">${t}</div>`; });
    const wrapped = function (o) { return fitUnit(isPickupSlip(o) ? slipHTML(o) : prev.apply(this, arguments)); };
    window.receiptTicketHTML = wrapped;
    try { receiptTicketHTML = wrapped; } catch (_) {}
  }
})();

/* V43 — Customer profile: "Charge an amount" to the card on file (manager). For old tickets / old
   A/R balances and for testing card on file. The payment is applied to the oldest unpaid tickets
   first (like a check payment); anything you choose not to apply is kept as a plain account charge. */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const isMgr = () => { try { return typeof v6IsManager === 'function' && v6IsManager(); } catch (_) { return false; } };
  const card = c => (c && c.paymentMethods || []).find(p => p.processor === 'clover');
  const bal = o => (typeof v15OrderBalance === 'function' ? v15OrderBalance(o) : (o.paid ? 0 : Math.max(0, Number(o.total || 0) - Number(o.discount || 0))));
  const unpaid = c => state.orders.filter(o => o.customerId === c.id && o.status !== 'voided' && bal(o) > .004).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const r2 = n => Math.round(Number(n || 0) * 100) / 100;

  window.v43ChargeAmount = customerId => {
    const c = customerById(customerId), k = card(c); if (!c) return;
    if (!k) return toast('No Clover card on file for this customer', false, 'alerttriangle');
    const open = unpaid(c), total = r2(open.reduce((s, o) => s + bal(o), 0));
    openPosModal(`<h3>💳 Charge card on file · ${E(c.name)}</h3>
      <p class="pm-sub">${E(k.brand || 'Card')} •••• ${E(k.last4 || '')} · Open balance: <strong>${money(total)}</strong> on ${open.length} ticket${open.length === 1 ? '' : 's'}</p>
      <span class="field-label">Amount to charge</span>
      <input id="v43-amt" class="text-input" type="number" min="0.50" step="0.01" inputmode="decimal" value="${total > 0 ? total.toFixed(2) : ''}" placeholder="0.00" style="font-size:22px;margin-bottom:10px">
      ${open.length ? `<label class="v16-consent"><input id="v43-apply" type="checkbox" checked><span><strong>Apply to the open balance</strong><small>Pays the oldest unpaid tickets first: ${open.slice(0, 6).map(o => '#' + E(o.ticket || o.id) + ' ' + money(bal(o))).join(', ')}${open.length > 6 ? '…' : ''}</small></span></label>` : '<div class="helper-text">No open balance — this will be a plain account charge (good for a $1 test).</div>'}
      <span class="field-label" style="margin-top:10px">Note (optional)</span><input id="v43-note" class="text-input" maxlength="60" placeholder="e.g. Old A/R from September, or Test charge">
      <button class="btn btn-primary btn-block" id="v43-go" style="margin-top:12px" onclick="v43ConfirmCharge('${E(c.id)}')">Charge card</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
    setTimeout(() => document.getElementById('v43-amt')?.select(), 50);
  };

  window.v43ConfirmCharge = async customerId => {
    const c = customerById(customerId), k = card(c); if (!c || !k) return;
    const amount = r2(document.getElementById('v43-amt')?.value);
    const apply = !!document.getElementById('v43-apply')?.checked;
    const note = String(document.getElementById('v43-note')?.value || '').trim();
    const open = unpaid(c), total = r2(open.reduce((s, o) => s + bal(o), 0));
    if (!(amount >= 0.5)) return toast('Enter an amount of at least $0.50', false, 'alerttriangle');
    if (apply && amount > total + .004) return toast(`That's more than the open balance (${money(total)}). Lower the amount or untick "Apply to the open balance".`, false, 'alerttriangle');
    if (!window.confirm(`Charge ${money(amount)} to ${k.brand || 'card'} •••• ${k.last4 || ''} for ${c.name}?`)) return;
    const btn = document.getElementById('v43-go'); if (btn) { btn.disabled = true; btn.textContent = 'Charging…'; }
    const key = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const r = await v16Api('clover-charge-amount', { method: 'POST', body: JSON.stringify({ customerId: c.id, amount, note, idempotencyKey: key }) });
    if (!r.ok) { if (btn) { btn.disabled = false; btn.textContent = 'Charge card'; } return toast(`Not charged: ${r.data?.error || 'Clover error'}`, false, 'alerttriangle'); }
    const pay = r.data.payment || {}, now = new Date().toISOString(), by = (typeof v6CurrentStaff === 'function' && v6CurrentStaff()?.name) || 'Staff';
    const label = `Card on file •••• ${pay.last4 || k.last4 || ''}`;
    let left = amount; const applied = [];
    if (apply) {
      for (const o of open) {
        if (left <= .004) break;
        const due = bal(o), part = r2(Math.min(due, left));
        o.paymentHistory = o.paymentHistory || [];
        if (o.paymentHistory.some(h => h.processorId === pay.id)) continue;
        const paidSoFar = typeof v15PaidAmount === 'function' ? v15PaidAmount(o) : Number(o.amountPaid || 0);
        o.amountPaid = r2(paidSoFar + part);
        o.paid = bal(o) <= .004; o.paymentStatus = o.paid ? 'paid' : 'partial'; o.paymentMethod = label; if (o.paid) o.paidAt = now;
        o.paymentProcessor = 'clover'; o.cloverChargeId = o.cloverChargeId || pay.id;
        o.paymentHistory.unshift({ id: 'pay_' + key + '_' + o.id, type: 'card', amount: part, method: 'card', processor: 'clover', processorId: pay.id, last4: pay.last4 || k.last4, memo: note, at: now, by });
        if (typeof v8AddActivity === 'function') v8AddActivity(o, 'payment', `Card on file charged ${money(part)} (account payment${note ? ' · ' + note : ''})`);
        applied.push(`#${o.ticket || o.id} ${money(part)}`); left = r2(left - part);
      }
    }
    c.accountCharges = c.accountCharges || [];
    c.accountCharges.unshift({ id: key, at: now, amount, chargeId: pay.id, last4: pay.last4 || k.last4, note, appliedTo: applied, by });
    if (typeof recordSync === 'function') recordSync(`Card on file charged · ${c.name} · ${money(amount)}${applied.length ? ' · applied to ' + applied.join(', ') : ' · account charge'}`);
    if (typeof saveState === 'function') saveState();
    openPosModal(`<h3>✅ Charged ${money(amount)}</h3><p class="pm-sub">${E(pay.brand || k.brand || 'Card')} •••• ${E(pay.last4 || k.last4 || '')} · Clover payment ${E(pay.id || '')}</p>
      ${applied.length ? `<div>Applied to: ${applied.map(E).join(', ')}</div>` : '<div class="helper-text">Recorded as an account charge (not applied to a ticket).</div>'}
      <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="closePosModal();try{renderV7CustomerProfile()}catch(_){renderPosContent()}">Done</button>`);
  };

  function inject() {
    if (state.posNav !== 'customers' || !state.v7CustomerId || !isMgr()) return;
    const box = document.querySelector('#pos-content .v298-card'); if (!box || box.querySelector('.v43-btn')) return;
    const c = customerById(state.v7CustomerId); if (!card(c)) return;
    box.insertAdjacentHTML('beforeend', `<button class="btn btn-primary v43-btn" onclick="v43ChargeAmount('${E(c.id)}')">💳 Charge an amount</button>`);
  }
  let q = false;
  const obs = new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(() => { q = false; try { inject(); } catch (e) { console.error('V43', e); } }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
