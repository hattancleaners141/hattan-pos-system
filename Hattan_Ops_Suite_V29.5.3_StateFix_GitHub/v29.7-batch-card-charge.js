/* Hattan Ops Suite V29.7 — Daily batch card-on-file charge
 *
 * Payments screen: one button charges every unpaid ticket whose customer has a Clover card
 * on file, for either
 *   - Today: tickets written today (New York time), or
 *   - Up to today: every unpaid ticket through today, to catch days the batch was missed.
 * Staff can untick any ticket before charging. Charging reuses the existing secure path
 * (v16 → netlify/functions/clover-charge): the server re-reads the ticket, re-checks the
 * amount (ticket + 3% card fee), refuses tickets already paid or already charged, and uses an
 * idempotency key per ticket, so pressing the button twice cannot double-charge.
 * Declined tickets stay unpaid and show the reason; they reappear in the next run.
 * Not included: CleanBase-era tickets and CleanBase balance-forward lines.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const OLD_DAYS = 30;
  const B = window.HATTAN_BATCH = window.HATTAN_BATCH || { mode: 'today', skip: new Set(), lastRun: null };

  const nyDay = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
  const today = () => nyDay(Date.now());
  const base = o => Math.max(0, Math.round((Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)) * 100) / 100);
  const fee = o => (window.hcPricing ? hcPricing.cardFee(o, base(o)) : Math.round(base(o) * 0.03 * 100) / 100);
  const cardFor = c => (typeof v2CardForCustomer === 'function' ? v2CardForCustomer(c) : null);
  const isManager = () => (typeof v6IsManager === 'function' ? v6IsManager() : true);
  const env = () => { try { return (window.v16Live && v16Live.config && v16Live.config.clover && v16Live.config.clover.environment) || ''; } catch (_) { return ''; } };
  const live = () => { try { return typeof v16IsShared === 'function' && v16IsShared() && typeof v16CloverReady === 'function' && v16CloverReady(); } catch (_) { return false; } };

  function candidates(mode) {
    const t = today();
    return (state.orders || []).filter(o => {
      if (!o || o.paid || o.paymentStatus === 'paid' || o.legacy || o.__v294Loaded) return false;
      if (['voided', 'cancelled', 'canceled', 'void'].includes(String(o.status || '').toLowerCase())) return false;
      if (!o.customerId || base(o) <= 0) return false;
      const d = nyDay(o.createdAt); if (!d) return false;
      if (mode === 'today' ? d !== t : d > t) return false;
      return !!cardFor(customerById(o.customerId));
    }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  const selected = mode => candidates(mode).filter(o => !B.skip.has(o.id));

  // The existing (v16) Charge All reads this list — point it at the tickets ticked on screen.
  window.v2EligibleAutopayOrders = () => selected(B.mode);

  function panel() {
    const list = candidates(B.mode), sel = list.filter(o => !B.skip.has(o.id));
    const byCust = new Map();
    list.forEach(o => { if (!byCust.has(o.customerId)) byCust.set(o.customerId, []); byCust.get(o.customerId).push(o); });
    const total = sel.reduce((s, o) => s + base(o) + fee(o), 0);
    const oldCut = Date.now() - OLD_DAYS * 864e5;
    const oldCount = sel.filter(o => Date.parse(o.createdAt) < oldCut).length;
    const failed = (state.orders || []).filter(o => !o.paid && o.paymentError && !o.legacy);
    const e = env(), tag = live() ? (e === 'production' ? '<span style="background:#b42318;color:#fff;padding:2px 8px;border-radius:10px">LIVE CARDS</span>' : '<span style="background:#b54708;color:#fff;padding:2px 8px;border-radius:10px">SANDBOX — test cards only</span>') : '<span style="background:#667085;color:#fff;padding:2px 8px;border-radius:10px">Demo mode — no real charge</span>';
    const btn = (on, v, l) => `<button class="btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}" onclick="v297Mode('${v}')">${l}</button>`;
    const rows = [...byCust.entries()].map(([cid, os]) => {
      const c = customerById(cid) || {}, card = cardFor(c) || {};
      const cSel = os.filter(o => !B.skip.has(o.id));
      const cTot = cSel.reduce((s, o) => s + base(o) + fee(o), 0);
      return `<tr style="background:#f8f7f3"><td colspan="5"><strong>${E(c.name || 'Customer')}</strong> <span class="row-sub">${E(card.brand || 'Card')} •••• ${E(card.last4 || '')} · ${cSel.length} ticket${cSel.length === 1 ? '' : 's'}</span></td><td style="text-align:right"><strong>${money(cTot)}</strong></td></tr>` +
        os.map(o => {
          const old = Date.parse(o.createdAt) < oldCut;
          return `<tr><td style="width:36px"><input type="checkbox" ${B.skip.has(o.id) ? '' : 'checked'} onchange="v297Toggle('${E(o.id)}',this.checked)"></td>
          <td>#${E(o.ticket || o.id)}</td><td>${E(new Date(o.createdAt).toLocaleDateString())}${old ? ` <span style="color:#b42318;font-weight:600">· ${Math.floor((Date.now() - Date.parse(o.createdAt)) / 864e5)} days old</span>` : ''}</td>
          <td>${E(String(o.items || '').slice(0, 60))}</td><td style="text-align:right">${money(base(o))}${fee(o) > 0.004 ? ` + ${money(fee(o))} (old ticket)` : ''}</td><td style="text-align:right">${money(base(o) + fee(o))}</td></tr>`;
        }).join('');
    }).join('');
    const last = B.lastRun ? `<div class="helper-text" style="margin-top:8px">Last run ${E(new Date(B.lastRun.at).toLocaleTimeString())}: ${B.lastRun.charged} charged${B.lastRun.failed ? `, <strong style="color:#b42318">${B.lastRun.failed} declined/failed</strong>` : ''}.</div>` : '';
    return `<div class="pos-card v297-batch" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Batch charge cards on file</h3>${tag}<span style="flex:1"></span>
        ${btn(B.mode === 'today', 'today', `Today (${candidates('today').length})`)}${btn(B.mode === 'all', 'all', `All unpaid up to today (${candidates('all').length})`)}</div>
      <div class="helper-text" style="margin:6px 0 10px">Unpaid tickets for customers with a Clover card on file${B.mode === 'today' ? ', written today' : ', written on or before today'}. Untick anything you don't want charged. Each ticket is charged separately at the ticket's card price. Already-paid or already-charged tickets are never charged again.</div>
      ${oldCount ? `<div class="warn-banner" style="margin-bottom:10px"><span><strong>${oldCount} ticket${oldCount === 1 ? ' is' : 's are'} over ${OLD_DAYS} days old.</strong> Make sure those customers expect this charge, or untick them.</span></div>` : ''}
      ${list.length ? `<div class="pos-table-wrap"><table class="pos-table"><thead><tr><th></th><th>Ticket</th><th>Written</th><th>Items</th><th style="text-align:right">Amount</th><th style="text-align:right">Charge</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="helper-text" style="padding:10px 0">${B.mode === 'today' ? 'No unpaid card-on-file tickets from today.' : 'No unpaid card-on-file tickets.'}</div>`}
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" ${sel.length && isManager() ? '' : 'disabled'} onclick="v297Run()">Charge ${sel.length} ticket${sel.length === 1 ? '' : 's'} · ${money(total)}</button>
        ${isManager() ? '' : '<span class="helper-text">Manager sign-in required to run the batch.</span>'}
        ${list.length && sel.length !== list.length ? `<button class="btn btn-secondary btn-sm" onclick="v297All(true)">Tick all</button>` : ''}${sel.length ? `<button class="btn btn-secondary btn-sm" onclick="v297All(false)">Untick all</button>` : ''}
      </div>${last}
      ${failed.length ? `<div style="margin-top:12px"><strong style="color:#b42318">Declined / failed — still unpaid</strong><table class="pos-table" style="margin-top:6px"><tbody>${failed.map(o => { const c = customerById(o.customerId) || {}; return `<tr><td>${E(c.name || '')}</td><td>#${E(o.ticket || o.id)}</td><td>${money(base(o) + fee(o))}</td><td style="color:#b42318">${E(o.paymentError)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    </div>`;
  }

  function wrapPayments() {
    const cur = window.renderPosPayments;
    if (typeof cur !== 'function' || cur.__v297) return;
    const w = function (content) {
      const r = cur.apply(this, arguments);
      try {
        // hide the old one-line "Charge All Eligible" control; this panel replaces it
        content.querySelectorAll('button[onclick^="v2ChargeAll"]').forEach(b => { b.style.display = 'none'; });
        content.insertAdjacentHTML('afterbegin', panel());
      } catch (e) { console.error('V29.7 batch panel:', e); }
      return r;
    };
    w.__v297 = true;
    window.renderPosPayments = w;
    try { renderPosPayments = w; } catch (_) {}
  }
  const refresh = () => { if (state.posNav === 'payments') renderPosContent(); };
  window.v297Mode = m => { B.mode = m === 'all' ? 'all' : 'today'; refresh(); };
  window.v297Toggle = (id, on) => { if (on) B.skip.delete(id); else B.skip.add(id); refresh(); };
  window.v297All = on => { candidates(B.mode).forEach(o => on ? B.skip.delete(o.id) : B.skip.add(o.id)); refresh(); };
  let running = false;
  window.v297Run = async function () {
    if (running) return;
    if (!isManager()) return toast('Manager sign-in required', false, 'alerttriangle');
    const sel = selected(B.mode); if (!sel.length) return;
    if (!live() && !confirm(`Demo mode: Clover is not connected, so these ${sel.length} tickets will only be marked paid in the POS — no card is charged. Continue?`)) return;
    running = true;
    sel.forEach(o => { delete o.paymentError; });
    try { if (live() && typeof window.hcPushAndWait === 'function') await hcPushAndWait(); await v2ChargeAll(); }
    finally {
      running = false;
      const charged = sel.filter(o => o.paid).length, failed = sel.filter(o => !o.paid && o.paymentError).length;
      if (charged + failed) B.lastRun = { at: Date.now(), charged, failed };
      if (typeof saveState === 'function') saveState();
      refresh();
    }
  };

  wrapPayments();
  let n = 0; const g = setInterval(() => { wrapPayments(); if (++n > 100) clearInterval(g); }, 100);
})();
