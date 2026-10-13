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
  window.v39Reprint = () => {
    const orders = lastPrintedOrders();
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

