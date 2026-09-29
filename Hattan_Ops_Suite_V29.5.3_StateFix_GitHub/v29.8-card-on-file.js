/* Hattan Ops Suite V29.8 — Card on file: easy to find
 * - Customer profile: a "Card on file" box with Add / Replace card (opens the existing
 *   Clover secure-field form, v16 → clover-cards) and the saved card's brand + last 4.
 * - New Customer: "Add a card on file" checkbox; when ticked, the Clover secure form opens
 *   right after the customer is created.
 * Card data only ever goes into Clover-hosted fields; nothing new is stored.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const cardOf = c => (c && c.paymentMethods || []).find(p => p.processor === 'clover') || (c && c.paymentMethods || []).find(p => p.default) || (c && c.paymentMethods || [])[0] || null;
  const openCard = id => { if (typeof v8OpenAddCard === 'function') v8OpenAddCard(id); else if (typeof toast === 'function') toast('Card setup is not available', false, 'alerttriangle'); };
  window.v298AddCard = openCard;
  // Clover requires an email to save a card. When the customer has none, use a per-customer
  // Gmail "+" alias of the shop inbox (delivers to hattancleaners141@gmail.com). It is kept
  // off the customer's profile and never used for receipts.
  const PLACEHOLDER_BASE = ['hattancleaners141', 'gmail.com'];
  const isPlaceholder = e => new RegExp('^' + PLACEHOLDER_BASE[0] + '\\+c[^@]+@' + PLACEHOLDER_BASE[1].replace('.', '\\.') + '$', 'i').test(String(e || ''));
  const placeholderFor = c => `${PLACEHOLDER_BASE[0]}+c${String((c && (c.customerNumber || c.id)) || Date.now()).replace(/[^A-Za-z0-9]/g, '')}@${PLACEHOLDER_BASE[1]}`;
  window.v298IsPlaceholderEmail = isPlaceholder;
  function fillCardEmail(c) {
    const el = document.getElementById('v16-card-email'); if (!el || String(el.value || '').trim()) return;
    el.value = c.cloverEmail || placeholderFor(c);
    const label = el.previousElementSibling;
    if (label) label.innerHTML = 'Email for Clover <small style="font-weight:400;color:#475467">— none on file, so the shop inbox is used. Replace it if the customer gives an email.</small>';
  }
  function wrapCardModal() {
    const open = window.v8OpenAddCard;
    if (typeof open === 'function' && !open.__v298) {
      const o = function (id) { const r = open.apply(this, arguments); try { const c = customerById(id); if (c) setTimeout(() => fillCardEmail(c), 0); } catch (_) {} return r; };
      o.__v298 = true; window.v8OpenAddCard = o; try { v8OpenAddCard = o; } catch (_) {}
    }
    const save = window.v16SaveCloverCard;
    if (typeof save === 'function' && !save.__v298) {
      const sv = async function (id) {
        const c = customerById(id), before = c ? (c.email || '') : '';
        const r = await save.apply(this, arguments);
        if (c && isPlaceholder(c.email)) { c.cloverEmail = c.email; c.email = isPlaceholder(before) ? '' : before; if (typeof saveState === 'function') saveState(); if (state.v7CustomerId === c.id && typeof renderV7CustomerProfile === 'function') renderV7CustomerProfile(); }
        return r;
      };
      sv.__v298 = true; window.v16SaveCloverCard = sv; try { v16SaveCloverCard = sv; } catch (_) {}
    }
  }

  const css = document.createElement('style');
  css.textContent = `.v298-card{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:2px solid #1f6f43;border-radius:14px;padding:12px 16px;margin:12px 0;background:#f3faf5}
  .v298-card.none{border-color:#b54708;background:#fffaf0}.v298-card .v298-t{font-weight:700;font-size:16px}.v298-card small{display:block;color:#475467;font-weight:400;font-size:13px}
  .v298-nc{display:flex;gap:10px;align-items:flex-start;border:2px solid #1f6f43;border-radius:12px;padding:12px;margin:10px 0;background:#f3faf5;cursor:pointer}.v298-nc input{width:22px;height:22px;margin-top:2px}`;
  document.head.appendChild(css);

  /* ---------- profile ---------- */
  function cardBox(c) {
    const card = cardOf(c);
    return card
      ? `<div class="v298-card"><div style="font-size:26px">💳</div><div style="flex:1"><div class="v298-t">Card on file: ${E(card.brand || 'Card')} •••• ${E(card.last4 || '')}</div><small>Used for batch charges and "Card on file" at Drop Off.</small></div><button class="btn btn-secondary" onclick="v298AddCard('${E(c.id)}')">Replace / remove card</button></div>`
      : `<div class="v298-card none"><div style="font-size:26px">💳</div><div style="flex:1"><div class="v298-t">No card on file</div><small>Save the customer's card securely with Clover so tickets can be charged automatically.</small></div><button class="btn btn-primary" onclick="v298AddCard('${E(c.id)}')">+ Add card on file</button></div>`;
  }
  function wrapProfile() {
    const cur = window.renderV7CustomerProfile;
    if (typeof cur !== 'function' || cur.__v298) return;
    const w = function () {
      const r = cur.apply(this, arguments);
      try {
        const c = customerById(state.v7CustomerId), content = document.getElementById('pos-content');
        if (c && content && !content.querySelector('.v298-card')) {
          const anchor = content.querySelector('.v288-hero') || content.querySelector('.v7-profile-head') || content.firstElementChild;
          if (anchor) anchor.insertAdjacentHTML('afterend', cardBox(c));
        }
      } catch (e) { console.error('V29.8 card box:', e); }
      return r;
    };
    w.__v298 = true;
    window.renderV7CustomerProfile = w;
    try { renderV7CustomerProfile = w; } catch (_) {}
  }

  /* ---------- new customer ---------- */
  let addAfterCreate = false;
  function wrapNewCustomer() {
    const open = window.posOpenNewCustomer, save = window.posSaveNewCustomer;
    if (typeof open === 'function' && !open.__v298) {
      const o = function () {
        const r = open.apply(this, arguments);
        addAfterCreate = false;
        try {
          const modal = document.querySelector('#nc-name')?.closest('.pos-modal, .modal, [class*="modal"]') || document.body;
          const oldRow = document.getElementById('nc-card-switch')?.closest('.pref-row') || [...modal.querySelectorAll('.pref-row')].find(x => /card on file/i.test(x.textContent));
          const html = `<label class="v298-nc"><input type="checkbox" id="v298-nc-card" onchange="v298NcToggle(this.checked)"><span><strong>Add a card on file</strong><small style="display:block;color:#475467">After you tap Add Customer, Clover's secure card form opens. Phone number is enough — no email needed.</small></span></label>`;
          if (oldRow) oldRow.outerHTML = html;
          else { const btn = [...modal.querySelectorAll('button')].find(b => /Add Customer/i.test(b.textContent)); if (btn) btn.insertAdjacentHTML('beforebegin', html); }
          document.getElementById('nc-card-fields')?.remove();
        } catch (e) { console.error('V29.8 new customer:', e); }
        return r;
      };
      o.__v298 = true; window.posOpenNewCustomer = o; try { posOpenNewCustomer = o; } catch (_) {}
    }
    if (typeof save === 'function' && !save.__v298) {
      const s = function () {
        const want = addAfterCreate || !!document.getElementById('v298-nc-card')?.checked;
        const before = new Set((state.customers || []).map(c => c.id));
        const r = save.apply(this, arguments);
        const created = (state.customers || []).find(c => !before.has(c.id));
        if (want && created) setTimeout(() => openCard(created.id), 300);
        addAfterCreate = false;
        return r;
      };
      s.__v298 = true; window.posSaveNewCustomer = s; try { posSaveNewCustomer = s; } catch (_) {}
    }
  }
  window.v298NcToggle = on => { addAfterCreate = !!on; };

  const install = () => { wrapProfile(); wrapNewCustomer(); wrapCardModal(); };
  install();
  let n = 0; const g = setInterval(() => { install(); if (++n > 100) clearInterval(g); }, 100);
})();
