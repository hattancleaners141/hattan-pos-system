/* Hattan Ops Suite V30 — customer app ↔ POS
 * - Customers screen: app sign-ups whose phone number already belongs to a shop customer wait
 *   here until staff confirm it's really them (keeps order history private).
 * - Delivery screen: pickup requests booked in the app, with address, time window and notes.
 * - A toast whenever a new app pickup or sign-up arrives.
 * App payments, card changes, preferences and points already write straight into the shared
 * store data on the server, so they appear on every counter automatically.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const live = () => { try { return typeof v16IsShared === 'function' && v16IsShared() && !!state.session?.loggedIn; } catch (_) { return false; } };
  const A = window.HATTAN_APP_ADMIN = { pending: [], loaded: false, seenPending: new Set(), seenPickups: null };
  const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
  const dayLabel = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3]); const t = new Date(); t.setHours(0, 0, 0, 0); const diff = Math.round((d - t) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  const SERVICE = { drycleaning: 'Dry Cleaning', washfold: 'Wash & Fold', shirts: 'Shirt Laundry', household: 'Household Items', alterations: 'Tailoring' };
  const TAG = { starch: 'Extra starch', nohangers: 'Eco box, no hangers', fragrancefree: 'Fragrance-free', separate: 'Separate darks/lights', rush: 'RUSH' };

  async function refresh() {
    if (!live()) return;
    const r = await v16Api('app-admin');
    if (!r.ok) return;
    A.pending = r.data.pending || []; A.loaded = true;
    const fresh = A.pending.filter(p => !A.seenPending.has(p.id));
    if (fresh.length && A.seenPending.size) toast(`📱 ${fresh.length} new app sign-up${fresh.length === 1 ? '' : 's'} to confirm (Customers)`, true, 'users');
    A.pending.forEach(p => A.seenPending.add(p.id));
    if (state.posNav === 'customers' && !state.v7CustomerId) try { renderPosContent(); } catch (_) {}
  }
  function watchPickups() {
    const list = (state.orders || []).filter(o => o && o.source === 'customer-app' && o.status === 'scheduled');
    if (A.seenPickups === null) { A.seenPickups = new Set(list.map(o => o.id)); return; }
    list.filter(o => !A.seenPickups.has(o.id)).forEach(o => {
      const c = customerById(o.customerId);
      toast(`📱 New app pickup · ${c ? c.name : 'Customer'} · ${dayLabel(o.pickupDate)} ${o.window || ''}`, true, 'truck');
      A.seenPickups.add(o.id);
    });
  }

  /* ---------------- Customers: sign-ups to confirm ---------------- */
  function matchButtons(p) {
    const refs = String(p.match_customer_id || '').split(',').filter(Boolean);
    return refs.map(ref => {
      let label = ref;
      if (ref.startsWith('cb:')) { const r = window.HATTAN_DIRECTORY?.byLegacy?.get(ref.slice(3)); label = r ? `${r.name || ''} · CleanBase #${r.num}` : 'CleanBase customer'; }
      else { const c = customerById(ref); label = c ? `${c.name} · ${c.customerNumber || ''}` : ref; }
      return `<button class="btn btn-primary btn-sm" onclick="v30Link('${E(p.id)}','${E(ref)}')">✓ It's them — link to ${E(label)}</button>`;
    }).join(' ');
  }
  function pendingPanel() {
    if (!A.pending.length) return '';
    return `<div class="pos-card v30-app" style="margin-bottom:14px;border:2px solid #b8903f">
      <h3 style="margin:0 0 4px">📱 App sign-ups to confirm (${A.pending.length})</h3>
      <div class="helper-text" style="margin-bottom:10px">These people signed up in the customer app with a phone number that's already on file. Confirm it's really them (ask to see the text/email, or recognize them) before linking — linking shows them that customer's orders, balance and card.</div>
      ${A.pending.map(p => { const s = p.signup || {}; return `<div style="border-top:1px solid #e3e2d8;padding:10px 0">
        <div><strong>${E(s.name || '—')}</strong> · ${E(s.phone || '')} · ${E(p.email)}</div>
        <div class="helper-text">Phone matches: ${E(p.match_note || '')} · signed up ${E(new Date(p.created_at).toLocaleString())}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${matchButtons(p)}
          <button class="btn btn-secondary btn-sm" onclick="v30CreateNew('${E(p.id)}')">New customer instead</button>
          <button class="btn btn-ghost btn-sm" onclick="v30Reject('${E(p.id)}')">Not them</button></div></div>`; }).join('')}
    </div>`;
  }
  window.v30Link = async (accountId, ref) => {
    let customerId = ref;
    if (ref.startsWith('cb:')) {
      const legacyId = ref.slice(3), r = window.HATTAN_DIRECTORY?.byLegacy?.get(legacyId);
      if (!r) return toast('Customer directory is still loading — try again in a moment', false, 'alerttriangle');
      await window.v296OpenCustomer('c:' + r.num); // saves the CleanBase customer into the POS
      const c = (state.customers || []).find(x => String(x.legacyCustomerId) === String(legacyId) || x.id === `cb_${legacyId}`);
      if (!c) return toast('Could not open that customer', false, 'alerttriangle');
      customerId = c.id;
    }
    toast('Linking app account…', true, 'refresh');
    if (typeof window.hcPushAndWait === 'function') await window.hcPushAndWait();
    const res = await v16Api('app-admin', { method: 'POST', body: JSON.stringify({ action: 'link', accountId, customerId }) });
    if (!res.ok) return toast(res.data?.error || 'Could not link', false, 'alerttriangle');
    toast('App account linked — the customer can see their orders now', true, 'checkcircle');
    refresh();
  };
  window.v30CreateNew = async accountId => {
    const res = await v16Api('app-admin', { method: 'POST', body: JSON.stringify({ action: 'createNew', accountId }) });
    if (!res.ok) return toast(res.data?.error || 'Could not create', false, 'alerttriangle');
    toast('New customer created from the app sign-up', true, 'users'); refresh();
  };
  window.v30Reject = async accountId => {
    if (!confirm('Mark this app sign-up as not confirmed? The person will be asked to call or visit the shop.')) return;
    const res = await v16Api('app-admin', { method: 'POST', body: JSON.stringify({ action: 'reject', accountId }) });
    if (!res.ok) return toast(res.data?.error || 'Could not update', false, 'alerttriangle');
    toast('Marked as not confirmed', true, 'checkcircle'); refresh();
  };

  /* ---------------- Delivery: app pickup requests ---------------- */
  const STAGE = ['scheduled', 'picked_up', 'in_cleaning', 'ready', 'out_for_delivery', 'delivered'];
  function pickupsPanel() {
    const list = (state.orders || []).filter(o => o && o.source === 'customer-app' && ['scheduled', 'picked_up'].includes(o.status))
      .sort((a, b) => String(a.pickupDate + a.window).localeCompare(String(b.pickupDate + b.window)));
    if (!list.length) return '';
    return `<div class="pos-card v30-pickups" style="margin-bottom:14px">
      <h3 style="margin:0 0 8px">📱 Customer app pickups (${list.length})</h3>
      ${list.map(o => { const c = customerById(o.customerId) || {}; const a = o.address || {}; const tags = (o.tags || []).map(t => TAG[t] || t);
        return `<div style="border-top:1px solid #e3e2d8;padding:10px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div style="min-width:120px"><strong>${E(dayLabel(o.pickupDate))}</strong><div class="helper-text">${E(o.window || '')}</div>${o.rush ? '<span style="background:#b42318;color:#fff;border-radius:8px;padding:1px 7px;font-size:11px;font-weight:700">RUSH</span>' : ''}</div>
          <div style="flex:1;min-width:220px"><strong>#${E(o.ticket)} · ${E(c.name || 'Customer')}</strong> · ${E(c.phone || '')}
            <div>${E([a.street, a.apartment && 'Apt ' + a.apartment, a.postalCode || a.zip].filter(Boolean).join(', '))}${a.notes ? ` · <em>${E(a.notes)}</em>` : ''}</div>
            <div class="helper-text">${E((o.services || []).map(s => SERVICE[s] || s).join(' + '))}${tags.length ? ' · ' + E(tags.join(', ')) : ''}${o.notes ? ' · “' + E(o.notes) + '”' : ''}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${o.status === 'scheduled'
            ? `<button class="btn btn-primary btn-sm" onclick="v30PickupStatus('${E(o.id)}','picked_up')">✓ Picked up</button><button class="btn btn-ghost btn-sm" onclick="v30PickupCancel('${E(o.id)}')">Cancel</button>`
            : `<button class="btn btn-primary btn-sm" onclick="v30PickupStatus('${E(o.id)}','in_cleaning')">Items tagged → In cleaning</button>`}
            <button class="btn btn-secondary btn-sm" onclick="v7OpenCustomerProfile && v7OpenCustomerProfile('${E(o.customerId)}')">Customer</button></div></div>`; }).join('')}
      <div class="helper-text" style="margin-top:6px">After pickup, add the items to that ticket in Orders so the customer gets the price, receipt and "ready" updates in the app.</div>
    </div>`;
  }
  window.v30PickupStatus = (id, status) => {
    const o = (state.orders || []).find(x => x.id === id); if (!o) return;
    o.status = status; o.stageIndex = Math.max(0, STAGE.indexOf(status));
    if (status === 'picked_up') o.pickedUpAt = new Date().toISOString();
    try { recordSync(`App pickup #${o.ticket} → ${status.replace('_', ' ')}`); } catch (_) {}
    if (typeof saveState === 'function') saveState();
    renderPosContent();
  };
  window.v30PickupCancel = id => {
    const o = (state.orders || []).find(x => x.id === id); if (!o) return;
    if (!confirm(`Cancel app pickup #${o.ticket}? Please let the customer know.`)) return;
    o.status = 'voided'; o.voided = true; o.voidReason = 'Canceled by shop'; o.voidedAt = new Date().toISOString();
    try { recordSync(`App pickup #${o.ticket} canceled`); } catch (_) {}
    if (typeof saveState === 'function') saveState();
    renderPosContent();
  };

  /* ---------------- inject panels after each screen render ---------------- */
  // Other scripts own renderPosCustomers / renderPosDelivery (and re-install them), so the
  // panels are added after the screen draws instead of wrapping those functions.
  let queued = false;
  function inject() {
    queued = false;
    const content = document.getElementById('pos-content'); if (!content || !state.session?.loggedIn) return;
    try {
      if (state.posNav === 'customers' && !state.v7CustomerId && !content.querySelector('.v30-app')) { const h = pendingPanel(); if (h) content.insertAdjacentHTML('afterbegin', h); }
      if (state.posNav === 'delivery' && !content.querySelector('.v30-pickups')) { const h = pickupsPanel(); if (h) content.insertAdjacentHTML('afterbegin', h); }
    } catch (e) { console.error('V30 panel', e); }
  }
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(inject); } });
  const start = () => { const el = document.getElementById('pos-content') || document.body; obs.observe(document.body, { childList: true, subtree: true }); inject(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  setInterval(() => { try { watchPickups(); } catch (_) {} }, 5000);
  setInterval(refresh, 60000);
  setTimeout(refresh, 4000);
  window.v30RefreshAppAdmin = refresh;
})();
