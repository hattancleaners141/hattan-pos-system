/* Hattan Ops Suite V33 — Clover Flex: send the total to the card terminal
 *
 * "Charge on Clover Flex" (Pickup → Collect Payment, and the Simple Pay screen) sends the exact
 * card total to the Flex through Clover's cloud (Cloud Pay Display must be open on the Flex).
 * The customer taps / inserts / swipes; when Clover approves, the server checks the payment with
 * Clover and the tickets are marked paid automatically. Declines and cancels leave them unpaid.
 * Settings → Clover Flex: a manager connects the Flex once (Clover sign-in) and picks the device.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const SDK = 'https://cdn.jsdelivr.net/npm/remote-pay-cloud@4.1.2/dist/bundle/clover.js';
  const PENDING = 'hattan_flex_pending';
  const shared = () => { try { return typeof v16IsShared === 'function' && v16IsShared(); } catch (_) { return false; } };
  const isManager = () => { try { return typeof v6IsManager === 'function' ? v6IsManager() : false; } catch (_) { return false; } };
  const F = window.hcFlex = { status: null, busy: false };

  // Same amount rule as the server (and the card-on-file charge).
  const centsFor = o => { const base = Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0))); const fee = o.pricing === 'card-price-v299' ? 0 : r2(base * 0.03); return Math.round((base + fee) * 100); };
  F.cardTotal = orders => orders.filter(o => o && !o.paid).reduce((s, o) => s + centsFor(o), 0) / 100;
  F.ready = () => !!(shared() && F.status && F.status.configured && F.status.connected && F.status.device);

  async function loadStatus(devices) {
    if (!shared()) return null;
    const r = await v16Api('clover-device' + (devices ? '?devices=1' : ''));
    if (r.ok) F.status = r.data;
    return F.status;
  }
  F.refresh = loadStatus;

  function loadSdk() {
    if (window.clover && window.clover.CloverConnectorFactoryBuilder) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = SDK; s.onload = res; s.onerror = () => rej(new Error('Could not load the Clover connector — check the internet connection')); document.head.appendChild(s); });
  }

  /* ---------------- payment modal ---------------- */
  function modal(title, body, buttons) {
    openPosModal(`<h3>${icon('creditcard', 18)} ${E(title)}</h3><div class="v33-flex-body">${body}</div><div class="v33-flex-btns">${buttons || ''}</div>`);
  }
  const waitHTML = (amount, line) => `<div class="v33-flex-amount">${money(amount)}</div><div class="v33-flex-spinner"></div><p class="v33-flex-line">${E(line)}</p>`;

  function savePending(p) { try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch (_) {} }
  function clearPending() { try { localStorage.removeItem(PENDING); } catch (_) {} }
  function readPending() { try { return JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch (_) { return null; } }

  // Mark the tickets paid in the POS after the server confirmed the payment with Clover.
  function applyPaid(lines, pay) {
    const now = new Date().toISOString();
    const done = [];
    lines.forEach(l => {
      const o = (state.orders || []).find(x => x.id === l.orderId); if (!o || o.paid) return;
      const base = Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
      const amount = r2(l.cents / 100);
      if (window.hcPricing && hcPricing.cardPriced(o)) hcPricing.applyPayment(o, 'card');
      Object.assign(o, { paid: true, paymentStatus: 'paid', paymentProcessor: 'clover-flex', cloverFlexPaymentId: pay.paymentId, surcharge: r2(Math.max(0, amount - base)),
        amountCharged: amount, amountPaid: amount, paymentMethod: `Clover Flex${pay.brand ? ' ' + pay.brand : ''}${pay.last4 ? ' •' + pay.last4 : ''}`, paidAt: now });
      delete o.paymentError;
      if (o.customerId && !o.pointsAwarded) { const c = customerById(o.customerId); if (c) { c.points = (c.points || 0) + Math.round(base); o.pointsAwarded = true; } }
      try { v8AddActivity(o, 'payment', `Paid on Clover Flex · ${money(amount)}${pay.last4 ? ' · •' + pay.last4 : ''}`, { cloverPaymentId: pay.paymentId }); } catch (_) {}
      done.push(o);
    });
    try { recordSync(`Clover Flex payment · ${done.map(o => '#' + (o.ticket || o.id)).join(', ')} · ${pay.paymentId}`); } catch (_) {}
    if (typeof saveState === 'function') saveState();
    return done;
  }

  async function record(p) {
    const r = await v16Api('clover-device', { method: 'POST', body: JSON.stringify({ action: 'record', attemptId: p.attemptId, paymentId: p.paymentId }) });
    if (!r.ok) return { ok: false, error: r.data?.error || 'Could not save the payment' };
    clearPending();
    applyPaid(p.lines, r.data);
    return { ok: true, pay: r.data };
  }

  /* ---------------- main entry: charge these tickets on the Flex ---------------- */
  F.charge = async function (orderIds, onPaid) {
    if (F.busy) return;
    if (!F.ready()) { await loadStatus(); if (!F.ready()) return toast('Connect the Clover Flex first (Settings → Clover Flex)', false, 'alerttriangle'); }
    const pending = readPending();
    if (pending) return resumePending(pending);
    F.busy = true;
    let connector = null, attempt = null, finished = false, timer = null;
    const cleanup = () => { clearTimeout(timer); try { connector && connector.dispose(); } catch (_) {} connector = null; F.busy = false; };
    const fail = async (msg, retry) => {
      if (finished) return; finished = true;
      if (attempt) await v16Api('clover-device', { method: 'POST', body: JSON.stringify({ action: 'abort', attemptId: attempt.attemptId, reason: msg }) }).catch(() => {});
      cleanup();
      modal('Not charged', `<div class="v33-flex-bad">${E(msg)}</div><p class="helper-text">Nothing was charged. The ticket${orderIds.length === 1 ? ' is' : 's are'} still unpaid.</p>`,
        `${retry ? `<button class="btn btn-primary" id="v33-retry">Try again</button>` : ''}<button class="btn btn-ghost" onclick="closePosModal()">Close</button>`);
      const b = document.getElementById('v33-retry'); if (b) b.onclick = () => { closePosModal(); F.charge(orderIds, onPaid); };
    };
    try {
      modal('Clover Flex', waitHTML(F.cardTotal(orderIds.map(id => state.orders.find(o => o.id === id))), 'Getting the tickets ready…'), '');
      if (typeof window.hcPushAndWait === 'function') await hcPushAndWait();
      const b = await v16Api('clover-device', { method: 'POST', body: JSON.stringify({ action: 'begin', orderIds }) });
      if (!b.ok) { F.busy = false; return fail(b.data?.error || 'Could not start the Flex payment', false); }
      attempt = b.data;
      const amount = attempt.amountCents / 100;
      modal('Clover Flex', waitHTML(amount, 'Connecting to the Flex…'), `<button class="btn btn-ghost" id="v33-cancel">Cancel</button>`);
      document.getElementById('v33-cancel').onclick = () => { try { connector && connector.resetDevice(); } catch (_) {} fail('Cancelled at the counter', true); };
      await loadSdk();
      const C = window.clover, d = attempt.device;
      const cfgFactory = {}; cfgFactory[C.CloverConnectorFactoryBuilder.FACTORY_VERSION] = C.CloverConnectorFactoryBuilder.VERSION_12;
      const factory = C.CloverConnectorFactoryBuilder.createICloverConnectorFactory(cfgFactory);
      const cfg = new C.WebSocketCloudCloverDeviceConfigurationBuilder(d.raid, d.deviceId, d.merchantId, d.accessToken).setCloverServer(d.cloverServer).setFriendlyId(d.friendlyId || 'Hattan POS').setForceConnect(true).build();
      connector = factory.createICloverConnector(cfg);
      const line = t => { const el = document.querySelector('.v33-flex-line'); if (el) el.textContent = t; };
      const listener = Object.assign({}, C.remotepay.ICloverConnectorListener.prototype, {
        onDeviceReady: () => {
          if (finished) return;
          clearTimeout(timer);
          line('Customer: tap, insert or swipe the card on the Flex');
          const req = new C.remotepay.SaleRequest();
          req.setExternalId(String(attempt.attemptId).slice(0, 32));
          req.setAmount(attempt.amountCents);
          try { if (req.setTipMode && C.sdk.payments && C.sdk.payments.TipMode) req.setTipMode(C.sdk.payments.TipMode.NO_TIP); } catch (_) {}
          connector.sale(req);
        },
        onDeviceError: ev => { if (!finished) fail(`The Flex reported a problem: ${ev && ev.getMessage ? ev.getMessage() : 'device error'}`, true); },
        onDeviceDisconnected: () => { if (!finished) line('Reconnecting to the Flex…'); },
        onConfirmPaymentRequest: req => {
          // Clover asks before accepting a possible duplicate or offline payment.
          const ch = (req.getChallenges && req.getChallenges()) || [];
          for (const c of ch) { if (!window.confirm(`Clover Flex: ${c.getMessage ? c.getMessage() : 'Please confirm this payment'}\n\nAccept this payment?`)) { connector.rejectPayment(req.getPayment(), c); return; } }
          connector.acceptPayment(req.getPayment());
        },
        onVerifySignatureRequest: req => connector.acceptSignature(req),
        onSaleResponse: async res => {
          if (finished) return;
          if (!res.getSuccess()) return fail(res.getMessage && res.getMessage() ? res.getMessage() : `Card ${String(res.getReason ? res.getReason() : 'declined').toLowerCase().replace(/_/g, ' ')}`, true);
          finished = true; clearTimeout(timer);
          const p = { attemptId: attempt.attemptId, paymentId: res.getPayment().getId(), lines: attempt.lines, at: Date.now() };
          savePending(p);
          line('Approved — saving to the POS…');
          const rec = await record(p);
          cleanup();
          if (!rec.ok) return showPending(p, rec.error);
          modal('Paid on Clover Flex', `<div class="v33-flex-good">${icon('checkcircle', 22)} ${money(rec.pay.amountCents / 100)} approved${rec.pay.last4 ? ` · ${E(rec.pay.brand || 'Card')} •${E(rec.pay.last4)}` : ''}</div>`, `<button class="btn btn-primary" id="v33-done">Done</button>`);
          document.getElementById('v33-done').onclick = () => { closePosModal(); if (typeof onPaid === 'function') onPaid(rec.pay); else renderPosContent(); };
        },
      });
      connector.addCloverConnectorListener(listener);
      timer = setTimeout(() => fail('The Flex did not answer. Make sure it is on, connected to Wi-Fi, and Cloud Pay Display is open.', true), 45000);
      connector.initializeConnection();
    } catch (e) { fail(e.message || 'Flex payment failed', true); }
  };

  // Approved on the Flex but the POS could not save it yet (e.g. internet dropped) — never charge again.
  function showPending(p, err) {
    modal('Approved on the Flex — not saved yet', `<div class="v33-flex-bad">${E(err || 'The POS could not save the payment')}</div><p>The card <strong>was charged</strong> (Clover payment ${E(p.paymentId)}). Do not charge again — press Save to record it on the ticket${p.lines.length === 1 ? '' : 's'}.</p>`,
      `<button class="btn btn-primary" id="v33-save">Save payment</button><button class="btn btn-ghost" onclick="closePosModal()">Later</button>`);
    document.getElementById('v33-save').onclick = async () => { const r = await record(p); if (r.ok) { closePosModal(); toast('Flex payment saved', true, 'checkcircle'); renderPosContent(); } else showPending(p, r.error); };
  }
  function resumePending(p) { showPending(p, 'A Flex payment from earlier still needs to be saved'); }
  setTimeout(() => { const p = readPending(); if (p && shared()) record(p).then(r => { if (r.ok) { toast('An earlier Flex payment was saved', true, 'checkcircle'); try { renderPosContent(); } catch (_) {} } }); }, 8000);

  /* ---------------- buttons on the payment screens ---------------- */
  window.v33FlexPickup = () => {
    const ids = (typeof v14PickupSelectedOrders === 'function' ? v14PickupSelectedOrders() : []).filter(o => !o.paid).map(o => o.id);
    if (!ids.length) return;
    F.charge(ids, () => { try { v14CompletePickup('card'); } catch (_) { renderPosContent(); } });
  };
  window.v33FlexOne = id => F.charge([id], () => { try { if (typeof v13PayReset === 'function') v13PayReset(); else renderPosContent(); } catch (_) { renderPosContent(); } });

  function inject() {
    const content = document.getElementById('pos-content'); if (!content || !F.ready()) return;
    const choice = content.querySelector('.v14-pay-choice');
    if (choice && !choice.querySelector('.v33-flex-btn')) {
      const orders = (typeof v14PickupSelectedOrders === 'function' ? v14PickupSelectedOrders() : []);
      const total = F.cardTotal(orders);
      if (total > 0) choice.insertAdjacentHTML('afterbegin', `<button class="v13-giant-btn primary v33-flex-btn" onclick="v33FlexPickup()">${icon('creditcard', 20)} Charge on Clover Flex · ${money(total)}</button>`);
    }
    if (state.posNav === 'v13pay' && typeof v13PayOrderId !== 'undefined' && v13PayOrderId) {
      const o = state.orders.find(x => x.id === v13PayOrderId);
      const grid = content.querySelector('.v13-scan-card .v13-tile-grid');
      if (o && !o.paid && grid && !content.querySelector('.v33-flex-btn')) grid.insertAdjacentHTML('afterend', `<button class="v13-giant-btn primary v33-flex-btn" style="margin-top:10px" onclick="v33FlexOne('${E(o.id)}')">${icon('creditcard', 20)} Charge on Clover Flex · ${money(F.cardTotal([o]))}</button>`);
    }
    if (state.posNav === 'settings' && !content.querySelector('.v33-flex-settings')) content.insertAdjacentHTML('afterbegin', settingsCard());
    // Order "Checkout & Collect Payment" window
    const fin = document.querySelector('#pos-modal button[onclick^="posFinishCheckout("]');
    if (fin && !document.querySelector('#pos-modal .v33-flex-btn')) {
      const id = (/posFinishCheckout\('([^']+)'/.exec(fin.getAttribute('onclick')) || [])[1];
      const o = id && state.orders.find(x => x.id === id);
      if (o && !o.paid) {
        const cs = (typeof checkoutState !== 'undefined' && checkoutState) || {};
        fin.insertAdjacentHTML('beforebegin', cs.rewardId || cs.useCredit
          ? `<div class="helper-text v33-flex-btn" style="margin-bottom:8px">Clover Flex: remove the reward / store credit to charge on the Flex, or complete it here.</div>`
          : `<button class="btn btn-primary btn-block v33-flex-btn" style="margin-bottom:8px" onclick="v33FlexCheckout('${E(o.id)}')">${icon('creditcard', 17)} Charge on Clover Flex · ${money(F.cardTotal([o]))}</button>`);
      }
    }
  }
  window.v33FlexCheckout = id => F.charge([id], () => {
    const o = state.orders.find(x => x.id === id);
    if (o) { try { const st = getStages(o); o.stageIndex = st.length - 1; o.status = st[o.stageIndex].id; if (o.status === 'picked_up') o.pickedUpAt = o.pickedUpAt || new Date().toISOString(); } catch (_) {} if (typeof saveState === 'function') saveState(); }
    renderPosContent();
  });

  /* ---------------- Settings → Clover Flex ---------------- */
  function settingsCard() {
    const s = F.status;
    if (!shared()) return '';
    if (!s) return `<div class="pos-card v33-flex-settings"><h3 style="margin:0">${icon('creditcard', 17)} Clover Flex</h3><div class="helper-text">Checking…</div></div>`;
    const envTag = s.environment === 'production' ? '<span class="v33-tag live">LIVE</span>' : '<span class="v33-tag test">TEST (sandbox)</span>';
    let body;
    if (!s.configured) body = `<div class="helper-text">Add <strong>CLOVER_APP_SECRET</strong> in Netlify → Environment variables, then redeploy.</div>`;
    else if (!s.connected) body = `<div class="helper-text">Not connected. A manager signs in to Clover once; after that every counter can send totals to the Flex.</div>${isManager() ? `<a class="btn btn-primary" style="margin-top:10px" href="/.netlify/functions/clover-oauth?start=1">Connect Clover Flex</a>` : ''}`;
    else body = `<div class="row-sub">Connected${s.connectedBy ? ' by ' + E(s.connectedBy) : ''} · merchant ${E(s.merchantId)}</div>
      <div style="margin-top:8px">${s.device ? `Device: <strong>${E(s.device.name)}</strong> · ${E(s.device.serial || '')}` : '<strong style="color:#b54708">Choose the device</strong>'}</div>
      ${isManager() ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><select id="v33-dev" class="text-input" style="flex:1;min-width:200px"><option value="">${(s.devices || []).length ? 'Choose a device…' : 'Load devices…'}</option>${(s.devices || []).map(d => `<option value="${E(d.id)}" ${s.device && s.device.id === d.id ? 'selected' : ''}>${E(d.name)} · ${E(d.model)} · ${E(d.serial)}</option>`).join('')}</select>
        <button class="btn btn-secondary" onclick="v33FlexDevices()">Refresh list</button><button class="btn btn-primary" onclick="v33FlexSelect()">Use this device</button>
        <a class="btn btn-ghost" href="/.netlify/functions/clover-oauth?start=1">Reconnect</a><button class="btn btn-ghost" style="color:#b42318" onclick="v33FlexDisconnect()">Disconnect</button></div>` : ''}
      <div class="helper-text" style="margin-top:8px">On the Flex, keep the <strong>Cloud Pay Display</strong> app open while taking payments.</div>`;
    return `<div class="pos-card v33-flex-settings"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0">${icon('creditcard', 17)} Clover Flex</h3>${envTag}</div>${body}</div>`;
  }
  const rerenderSettings = () => { const el = document.querySelector('.v33-flex-settings'); if (el) el.outerHTML = settingsCard(); };
  window.v33FlexDevices = async () => { await loadStatus(true); rerenderSettings(); };
  window.v33FlexSelect = async () => {
    const id = document.getElementById('v33-dev')?.value; if (!id) return toast('Choose a device', false, 'alerttriangle');
    const r = await v16Api('clover-device', { method: 'POST', body: JSON.stringify({ action: 'select', deviceId: id }) });
    if (!r.ok) return toast(r.data?.error || 'Could not save', false, 'alerttriangle');
    toast('Clover device saved', true, 'checkcircle'); await loadStatus(true); rerenderSettings();
  };
  window.v33FlexDisconnect = async () => {
    if (!window.confirm('Disconnect the Clover Flex from the POS?')) return;
    await v16Api('clover-device', { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) });
    await loadStatus(); rerenderSettings();
  };

  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; try { inject(); } catch (e) { console.error('V33 flex', e); } }); } });
  const start = () => { obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // Status after sign-in, then every 5 minutes (managers also get the device list on Settings).
  let tries = 0;
  const boot = setInterval(async () => { tries++; if (shared() && typeof v16Live !== 'undefined' && v16Live.authenticated) { clearInterval(boot); await loadStatus(isManager()); try { inject(); rerenderSettings(); } catch (_) {} } else if (tries > 60) clearInterval(boot); }, 1000);
  setInterval(() => { if (shared()) loadStatus(state.posNav === 'settings' && isManager()).then(() => { if (state.posNav === 'settings') rerenderSettings(); }); }, 300000);
})();
