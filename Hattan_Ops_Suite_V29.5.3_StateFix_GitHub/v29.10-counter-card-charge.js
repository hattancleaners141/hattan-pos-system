/* Hattan Ops Suite V29.10 — Drop Off "Pay Now · Card on file" really charges Clover
 *
 * Before: choosing Pay Now → Card at Drop Off only marked the tickets paid in the POS; no
 * card was charged. Now, when Clover is connected:
 *   1. the tickets are created UNPAID,
 *   2. synced to the store server and confirmed there,
 *   3. each ticket is charged through the existing secure clover-charge function,
 *   4. a result window shows "Charge successful" (Print Ticket / Close) or
 *      "Charge unsuccessful" with the reason (Try Again / Leave Unpaid — Pay at Pickup /
 *      Print Ticket).
 * Cash, check, and "pay later" are unchanged. Without Clover (demo) the old behavior stays.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const live = () => { try { return typeof v16IsShared === 'function' && v16IsShared() && typeof v16CloverReady === 'function' && v16CloverReady(); } catch (_) { return false; } };
  const cardOf = c => (c && c.paymentMethods || []).find(p => p.processor === 'clover') || (c && c.paymentMethods || []).find(p => p.default) || (c && c.paymentMethods || [])[0] || null;
  const baseDue = o => Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
  const feeFor = (o, b) => (window.hcPricing ? hcPricing.cardFee(o, b) : r2(b * 0.03));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Make sure the server has the latest tickets before charging (it re-reads them).
  async function pushAndWait() {
    if (typeof v16PushState !== 'function') return;
    for (let i = 0; i < 3; i++) {
      await v16PushState();
      let t = 0;
      while (window.v16Live && v16Live.syncing && t < 100) { await sleep(100); t++; }
      if (!(window.v16Live && v16Live.queued)) return;
    }
  }
  window.hcPushAndWait = pushAndWait;

  async function chargeOrders(orders, customer) {
    const card = cardOf(customer), results = [];
    await pushAndWait();
    for (const o of orders) {
      if (o.paid) { results.push({ o, ok: true, already: true }); continue; }
      const base = baseDue(o), fee = feeFor(o, base), amount = r2(base + fee);
      if (amount <= 0) { o.paid = true; o.paymentMethod = o.paymentMethod || 'store credit'; results.push({ o, ok: true, amount: 0 }); continue; }
      o.cloverIdempotencyKey = o.cloverIdempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
      let resp;
      try {
        resp = await v16Api('clover-charge', { method: 'POST', body: JSON.stringify({
          orderId: o.id, ticket: o.ticket || o.id, customerId: customer.id, email: customer.email || '',
          amount, idempotencyKey: o.cloverIdempotencyKey, cardholderPresent: false,
        }) });
      } catch (e) { resp = { ok: false, data: { error: e.message || 'Network error' } }; }
      if (!resp || !resp.ok) {
        o.paymentError = (resp && resp.data && resp.data.error) || 'Charge failed';
        results.push({ o, ok: false, amount, error: o.paymentError });
        try { recordSync(`Clover charge failed at drop-off · ${o.id} · ${o.paymentError}`); } catch (_) {}
        continue;
      }
      const pay = resp.data.payment || {};
      Object.assign(o, { cloverChargeId: pay.id, paymentProcessor: 'clover', paymentStatus: 'paid', surcharge: fee, amountCharged: amount, amountPaid: amount,
        paymentMethod: `Clover card on file •${pay.last4 || (card && card.last4) || ''}`, paid: true, paidAt: new Date().toISOString() });
      delete o.paymentError;
      try { recordSync(`Clover charge succeeded at drop-off · ${o.id} · ${money(amount)} · ${pay.id}`); } catch (_) {}
      results.push({ o, ok: true, amount, last4: pay.last4 || (card && card.last4), brand: pay.brand || (card && card.brand) });
    }
    if (typeof saveState === 'function') saveState();
    pushAndWait().catch(() => {});
    return results;
  }

  function printOrders(ids) {
    const orders = ids.map(id => state.orders.find(o => o.id === id)).filter(Boolean);
    try { closePosModal(); } catch (_) {}
    if (typeof window.v8PrintOrders === 'function') window.v8PrintOrders(orders, 'Drop-off ticket');
    else if (typeof window.posDoPrint === 'function') orders.forEach(o => posDoPrint(o.id));
  }
  window.v2910Print = ids => printOrders(String(ids).split(','));
  window.v2910LeaveUnpaid = ids => {
    String(ids).split(',').forEach(id => { const o = state.orders.find(x => x.id === id); if (o && !o.paid) { delete o.paymentError; o.paymentMethod = ''; } });
    if (typeof saveState === 'function') saveState();
    showResult(String(ids).split(','), null, true);
  };
  window.v2910Retry = async ids => {
    const list = String(ids).split(',').map(id => state.orders.find(o => o.id === id)).filter(Boolean);
    const cust = list[0] && customerById(list[0].customerId);
    if (!cust) return;
    showCharging(list, cust);
    const res = await chargeOrders(list.filter(o => !o.paid), cust);
    showResult(list.map(o => o.id), res);
  };

  function showCharging(orders, cust) {
    const card = cardOf(cust), total = orders.reduce((s, o) => s + baseDue(o) + feeFor(o, baseDue(o)), 0);
    openPosModal(`<div style="text-align:center;padding:18px 6px"><div style="font-size:42px">💳</div><h3 style="margin:8px 0">Charging ${E(card ? (card.brand || 'card') + ' •••• ' + (card.last4 || '') : 'card on file')}…</h3><p class="pm-sub">${money(total)} · ${orders.length} ticket${orders.length === 1 ? '' : 's'} — please wait, don't close this window.</p></div>`);
  }
  function showResult(ids, results, leftUnpaid) {
    const orders = ids.map(id => state.orders.find(o => o.id === id)).filter(Boolean);
    const failed = orders.filter(o => !o.paid), paidAmt = (results || []).filter(r => r.ok).reduce((s, r) => s + (r.amount || 0), 0);
    const list = orders.map(o => `<div class="v5-subticket"><strong>#${E(o.ticket || o.id)}</strong> · ${money(baseDue(o) + (o.paid ? 0 : feeFor(o, baseDue(o))))}<div class="row-sub">${o.paid ? '✓ Paid' : (o.paymentError ? '✕ ' + E(o.paymentError) : 'Unpaid — pay at pickup')}</div></div>`).join('');
    const idStr = E(ids.join(','));
    let head;
    if (leftUnpaid) head = `<div style="font-size:40px">🧾</div><h3>Tickets saved — pay at pickup</h3><p class="pm-sub">No card was charged.</p>`;
    else if (!failed.length) {
      const r = (results || []).find(x => x.last4);
      head = `<div style="font-size:44px;color:#1f6f43">✓</div><h3 style="color:#1f6f43">Charge successful</h3><p class="pm-sub">${money(paidAmt)} charged${r ? ` to ${E(r.brand || 'card')} •••• ${E(r.last4)}` : ''}.</p>`;
    } else head = `<div style="font-size:44px;color:#b42318">✕</div><h3 style="color:#b42318">Charge unsuccessful</h3><p class="pm-sub">${E(failed[0].paymentError || 'The card was not charged.')}</p>`;
    const buttons = (!failed.length || leftUnpaid)
      ? `<button class="btn btn-primary btn-block" onclick="v2910Print('${idStr}')">🖨 Print Ticket${orders.length === 1 ? '' : 's'}</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal();renderPosContent()">Close</button>`
      : `<button class="btn btn-primary btn-block" onclick="v2910Retry('${idStr}')">Try Again</button><button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="v2910LeaveUnpaid('${idStr}')">Leave Unpaid — Pay at Pickup</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="v2910Print('${idStr}')">🖨 Print Ticket${orders.length === 1 ? '' : 's'}</button>`;
    openPosModal(`<div style="text-align:center;padding:10px 4px">${head}</div>${list}<div style="margin-top:12px">${buttons}</div>`);
  }

  function wrapComplete() {
    const cur = window.posCompleteDropOff;
    if (typeof cur !== 'function' || (cur.__hcTags && cur.__hcTags.has('v2910'))) return;
    const w = function () {
      const d = (typeof counterDraft !== 'undefined') ? counterDraft : null;
      const wantsCard = !!(d && d.payNow && /card/.test(String(d.paymentMethod || '')));
      const cust = d && d.customerId ? customerById(d.customerId) : null;
      if (!wantsCard || !live() || !cust || !cardOf(cust)) return cur.apply(this, arguments);
      const before = new Set((state.orders || []).map(o => o.id));
      const res = cur.apply(this, arguments);
      const made = (state.orders || []).filter(o => !before.has(o.id));
      if (!made.length) return res;
      // Created as "paid" by the older counter code — undo until Clover confirms.
      made.forEach(o => { Object.assign(o, { paid: false, paymentMethod: '', amountCharged: null, amountPaid: Number(o.storeCreditApplied || 0) || 0, paymentStatus: 'charging', surcharge: 0 }); if (o.cashDiscount) { o.discount = r2(Number(o.discount || 0) - o.cashDiscount); o.cashDiscount = 0; } });
      if (typeof saveState === 'function') saveState();
      showCharging(made, cust);
      chargeOrders(made, cust).then(results => { made.forEach(o => { if (o.paymentStatus === 'charging') o.paymentStatus = o.paid ? 'paid' : 'unpaid'; }); if (typeof saveState === 'function') saveState(); showResult(made.map(o => o.id), results); try { renderPosContent(); } catch (_) {} })
        .catch(e => { made.forEach(o => { o.paymentError = e.message || 'Charge failed'; if (o.paymentStatus === 'charging') o.paymentStatus = 'unpaid'; }); showResult(made.map(o => o.id), []); });
      return res;
    };
    w.__v2910 = true; w.__hcTags = new Set([...(cur.__hcTags || []), 'v2910']); window.posCompleteDropOff = w; try { posCompleteDropOff = w; } catch (_) {}
  }
  const install = () => wrapComplete();
  install();
  let n = 0; const g = setInterval(() => { install(); if (++n > 100) clearInterval(g); }, 100);
})();
