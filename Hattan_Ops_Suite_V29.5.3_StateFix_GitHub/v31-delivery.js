/* Hattan Ops Suite V31 — real drivers + proof of delivery in the POS
 * - Drivers are your real staff accounts (Team screen), so tickets sent to a driver show up in
 *   that person's Hattan Driver app (hattan-ops-suite.netlify.app/driver/).
 * - Delivery screen: "Proof of delivery" — every delivery/pickup photo with time, handoff,
 *   recipient, GPS and the tickets scanned. Use it when a customer says an order never arrived.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const shared = () => { try { return typeof v16IsShared === 'function' && v16IsShared(); } catch (_) { return false; } };
  const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  /* ---------- drivers = staff accounts (when the live system is on) ---------- */
  let demoDrivers = state.drivers || [];
  try {
    Object.defineProperty(state, 'drivers', {
      configurable: true,
      get() {
        if (!shared()) return demoDrivers;
        return (state.staff || []).filter(s => s && s.active !== false && s.id).map(s => ({ id: s.id, name: s.name || s.displayName || 'Staff', initials: s.initials || initials(s.name), vehicle: s.vehicle || 'Hattan Driver app', pin: '' }));
      },
      set(v) { demoDrivers = v || []; },
    });
  } catch (e) { console.error('V31 drivers', e); }

  // App pickups carry their own address; older code looked addresses up by id.
  const baseAddr = window.v8AddressForOrder;
  if (typeof baseAddr === 'function') {
    const w = function (order) { if (order && order.address && typeof order.address === 'object') return order.address; return baseAddr.apply(this, arguments); };
    window.v8AddressForOrder = w; try { v8AddressForOrder = w; } catch (_) {}
  }
  window.v31AssignPickup = (orderId, driverId) => {
    const o = (state.orders || []).find(x => x.id === orderId); if (!o) return;
    const d = (state.drivers || []).find(x => x.id === driverId);
    o.assignedDriverId = driverId || null; o.assignedDriverName = d ? d.name : null; o.assignedAt = new Date().toISOString();
    try { recordSync(`App pickup #${o.ticket} → ${d ? d.name : 'unassigned'}`); } catch (_) {}
    if (typeof saveState === 'function') saveState();
    toast(d ? `Pickup sent to ${d.name}'s driver app` : 'Pickup unassigned — any driver can take it', true, 'truck');
  };

  /* ---------- proof of delivery panel ---------- */
  const P = window.HATTAN_PROOFS = { list: [], loadedAt: 0, loading: false };
  async function loadProofs(force) {
    if (!shared() || P.loading || (!force && Date.now() - P.loadedAt < 60000)) return;
    P.loading = true;
    const r = await v16Api('delivery-proofs');
    P.loading = false; P.loadedAt = Date.now();
    if (r.ok) { P.list = r.data.proofs || []; if (state.posNav === 'delivery') { const el = document.querySelector('.v31-proofs'); if (el) el.outerHTML = proofsPanel(); } }
  }
  const when = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ticketOf = id => { const o = (state.orders || []).find(x => x.id === id); return o ? `#${o.ticket || o.id}` : id; };
  const custOf = ids => { const o = (state.orders || []).find(x => ids.includes(x.id)); const c = o && customerById(o.customerId); return c ? c.name : (o?.customerName || ''); };
  function proofsPanel() {
    const label = { delivery: 'Delivered', pickup: 'Picked up', attempt: 'Attempt failed' };
    return `<div class="pos-card v31-proofs" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">📷 Proof of delivery</h3>
      <span class="helper-text">Drivers use <strong>hattan-ops-suite.netlify.app/driver</strong> — sign in with their Team PIN</span></div>
      ${P.list.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:10px">${P.list.map(p => `
        <div style="border:1px solid #e3e2d8;border-radius:12px;overflow:hidden;cursor:pointer;background:#fff" onclick="v31OpenProof('${E(p.id)}')">
          ${p.photos[0] ? `<div style="aspect-ratio:4/3;background:#eee url('${E(p.photos[0])}') center/cover"></div>` : `<div style="aspect-ratio:4/3;background:#f6f4ee;display:flex;align-items:center;justify-content:center;color:#8a9089">No photo</div>`}
          <div style="padding:8px 10px"><strong style="color:${p.kind === 'attempt' ? '#b42318' : '#123d2b'}">${label[p.kind] || p.kind}</strong> · ${E(p.orderIds.map(ticketOf).join(', '))}
          <div class="helper-text" style="margin:2px 0 0">${E(custOf(p.orderIds))} · ${E(when(p.at))} · ${E(p.driver || '')}</div>
          <div class="helper-text" style="margin:0">${E(p.method || p.reason || (p.bags != null ? p.bags + ' bag(s)' : ''))}</div></div></div>`).join('')}</div>`
      : `<div class="helper-text" style="margin-top:8px">${shared() ? (P.loadedAt ? 'No deliveries recorded yet.' : 'Loading…') : 'Available when the live system is on.'}</div>`}
    </div>`;
  }
  window.v31OpenProof = id => {
    const p = P.list.find(x => x.id === id); if (!p) return;
    const maps = p.gps ? `https://www.google.com/maps/search/?api=1&query=${p.gps.lat},${p.gps.lng}` : '';
    openPosModal(`<h3>${p.kind === 'delivery' ? 'Delivered' : p.kind === 'pickup' ? 'Picked up' : 'Delivery attempt'} · ${E(p.orderIds.map(ticketOf).join(', '))}</h3>
      <p class="pm-sub">${E(custOf(p.orderIds))} · ${E(when(p.at))} · Driver: ${E(p.driver || '—')}</p>
      <div class="pos-card" style="padding:12px">
        ${p.method ? `<div><strong>Handoff:</strong> ${E(p.method)}${p.recipient ? ' — ' + E(p.recipient) : ''}</div>` : ''}
        ${p.reason ? `<div><strong>Reason:</strong> ${E(p.reason)}</div>` : ''}
        ${p.bags != null && p.kind === 'pickup' ? `<div><strong>Bags:</strong> ${E(p.bags)}</div>` : ''}
        <div><strong>Tickets scanned:</strong> ${E((p.scanned || []).join(', ') || '—')}${p.scanOverride ? ` <span style="color:#b54708">(not scanned: ${E(p.scanOverride)})</span>` : ''}</div>
        ${p.note ? `<div><strong>Driver note:</strong> ${E(p.note)}</div>` : ''}
        <div><strong>Location:</strong> ${maps ? `<a href="${maps}" target="_blank" rel="noopener">Open in Maps</a> (±${E(p.gps.accuracy ?? '?')} m)` : 'not shared by phone'}</div>
      </div>
      ${p.photos.map(u => `<a href="${E(u)}" target="_blank" rel="noopener"><img src="${E(u)}" alt="Proof photo" style="width:100%;border-radius:12px;margin-top:10px"></a>`).join('')}
      <button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="closePosModal()">Close</button>`);
  };

  /* ---------- inject after the Delivery screen draws ---------- */
  let queued = false;
  function inject() {
    queued = false;
    const content = document.getElementById('pos-content');
    if (!content || !state.session?.loggedIn || state.posNav !== 'delivery') return;
    if (!content.querySelector('.v31-proofs')) {
      const anchor = content.querySelector('.v30-pickups');
      if (anchor) anchor.insertAdjacentHTML('afterend', proofsPanel()); else content.insertAdjacentHTML('afterbegin', proofsPanel());
      loadProofs();
    }
    // driver picker on app pickups
    content.querySelectorAll('.v30-pickups [data-v31-order]').length || content.querySelectorAll('.v30-pickups button[onclick^="v30PickupStatus"]').forEach(btn => {
      const id = (/v30PickupStatus\('([^']+)'/.exec(btn.getAttribute('onclick')) || [])[1]; if (!id) return;
      const o = (state.orders || []).find(x => x.id === id); if (!o || o.status !== 'scheduled') return;
      btn.insertAdjacentHTML('beforebegin', `<select class="text-input" data-v31-order="${E(id)}" style="width:auto;padding:6px 8px;font-size:13px" onchange="v31AssignPickup('${E(id)}', this.value)"><option value="">Any driver</option>${(state.drivers || []).map(d => `<option value="${E(d.id)}" ${o.assignedDriverId === d.id ? 'selected' : ''}>${E(d.name)}</option>`).join('')}</select>`);
    });
  }
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(inject); } });
  const start = () => { obs.observe(document.body, { childList: true, subtree: true }); inject(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  setInterval(() => { if (state.posNav === 'delivery') loadProofs(); }, 30000);
})();
