/* Hattan Ops Suite V38 — Staff alerts bell + "Do Over"
 *
 * 1. Bell (top right): customer text replies, Do Over answers (AGAIN / PACK), STOP, and cards
 *    saved from a text link. The server writes these into the shared store (state.staffAlerts)
 *    and also emails the shop inbox. New ones pop a toast on every POS screen.
 * 2. Do Over (customer profile): pick the open ticket(s), optionally the garment(s), and send a
 *    friendly text asking whether to re-clean stains free of charge (reply AGAIN) or pack it (PACK).
 *    The answer is recorded on the ticket and shows up in the bell.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const SEEN_KEY = 'hcAlertsSeenAt';
  const seenAt = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (_) { return ''; } };
  const setSeen = v => { try { localStorage.setItem(SEEN_KEY, v); } catch (_) {} };
  const alerts = () => (Array.isArray(state.staffAlerts) ? state.staffAlerts : []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const unread = () => { const s = seenAt(); return alerts().filter(a => !s || String(a.at) > s); };
  const when = iso => { const d = new Date(iso); const mins = Math.round((Date.now() - d) / 60000); return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const ICON = { card: '💳', reply: '💬', doover: '🔁', texts: '📵' };

  /* ---------------- bell ---------------- */
  let open = false;
  function bellHtml() {
    const n = unread().length;
    return `<button class="v38-bell${n ? ' has' : ''}" onclick="v38ToggleAlerts(event)" title="Customer alerts">🔔${n ? `<span class="v38-count">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  }
  function panelHtml() {
    const list = alerts().slice(0, 40), s = seenAt();
    return `<div class="v38-panel" onclick="event.stopPropagation()"><div class="v38-panel-head"><strong>Customer alerts</strong><span style="flex:1"></span><button class="btn btn-ghost btn-sm" onclick="v38MarkRead()">Mark all read</button></div>
      ${list.length ? list.map(a => `<div class="v38-item${!s || String(a.at) > s ? ' new' : ''}"><div class="v38-ic">${ICON[a.type] || '🔔'}</div><div style="flex:1;min-width:0"><div class="v38-t">${E(a.title)}</div>
        ${a.customerName ? `<a class="v38-c" onclick="v38OpenCustomer('${E(a.customerId)}')">${E(a.customerName)}</a>` : ''}
        ${a.text ? `<div class="v38-x">${E(a.text)}</div>` : ''}<div class="v38-w">${E(when(a.at))}</div></div></div>`).join('') : '<div class="helper-text" style="padding:14px">No alerts yet. Customer replies and cards saved from text links show up here.</div>'}</div>`;
  }
  function paintBell() {
    const right = document.querySelector('.pos-topbar-right'); if (!right) return;
    let wrap = right.querySelector('.v38-bell-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'v38-bell-wrap'; right.insertBefore(wrap, right.firstChild); }
    const html = bellHtml() + (open ? panelHtml() : '');
    if (wrap.__html !== html) { wrap.innerHTML = html; wrap.__html = html; }
  }
  window.v38ToggleAlerts = ev => { if (ev) ev.stopPropagation(); open = !open; paintBell(); };
  window.v38MarkRead = () => { const a = alerts()[0]; if (a) setSeen(a.at); paintBell(); };
  window.v38OpenCustomer = id => { open = false; if (!customerById(id)) return; state.posNav = 'customers'; try { v7OpenCustomerProfile(id); } catch (_) { renderPosContent(); } paintBell(); };
  document.addEventListener('click', () => { if (open) { open = false; paintBell(); } });

  // Toast for alerts that arrive while the POS is open.
  let known = null;
  function checkNew() {
    const list = alerts();
    if (known === null) { known = new Set(list.map(a => a.id)); return; }
    const fresh = list.filter(a => !known.has(a.id));
    fresh.forEach(a => known.add(a.id));
    fresh.slice(0, 3).reverse().forEach(a => { try { toast(`${ICON[a.type] || '🔔'} ${a.customerName ? a.customerName + ': ' : ''}${a.title}`, true, 'message'); } catch (_) {} });
  }

  /* ---------------- Do Over ---------------- */
  const OPEN_EXCLUDE = ['picked_up', 'delivered', 'voided'];
  const openTickets = c => (state.orders || []).filter(o => o && String(o.customerId) === String(c.id) && !o.legacy && !OPEN_EXCLUDE.includes(o.status));
  const lineName = l => {
    const g = typeof garmentById === 'function' ? garmentById(l.garmentId) : null;
    const base = l.serviceType === 'alterations' && l.garmentNote ? String(l.garmentNote).split(' · ')[0] : (g?.name || l.name || 'Item');
    const color = l.colorId && !['none', 'other', 'mixed', 'print'].includes(String(l.colorId)) ? `${String(l.colorId)} ` : '';
    return `${color}${base}`;
  };
  const statusTag = o => {
    const d = o.doOver; if (!d) return '';
    const t = { asked: 'Do Over asked · waiting', again: 'Customer said AGAIN', pack: 'Customer said PACK', 'not-texted': 'Do Over not texted' }[d.status] || '';
    return t ? `<span class="v38-tag ${E(d.status)}">${E(t)}</span>` : '';
  };
  window.v38DoOver = customerId => {
    const c = customerById(customerId); if (!c) return;
    const tickets = openTickets(c);
    if (!tickets.length) return toast('No open tickets for this customer', false, 'alerttriangle');
    openPosModal(`<h3>🔁 Do Over · ${E(c.name)}</h3>
      <p class="pm-sub">Texts the customer: stains didn't fully come out — re-clean free of charge (reply AGAIN) or pack it as scheduled (reply PACK). Their answer shows in the 🔔 alerts and on the ticket.</p>
      <div class="v38-do">${tickets.map(o => {
        const lines = (o.lineItems || o.itemsDetail || []);
        return `<div class="v38-tk"><label class="v38-row"><input type="checkbox" class="v38-o" value="${E(o.id)}" onchange="v38PickTicket(this)"><span><strong>#${E(String(o.ticket || o.id).replace(/^HC-/, ''))}</strong> · ${E(o.items || o.serviceLabel || '')}${o.dueDate ? ` · due ${E(o.dueDate)}` : ''} ${statusTag(o)}</span></label>
          ${lines.length ? `<div class="v38-lines" hidden><div class="helper-text" style="margin:2px 0 4px">Which garment? <em>(optional)</em></div>${lines.map((l, i) => `<label class="v38-row sub"><input type="checkbox" class="v38-l" data-o="${E(o.id)}" value="${i}"><span>${Number(l.qty) > 1 ? E(l.qty) + '× ' : ''}${E(lineName(l))}</span></label>`).join('')}</div>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn btn-primary btn-block" id="v38-do-send" onclick="v38SendDoOver('${E(c.id)}')">Submit — text the customer</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Cancel</button>`);
  };
  window.v38PickTicket = el => { const box = el.closest('.v38-tk')?.querySelector('.v38-lines'); if (box) box.hidden = !el.checked; };
  window.v38SendDoOver = async customerId => {
    const c = customerById(customerId); if (!c) return;
    const selections = [...document.querySelectorAll('.v38-o:checked')].map(el => ({ orderId: el.value, lines: [...document.querySelectorAll(`.v38-l[data-o="${CSS.escape(el.value)}"]:checked`)].map(x => Number(x.value)) }));
    if (!selections.length) return toast('Tick at least one ticket', false, 'alerttriangle');
    const btn = document.getElementById('v38-do-send'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try { if (typeof window.hcPushAndWait === 'function') await hcPushAndWait(); } catch (_) {}
    const r = await v16Api('sms-notify', { method: 'POST', body: JSON.stringify({ kind: 'doOver', customerId: c.id, selections }) });
    const d = r.data || {};
    if (r.ok && d.sent) { closePosModal(); toast('Do Over text sent — the answer will show in 🔔 alerts', true, 'checkcircle'); return; }
    const why = window.hcTexts && hcTexts.why ? hcTexts.why(r) : (d.error || d.skipped || 'not sent');
    if (!d.message) { if (btn) { btn.disabled = false; btn.textContent = 'Submit — text the customer'; } return toast(`Do Over not sent: ${why}`, false, 'alerttriangle'); }
    openPosModal(`<h3>Do Over not texted</h3><p class="pm-sub">${E(why)}. Call the customer or send this message another way:</p>
      <textarea id="v38-msg" class="text-input" rows="6" readonly style="width:100%">${E(d.message)}</textarea>
      <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="(async()=>{const t=document.getElementById('v38-msg');try{await navigator.clipboard.writeText(t.value)}catch(_){t.select()}toast('Message copied',true,'checkcircle')})()">Copy message</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Close</button>`);
  };

  function injectProfile() {
    if (state.posNav !== 'customers' || !state.v7CustomerId) return;
    const content = document.getElementById('pos-content'); if (!content || content.querySelector('.v38-actions')) return;
    const c = customerById(state.v7CustomerId); if (!c) return;
    const anchor = content.querySelector('.v298-card') || content.querySelector('.v34-profile-wrap') || content.querySelector('.v288-hero') || content.querySelector('.v7-profile-head');
    if (!anchor) return;
    const n = openTickets(c).length, waiting = openTickets(c).filter(o => o.doOver && o.doOver.status === 'asked').length;
    anchor.insertAdjacentHTML('afterend', `<div class="v38-actions"><button class="btn btn-secondary" onclick="v38DoOver('${E(c.id)}')" ${n ? '' : 'disabled title="No open tickets"'}>🔁 Do Over</button><span class="helper-text" style="margin:0">Ask the customer to re-clean stains free, or pack it.${waiting ? ` · <strong>${waiting} waiting for an answer</strong>` : ''}</span></div>`);
  }

  /* ---------------- styles + loop ---------------- */
  const css = document.createElement('style');
  css.textContent = `.v38-bell-wrap{position:relative;display:inline-flex;margin-right:10px}
  .v38-bell{position:relative;border:1px solid var(--line,#dfe3e0);background:#fff;border-radius:999px;width:40px;height:40px;font-size:18px;cursor:pointer;line-height:1}
  .v38-bell.has{border-color:#b54708;background:#fffaf0}
  .v38-count{position:absolute;top:-6px;right:-6px;background:#b42318;color:#fff;border-radius:999px;font-size:11px;font-weight:700;min-width:18px;height:18px;line-height:18px;padding:0 4px}
  .v38-panel{position:absolute;right:0;top:46px;width:min(380px,90vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #dfe3e0;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);z-index:9999;text-align:left}
  .v38-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0ee;position:sticky;top:0;background:#fff}
  .v38-item{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #f1f2f1}.v38-item.new{background:#f3faf5}
  .v38-ic{font-size:18px}.v38-t{font-weight:700;font-size:14px}.v38-c{color:var(--brand,#163f36);font-weight:600;font-size:13px;cursor:pointer;text-decoration:underline}
  .v38-x{font-size:13px;color:#344054;margin-top:2px;word-wrap:break-word}.v38-w{font-size:12px;color:#667085;margin-top:2px}
  .v38-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0}
  .v38-do{max-height:52vh;overflow:auto;margin:6px 0 12px}.v38-tk{border:1px solid #dfe3e0;border-radius:12px;padding:10px 12px;margin-bottom:8px}
  .v38-row{display:flex;gap:10px;align-items:flex-start;cursor:pointer;padding:3px 0}.v38-row input{width:20px;height:20px;margin-top:2px;flex:none}.v38-row.sub{margin-left:28px;font-size:14px}
  .v38-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#fff4e5;color:#b54708;margin-left:4px}.v38-tag.again{background:#e6f4ec;color:#1f6f43}.v38-tag.pack{background:#eef2ff;color:#3538cd}`;
  document.head.appendChild(css);

  let queued = false;
  const tick = () => { try { paintBell(); injectProfile(); checkNew(); } catch (e) { console.error('V38', e); } };
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; tick(); }); } });
  const start = () => { obs.observe(document.body, { childList: true, subtree: true }); setInterval(tick, 3000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
