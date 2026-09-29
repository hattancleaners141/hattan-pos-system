/* Hattan Ops Suite V29.9 — Card price + 3% cash discount
 *
 * NY GBL §518-friendly pricing: the price shown in the POS and on tickets is the card
 * price. Cash and check payments get a 3% cash discount. Cards pay the shown price with
 * no fee added.
 *
 * - The catalog (garments, alterations, W&F…) stays the CASH price list.
 *   Card price = cash price ÷ 0.97, rounded to the cent, per line.
 * - Tickets created from now on carry `pricing: 'card-price-v299'`, `total` = card price and
 *   `cashPrice` = the cash price. Paying cash/check applies `cashDiscount`
 *   (added into `discount`) so the customer pays exactly the cash price.
 * - Tickets created before this version keep the old rule (3% added on card).
 *
 * Other scripts call the helpers below (window.hcPricing) at payment time.
 */
(function () {
  'use strict';
  const MODEL = 'card-price-v299';
  const RATE = 0.03;
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const card = cash => r2(Number(cash || 0) / (1 - RATE));
  const isCash = m => /cash|check/i.test(String(m || ''));
  const isCard = m => /card|clover/i.test(String(m || ''));

  const P = window.hcPricing = {
    MODEL, RATE,
    cardPriced: o => !!(o && o.pricing === MODEL),
    cardFromCash: card,
    // Old tickets: 3% added to card payments. New tickets: never.
    cardFee: (o, base) => (P.cardPriced(o) ? 0 : r2(Math.max(0, Number(base) || 0) * RATE)),
    // New tickets paid by cash/check: discount that brings `base` (card-priced amount due) to cash.
    cashDiscount: (o, base) => {
      if (!P.cardPriced(o)) return 0;
      const b = Math.max(0, Number(base) || 0);
      const ratio = Number(o.total) > 0 && o.cashPrice != null ? Number(o.cashPrice) / Number(o.total) : (1 - RATE);
      return r2(b - b * ratio);
    },
    // Record a payment on a ticket consistently (used after any payment flow).
    applyPayment: (o, method) => {
      if (!P.cardPriced(o)) return o;
      o.surcharge = 0;
      if (isCash(method) && !o.cashDiscount) {
        const due = Math.max(0, Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0));
        const d = P.cashDiscount(o, due);
        o.cashDiscount = d; o.discount = r2(Number(o.discount || 0) + d);
      }
      if (isCard(method) && o.cashDiscount) { o.discount = r2(Number(o.discount || 0) - o.cashDiscount); o.cashDiscount = 0; }
      const paidNow = Math.max(0, r2(Number(o.total || 0) - Number(o.discount || 0) - Number(o.storeCreditApplied || 0)));
      if (o.paid) { o.amountCharged = paidNow; o.amountPaid = r2(paidNow + Number(o.storeCreditApplied || 0) * 0); }
      return o;
    },
    isCash, isCard,
  };

  /* ---------- Drop Off: show and create card prices ---------- */
  const inDraft = line => { try { return !!(counterDraft && Array.isArray(counterDraft.items) && counterDraft.items.includes(line)); } catch (_) { return false; } };
  function wrapLineTotal() {
    if (typeof v17LineTotal !== 'function' || v17LineTotal.__v299) return;
    const base = v17LineTotal;
    const w = function (line) {
      const cashTotal = base.apply(this, arguments);
      return line && (line.cardPrice === true || inDraft(line)) ? card(cashTotal) : cashTotal;
    };
    w.__v299 = true; w.cash = base;
    try { v17LineTotal = w; } catch (_) {} window.v17LineTotal = w;
  }
  const cashLine = line => (v17LineTotal && v17LineTotal.cash ? v17LineTotal.cash(line) : Number(line.unitPrice || 0) * Number(line.qty || 0));
  P.draftCashTotal = () => {
    try { return r2((counterDraft.items || []).reduce((s, l) => s + cashLine(l), 0) + ((counterDraft.tags || []).includes('rush') ? 10 : 0)); } catch (_) { return 0; }
  };
  P.draftCardTotal = () => {
    try { return r2((counterDraft.items || []).reduce((s, l) => s + card(cashLine(l)), 0) + ((counterDraft.tags || []).includes('rush') ? card(10) : 0)); } catch (_) { return 0; }
  };
  function wrapTicketTotal() {
    if (typeof posTicketTotal !== 'function' || posTicketTotal.__v299) return;
    const w = function () { return P.draftCardTotal(); };
    w.__v299 = true;
    try { posTicketTotal = w; } catch (_) {} window.posTicketTotal = w;
  }
  function wrapComplete() {
    const cur = window.posCompleteDropOff;
    if (typeof cur !== 'function' || (cur.__hcTags && cur.__hcTags.has('v299'))) return;
    const w = function () {
      const before = new Set((state.orders || []).map(o => o.id));
      const draftLines = (counterDraft && counterDraft.items || []).slice();
      const cashByLine = new Map(draftLines.map(l => [l, cashLine(l)]));
      const wasPay = !!(counterDraft && counterDraft.payNow), method = counterDraft && counterDraft.paymentMethod;
      const res = cur.apply(this, arguments);
      const made = (state.orders || []).filter(o => !before.has(o.id));
      made.forEach(o => {
        const lines = o.lineItems || o.itemsDetail || [];
        let cashSum = 0;
        lines.forEach(l => { l.cardPrice = true; });
        (o.itemsDetail && o.itemsDetail !== o.lineItems ? o.itemsDetail : []).forEach(l => { l.cardPrice = true; });
        lines.forEach(l => { cashSum += cashLine(l); });
        if (o.rush) cashSum += 10;
        o.pricing = MODEL;
        o.cashPrice = r2(cashSum || Number(o.total || 0) * (1 - RATE));
        // total/subtotal were already computed from card-priced lines by the counter.
        o.surcharge = 0;
        if (wasPay) { o.paid = true; P.applyPayment(o, method || 'cash'); }
      });
      if (made.length && typeof saveState === 'function') saveState();
      return res;
    };
    w.__v299 = true; w.__hcTags = new Set([...(cur.__hcTags || []), 'v299']); window.posCompleteDropOff = w; try { posCompleteDropOff = w; } catch (_) {}
  }

  /* ---------- labels ---------- */
  function relabel(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const fix = [];
    while (walker.nextNode()) {
      const t = walker.currentNode.nodeValue;
      if (/3% convenience fee|Card convenience fee \(3%\)|Credit-card surcharge \(3%\)|3% surcharge|card fee/i.test(t)) fix.push(walker.currentNode);
    }
    fix.forEach(n => {
      n.nodeValue = n.nodeValue
        .replace(/Card convenience fee \(3%\)|3% convenience fee|Credit-card surcharge \(3%\)/gi, 'Card price — no fee added')
        .replace(/3% surcharge is applied to credit-card charges in this prototype\./i, 'Prices shown are card prices; cash and check receive a 3% cash discount.')
        .replace(/\bcard fee\b/gi, 'card price');
    });
  }
  const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) relabel(n); })));
  document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }));
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });

  const install = () => { wrapLineTotal(); wrapTicketTotal(); wrapComplete(); };
  install();
  let n = 0; const g = setInterval(() => { install(); if (++n > 100) clearInterval(g); }, 100);
})();
