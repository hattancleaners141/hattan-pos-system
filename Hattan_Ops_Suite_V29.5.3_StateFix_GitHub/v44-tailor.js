/* Hattan Ops Suite V44 — Tailor section (brings the Hattan Tailor app into the POS)
 *
 * Sidebar "Tailor" (between Rack and Viewed Customers), built for the tailor's iPad:
 *  - 🎙 New order: tailor speaks (or types) the work while fitting the customer. It is priced from the
 *    SAME alteration price list the counter uses, then "Send to counter" puts it on the counter screen
 *    ready for checkout (customer, lines, prices and a due date the tailor can actually meet).
 *  - 📋 Today's work: every open alteration job — due-soon first, then batched by job type and thread
 *    color so the tailor changes setup less. Start / Done buttons sync to every screen.
 *  - 📅 Capacity: points booked per workday vs the daily limit (simple 1, medium 2, complex 4, luxury 6).
 *  - 💲 Prices: one shared price list (with difficulty) for counter, tailor and AI intake. Managers edit.
 * Counter side:
 *  - Orders sent by the tailor appear at the top of the Counter screen → "Check out".
 *  - Completing a drop-off with alterations checks the tailor's capacity for that due date and offers the
 *    next open day instead of overbooking.
 * Everything lives in the shared store (orders, interfaceSettings.tailor, tailorHandoffs), so it syncs live.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const r2 = n => Math.round(Number(n || 0) * 100) / 100;
  const isMgr = () => { try { return typeof v6IsManager === 'function' && v6IsManager(); } catch (_) { return false; } };
  const staffName = () => { try { return (typeof v6CurrentStaff === 'function' && v6CurrentStaff()?.name) || 'Staff'; } catch (_) { return 'Staff'; } };
  const save = () => { try { if (typeof saveState === 'function') saveState(); } catch (e) { console.error(e); } };
  const PTS = { simple: 1, medium: 2, complex: 4, luxury: 6 };
  const DIFF_LABEL = { simple: 'Simple', medium: 'Medium', complex: 'Complex', luxury: 'Luxury' };
  const CLOSED = ['voided', 'picked_up', 'delivered'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------------- settings + shared price list ---------------- */
  function S() {
    state.interfaceSettings = state.interfaceSettings || {};
    const t = state.interfaceSettings.tailor = state.interfaceSettings.tailor || {};
    if (!Number.isFinite(Number(t.dailyLimit))) t.dailyLimit = 20;
    if (!Number.isFinite(Number(t.buffer))) t.buffer = 3;
    if (!Array.isArray(t.workdays)) t.workdays = [2, 3, 4, 5, 6];
    if (!Number.isFinite(Number(t.cutoffHour))) t.cutoffHour = 15;
    if (!Number.isFinite(Number(t.minDays))) t.minDays = 2;
    t.prices = t.prices || {};
    t.custom = Array.isArray(t.custom) ? t.custom : [];
    return t;
  }
  const priceDiff = p => (p <= 15 ? 'simple' : p <= 35 ? 'medium' : p <= 60 ? 'complex' : 'luxury');
  function applyPrices() {
    if (typeof ALTERATION_VARIANTS === 'undefined') return;
    const t = S();
    t.custom.forEach(c => { if (c && c.id && !ALTERATION_VARIANTS.some(a => a.id === c.id)) ALTERATION_VARIANTS.push({ id: c.id, garment: c.garment, name: c.name, price: Number(c.price || 0) }); });
    ALTERATION_VARIANTS.forEach(a => {
      if (a.__basePrice === undefined) a.__basePrice = a.price;
      const o = t.prices[a.id];
      a.price = o && Number.isFinite(Number(o.price)) ? Number(o.price) : a.__basePrice;
      a.difficulty = (o && o.difficulty) || a.difficulty0 || (a.difficulty0 = a.difficulty || priceDiff(Number(a.__basePrice || 0)));
    });
  }
  const variant = id => (typeof ALTERATION_VARIANTS !== 'undefined' ? ALTERATION_VARIANTS.find(a => a.id === id) : null);
  const diffOf = v => (v && v.difficulty) || (v ? priceDiff(Number(v.price || 0)) : 'medium');
  window.hcTailorApplyPrices = applyPrices;

  /* ---------------- capacity ---------------- */
  const altLines = o => (o.lineItems || o.itemsDetail || []).filter(l => l && l.serviceType === 'alterations');
  const linePts = l => (PTS[diffOf(variant(l.alterationVariantId))] || 2) * Math.max(1, Number(l.qty) || 1);
  const orderPts = o => altLines(o).reduce((s, l) => s + linePts(l), 0);
  const openAltOrders = () => (state.orders || []).filter(o => o && !o.legacy && !CLOSED.includes(o.status) && o.tailorStatus !== 'done' && altLines(o).length);
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => isoOf(new Date());
  const isWorkday = iso => S().workdays.includes(new Date(iso + 'T12:00:00').getDay());
  const bookedPts = (iso, skipIds) => openAltOrders().filter(o => String(o.dueDate || '').slice(0, 10) === iso && !(skipIds || []).includes(o.id)).reduce((s, o) => s + orderPts(o), 0);
  const capOf = () => Math.max(1, Number(S().dailyLimit) - Number(S().buffer));
  function suggestDate(points, fromIso) {
    const t = S(), d = new Date();
    if (d.getHours() >= Number(t.cutoffHour)) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + Number(t.minDays || 0));
    if (fromIso && fromIso > isoOf(d)) { const f = new Date(fromIso + 'T12:00:00'); d.setTime(f.getTime()); }
    const start = new Date(d.getTime());
    for (let i = 0; i < 60; i++) {
      const iso = isoOf(d);
      if (isWorkday(iso) && bookedPts(iso) + points <= capOf()) return iso;
      d.setDate(d.getDate() + 1);
    }
    // Bigger than a whole day: first workday with nothing else booked.
    d.setTime(start.getTime());
    for (let i = 0; i < 60; i++) { const iso = isoOf(d); if (isWorkday(iso) && bookedPts(iso) === 0) return iso; d.setDate(d.getDate() + 1); }
    return isoOf(start);
  }
  const niceDate = iso => { if (!iso) return '—'; const d = new Date(iso + 'T12:00:00'); return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`; };
  window.hcTailorCapacity = { bookedPts, suggestDate, capOf, linePts, orderPts };

  /* ---------------- shared handoffs (tailor → counter) ---------------- */
  const handoffs = () => (state.tailorHandoffs = Array.isArray(state.tailorHandoffs) ? state.tailorHandoffs : []);
  const waiting = () => handoffs().filter(h => h && h.status === 'waiting');
  const lineLabel = l => String(l.garmentNote || '').split(' · ').filter(x => !/^AI — verify/.test(x)).join(' · ');
  const colorName = id => { try { return id && id !== 'print' && typeof colorById === 'function' ? colorById(id).name : ''; } catch (_) { return ''; } };

  /* ---------------- tailor screen ---------------- */
  const UI = window.hcTailorUI = window.hcTailorUI || { tab: 'new', draft: null, rec: null, customerQ: '' };
  const newDraft = () => ({ id: 'th_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), customerId: '', heard: '', lines: [], note: '' });
  if (!UI.draft) UI.draft = newDraft();

  function tabsHTML() {
    const tabs = [['new', '🎙 New order'], ['work', `📋 Today's work`], ['cap', '📅 Capacity'], ['prices', '💲 Prices'], ...(isMgr() ? [['settings', '⚙ Settings']] : [])];
    return `<div class="v44-tabs">${tabs.map(([k, l]) => `<button class="${UI.tab === k ? 'on' : ''}" onclick="v44Tab('${k}')">${l}</button>`).join('')}</div>`;
  }
  window.v44Tab = k => { UI.tab = k; renderPosContent(); };

  function draftTotals() {
    const d = UI.draft;
    const total = r2(d.lines.reduce((s, l) => s + Number(l.unitPrice || 0) * Math.max(1, Number(l.qty) || 1), 0));
    const pts = d.lines.reduce((s, l) => s + linePts(l), 0);
    return { total, pts, due: d.lines.length ? suggestDate(pts) : '' };
  }
  function newTab() {
    const d = UI.draft, c = d.customerId ? customerById(d.customerId) : null, tot = draftTotals();
    const results = !c && UI.customerQ.trim().length > 1 && typeof v8CustomerSearchResults === 'function' ? v8CustomerSearchResults(UI.customerQ) : [];
    const rec = UI.rec;
    const variants = (typeof ALTERATION_VARIANTS !== 'undefined' ? ALTERATION_VARIANTS : []).slice().sort((a, b) => (a.garment + a.name).localeCompare(b.garment + b.name));
    const wait = waiting();
    return `<div class="v44-new">
      <div class="v44-mic-col">
        <div class="v44-cust">${c ? `<div class="v44-chip">👤 <strong>${E(c.name)}</strong> ${E(c.customerNumber || '')} <button onclick="v44SetCustomer('')">✕</button></div>`
          : `<input id="v44-cq" class="text-input" placeholder="Customer (optional) — name, phone or #" value="${E(UI.customerQ)}" oninput="v44CustQ(this.value)">${results.length ? `<div class="v44-results">${results.map(r => `<button onclick="v44SetCustomer('${E(r.id)}')"><strong>${E(r.name)}</strong> <span>${E(r.customerNumber || '')} · ${E(r.phone || '')}</span></button>`).join('')}</div>` : ''}`}</div>
        <button class="v44-mic ${rec ? (rec.state === 'rec' ? 'rec' : 'busy') : ''}" onclick="v44Mic()">
          <span class="v44-mic-ic">${rec ? (rec.state === 'rec' ? '🔴' : '⏳') : '🎙'}</span>
          <span>${rec ? (rec.state === 'rec' ? 'Tap when done' : 'Pricing…') : 'Tap and describe the work'}</span>
        </button>
        <div class="v44-status ${UI.statusErr ? 'err' : ''}">${E(UI.status || 'Example: “hem two pants with cuffs, take in the waist on the navy one, shorten jacket sleeves”')}</div>
        <textarea id="v44-type" class="text-input" rows="3" placeholder="…or type it here and press Add">${E(UI.typed || '')}</textarea>
        <button class="btn btn-secondary btn-block" onclick="v44AddTyped()">Add</button>
        ${wait.length ? `<div class="v44-wait"><strong>Waiting at the counter (${wait.length})</strong>${wait.map(h => `<div>${E(h.customerName || 'No customer')} · ${h.lines.length} item${h.lines.length === 1 ? '' : 's'} · ${money(h.total)} <span>${E(niceDate(h.dueDate))}</span></div>`).join('')}</div>` : ''}
      </div>
      <div class="v44-res-col">
        ${d.heard ? `<div class="v44-heard">“${E(d.heard)}”</div>` : ''}
        <div class="pos-card v44-lines"><h3 style="margin-top:0">Order for the counter</h3>
          ${d.lines.length ? d.lines.map((l, i) => `<div class="v44-line"><div class="v44-line-main"><strong>${E(lineLabel(l))}</strong>${colorName(l.colorId) ? `<small>${E(colorName(l.colorId))}</small>` : ''}<span class="v44-diff ${E(diffOf(variant(l.alterationVariantId)))}">${E(DIFF_LABEL[diffOf(variant(l.alterationVariantId))])} · ${linePts(l)} pt</span></div>
              <div class="v44-qty"><button onclick="v44Qty(${i},-1)">−</button><b>${E(l.qty)}</b><button onclick="v44Qty(${i},1)">+</button></div>
              <div class="v44-price">${Number(l.unitPrice) ? money(Number(l.unitPrice) * Math.max(1, Number(l.qty) || 1)) : '<span class="v44-quote">Quote at counter</span>'}</div>
              <button class="v44-x" onclick="v44Remove(${i})">✕</button></div>`).join('') : '<div class="helper-text">Nothing yet — speak or type the work, or add from the price list.</div>'}
          <div class="v44-add"><select id="v44-add-sel" class="text-input"><option value="">+ Add from price list…</option>${variants.map(a => `<option value="${E(a.id)}">${E(a.garment)} · ${E(a.name)} — ${a.price ? money(a.price) : 'quote'}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" onclick="v44AddVariant()">Add</button></div>
          <textarea id="v44-note" class="text-input" rows="2" placeholder="Notes for the counter / ticket (measurements, pins, fitting)" oninput="v44Note(this.value)">${E(d.note)}</textarea>
          ${d.lines.length ? `<div class="v44-tot"><span>Total <b>${money(tot.total)}</b> · ${tot.pts} pt</span><span>Earliest due date the tailor can meet: <b>${E(niceDate(tot.due))}</b></span></div>` : ''}
          <div class="v44-actions"><button class="btn btn-ghost" onclick="v44Clear()">Clear</button><button class="btn btn-primary" ${d.lines.length ? '' : 'disabled'} onclick="v44Send()">Send to counter →</button></div>
        </div>
      </div></div>`;
  }
  window.v44CustQ = v => { UI.customerQ = v; clearTimeout(UI.cqT); UI.cqT = setTimeout(() => { renderPosContent(); const el = document.getElementById('v44-cq'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 250); };
  window.v44SetCustomer = id => { UI.draft.customerId = id; UI.customerQ = ''; renderPosContent(); };
  window.v44Qty = (i, d) => { const l = UI.draft.lines[i]; if (!l) return; l.qty = Math.max(1, (Number(l.qty) || 1) + d); renderPosContent(); };
  window.v44Remove = i => { UI.draft.lines.splice(i, 1); renderPosContent(); };
  window.v44Note = v => { UI.draft.note = v; };
  window.v44Clear = () => { UI.draft = newDraft(); UI.status = ''; UI.statusErr = false; UI.typed = ''; renderPosContent(); };
  window.v44AddVariant = () => {
    const id = document.getElementById('v44-add-sel')?.value, a = variant(id); if (!a) return;
    const gAlt = typeof garmentById === 'function' ? garmentById('g_alteration') : null;
    UI.draft.lines.push({ garmentId: gAlt ? gAlt.id : 'g_alteration', materialId: 'standard', colorId: 'print', qty: 1, unitPrice: Number(a.price || 0), buttonType: 'none', garmentNote: `${a.garment} · ${a.name}${a.price ? '' : ' · PRICE TO QUOTE'}`, serviceType: 'alterations', alterationVariantId: a.id });
    renderPosContent();
  };
  function addFromText(text) {
    text = String(text || '').trim(); if (!text) return 0;
    const items = typeof window.hcParseAlterations === 'function' ? window.hcParseAlterations(text) : [];
    UI.draft.heard = UI.draft.heard ? UI.draft.heard + ' · ' + text : text;
    items.forEach(it => UI.draft.lines.push({ ...it, garmentNote: String(it.garmentNote || '').replace(/ · AI — verify measurement$/, '') }));
    return items.length;
  }
  window.v44AddTyped = () => {
    const el = document.getElementById('v44-type'), text = el ? el.value : '';
    const n = addFromText(text);
    UI.typed = n ? '' : text; UI.status = n ? `Added ${n} item${n === 1 ? '' : 's'}` : 'Could not find an alteration in that — try “hem 2 pants” or add from the price list'; UI.statusErr = !n;
    renderPosContent();
  };

  // Recording (iPad Safari records audio/mp4; Chrome/Edge audio/webm) → server transcription → local pricing.
  window.v44Mic = async () => {
    if (UI.rec && UI.rec.state === 'rec') { try { UI.rec.mr.stop(); } catch (_) {} UI.rec.state = 'busy'; renderPosContent(); return; }
    if (UI.rec) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        try {
          const blob = new Blob(chunks, { type: (mr.mimeType || mime || 'audio/webm').split(';')[0] });
          const dataUrl = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
          const r = await v16Api('voice-transcribe', { method: 'POST', body: JSON.stringify({ audioDataUrl: dataUrl }) });
          if (!r.ok) throw new Error(r.data?.error || 'Transcription failed');
          const n = addFromText(r.data.transcript);
          UI.status = n ? `Heard it — added ${n} item${n === 1 ? '' : 's'}. Check them, then Send to counter.` : `Heard: “${r.data.transcript}” — no alteration found. Try again or add from the price list.`;
          UI.statusErr = !n;
        } catch (e) { UI.status = e.message; UI.statusErr = true; }
        UI.rec = null; renderPosContent();
      };
      mr.start(); UI.rec = { mr, state: 'rec' }; UI.status = 'Listening…'; UI.statusErr = false; renderPosContent();
    } catch (e) { UI.rec = null; UI.status = e && e.name === 'NotAllowedError' ? 'Microphone access is blocked — allow it in the browser settings' : 'Could not start the microphone'; UI.statusErr = true; renderPosContent(); }
  };

  window.v44Send = () => {
    const d = UI.draft; if (!d.lines.length) return;
    const tot = draftTotals(), c = d.customerId ? customerById(d.customerId) : null;
    const h = { id: d.id, at: new Date().toISOString(), by: staffName(), customerId: d.customerId || '', customerName: c ? c.name : '', heard: d.heard, note: d.note, lines: d.lines.map(l => ({ ...l, garmentNote: lineLabel(l) })), total: tot.total, points: tot.pts, dueDate: tot.due, status: 'waiting' };
    handoffs().unshift(h);
    state.tailorHandoffs = handoffs().slice(0, 100);
    state.staffAlerts = [{ id: 'a' + Date.now().toString(36), at: h.at, type: 'tailor', title: 'Tailor sent an order to the counter', text: `${h.lines.length} item${h.lines.length === 1 ? '' : 's'} · ${money(h.total)} · due ${niceDate(h.dueDate)}`, customerId: h.customerId, customerName: h.customerName }, ...(Array.isArray(state.staffAlerts) ? state.staffAlerts : [])].slice(0, 150);
    save();
    UI.draft = newDraft(); UI.status = '✓ Sent to the counter'; UI.statusErr = false; UI.typed = '';
    renderPosContent();
  };

  /* ---------------- today's work ---------------- */
  function workTab() {
    const now = new Date(), jobs = [];
    openAltOrders().forEach(o => {
      const due = String(o.dueDate || '').slice(0, 10);
      const days = due ? Math.round((new Date(due + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 864e5) : 99;
      const c = o.customerId ? customerById(o.customerId) : null;
      altLines(o).forEach(l => {
        const v = variant(l.alterationVariantId);
        jobs.push({ o, l, days, due, job: v ? `${v.name} — ${v.garment}` : lineLabel(l), type: v ? v.name : lineLabel(l).split(' · ')[1] || 'Alteration', color: colorName(l.colorId) || 'no color', customer: c ? c.name : (o.customerName || ''), pts: linePts(l) });
      });
    });
    if (!jobs.length) return '<div class="pos-card"><div class="helper-text">No open alteration jobs. New alteration tickets show up here automatically.</div></div>';
    const urgent = jobs.filter(j => j.days <= 2).sort((a, b) => a.days - b.days);
    const later = jobs.filter(j => j.days > 2);
    const groups = {};
    later.forEach(j => { const k = j.type + '|' + j.color; (groups[k] = groups[k] || []).push(j); });
    const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    const todayPts = jobs.filter(j => j.due === todayISO()).reduce((s, j) => s + j.pts, 0);
    const statusBtns = o => {
      const st = o.tailorStatus || 'open';
      return `<div class="v44-st">${st === 'in_progress' ? '<span class="v44-pill prog">In progress</span>' : ''}${st !== 'in_progress' ? `<button class="btn btn-ghost btn-sm" onclick="v44Status('${E(o.id)}','in_progress')">Start</button>` : ''}<button class="btn btn-primary btn-sm" onclick="v44Status('${E(o.id)}','done')">Done ✓</button></div>`;
    };
    const tag = d => d < 0 ? `<span class="v44-pill over">${-d}d OVERDUE</span>` : d === 0 ? '<span class="v44-pill over">DUE TODAY</span>' : d === 1 ? '<span class="v44-pill soon">TOMORROW</span>' : `<span class="v44-pill soon">in ${d} days</span>`;
    let n = 1;
    return `<div class="v44-kpis"><div><b>${jobs.length}</b><span>open jobs</span></div><div><b>${urgent.length}</b><span>due within 2 days</span></div><div><b>${todayPts}/${capOf()}</b><span>points due today</span></div></div>
      ${urgent.length ? `<h3 class="v44-h urgent">⚠ Do these first — due soon</h3>${urgent.map(j => `<div class="v44-job urgent"><div class="v44-n">${n++}</div><div class="v44-job-main"><strong>${E(j.job)}${Number(j.l.qty) > 1 ? ' ×' + E(j.l.qty) : ''}</strong><small>${E(j.customer || 'No name')} · #${E(j.o.ticket || j.o.id)}${j.color !== 'no color' ? ' · ' + E(j.color) : ''}${E(String(j.l.garmentNote || '').split(' · ').slice(2).join(' · ') ? ' · ' + String(j.l.garmentNote).split(' · ').slice(2).join(' · ') : '')}</small></div>${tag(j.days)}${statusBtns(j.o)}</div>`).join('')}` : ''}
      ${keys.length ? `<h3 class="v44-h">🧵 Then batch by job — fewer thread and setup changes</h3>${keys.map(k => { const g = groups[k], [type, color] = k.split('|'), qty = g.reduce((s, j) => s + Math.max(1, Number(j.l.qty) || 1), 0); return `<details class="v44-batch"><summary><div class="v44-n b">${n++}</div><div class="v44-job-main"><strong>${E(type)}${color !== 'no color' ? ' · ' + E(color) + ' thread' : ''}</strong><small>${qty} piece${qty === 1 ? '' : 's'} — do these together</small></div></summary>${g.map(j => `<div class="v44-job"><div class="v44-job-main"><strong>${E(j.job)}${Number(j.l.qty) > 1 ? ' ×' + E(j.l.qty) : ''}</strong><small>${E(j.customer || 'No name')} · #${E(j.o.ticket || j.o.id)} · due ${E(niceDate(j.due))}</small></div>${statusBtns(j.o)}</div>`).join('')}</details>`; }).join('')}` : ''}`;
  }
  window.v44Status = (orderId, st) => {
    const o = state.orders.find(x => x.id === orderId); if (!o) return;
    o.tailorStatus = st; o.tailorStatusAt = new Date().toISOString();
    if (st === 'done') {
      o.tailorDoneAt = o.tailorStatusAt;
      state.staffAlerts = [{ id: 'a' + Date.now().toString(36), at: o.tailorDoneAt, type: 'tailor', title: `Tailor finished #${o.ticket || o.id}`, text: 'Ready to rack / mark ready.', customerId: o.customerId || '', customerName: (customerById(o.customerId) || {}).name || '' }, ...(Array.isArray(state.staffAlerts) ? state.staffAlerts : [])].slice(0, 150);
    }
    try { if (typeof v8AddActivity === 'function') v8AddActivity(o, 'tailor', st === 'done' ? 'Tailor marked the work done' : 'Tailor started the work'); } catch (_) {}
    save(); toast(st === 'done' ? `#${o.ticket || o.id} done — counter notified` : `#${o.ticket || o.id} started`, true, 'checkcircle'); renderPosContent();
  };

  /* ---------------- capacity ---------------- */
  function capTab() {
    const cells = [], d = new Date();
    for (let i = 0, added = 0; added < 12 && i < 40; i++) {
      const iso = isoOf(d); d.setDate(d.getDate() + 1);
      if (!isWorkday(iso)) continue; added++;
      const pts = bookedPts(iso), lim = Number(S().dailyLimit), pct = lim ? pts / lim : 0;
      const cls = pts > capOf() ? 'full' : pct >= .7 ? 'busy' : 'ok';
      const orders = openAltOrders().filter(o => String(o.dueDate || '').slice(0, 10) === iso);
      cells.push(`<div class="v44-day ${cls}"><b>${E(niceDate(iso))}</b><span class="v44-bar"><i style="width:${Math.min(100, Math.round(pct * 100))}%"></i></span><span>${pts}/${lim} pt${pts > capOf() ? ' · FULL' : ''}</span>${orders.slice(0, 6).map(o => `<small>#${E(o.ticket || o.id)} ${E((customerById(o.customerId) || {}).name || '')} · ${orderPts(o)}pt</small>`).join('')}${orders.length > 6 ? `<small>+${orders.length - 6} more</small>` : ''}</div>`);
    }
    return `<div class="helper-text" style="margin-bottom:8px">Daily limit ${E(S().dailyLimit)} pt with ${E(S().buffer)} pt kept free for rush/fittings. Points: Simple 1 · Medium 2 · Complex 4 · Luxury 6 per piece.</div><div class="v44-cal">${cells.join('')}</div>`;
  }

  /* ---------------- prices ---------------- */
  function pricesTab() {
    const mgr = isMgr(), q = String(UI.priceQ || '').toLowerCase();
    const list = (typeof ALTERATION_VARIANTS !== 'undefined' ? ALTERATION_VARIANTS : []).filter(a => !q || (a.garment + ' ' + a.name).toLowerCase().includes(q));
    const by = {}; list.forEach(a => (by[a.garment] = by[a.garment] || []).push(a));
    return `<div class="pos-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input class="text-input" style="max-width:320px" placeholder="Search garment or job…" value="${E(UI.priceQ || '')}" oninput="v44PriceQ(this.value)"><span class="helper-text" style="margin:0">One price list for the counter, the tailor and AI intake.${mgr ? ' Changes save instantly for everyone.' : ' Ask a manager to change a price.'}</span></div>
      ${Object.keys(by).sort().map(g => `<h4 class="v44-pg">${E(g)}</h4>${by[g].sort((a, b) => a.name.localeCompare(b.name)).map(a => `<div class="v44-prow"><span>${E(a.name)}</span>${mgr
        ? `<span>$ <input type="number" step="0.5" min="0" value="${E(a.price)}" onchange="v44SetPrice('${E(a.id)}',this.value,null)"></span><select onchange="v44SetPrice('${E(a.id)}',null,this.value)">${Object.keys(PTS).map(k => `<option value="${k}" ${diffOf(a) === k ? 'selected' : ''}>${DIFF_LABEL[k]} · ${PTS[k]}pt</option>`).join('')}</select>`
        : `<b>${a.price ? money(a.price) : 'Quote'}</b><span class="v44-diff ${E(diffOf(a))}">${DIFF_LABEL[diffOf(a)]} · ${PTS[diffOf(a)]}pt</span>`}</div>`).join('')}`).join('')}
      ${mgr ? `<div class="v44-newprice"><strong>Add a price</strong><input id="v44-np-g" class="text-input" placeholder="Garment (e.g. Coat)"><input id="v44-np-n" class="text-input" placeholder="Job (e.g. Replace lining)"><input id="v44-np-p" class="text-input" type="number" step="0.5" placeholder="Price"><select id="v44-np-d" class="text-input">${Object.keys(PTS).map(k => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${DIFF_LABEL[k]}</option>`).join('')}</select><button class="btn btn-primary" onclick="v44AddPrice()">Add</button></div>` : ''}</div>`;
  }
  window.v44PriceQ = v => { UI.priceQ = v; clearTimeout(UI.pqT); UI.pqT = setTimeout(() => { renderPosContent(); const el = document.querySelector('.v44-tailor input[placeholder^="Search garment"]'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 250); };
  window.v44SetPrice = (id, price, diff) => {
    if (!isMgr()) return; const a = variant(id); if (!a) return;
    const t = S(), cur = t.prices[id] || {};
    if (price !== null) cur.price = Math.max(0, r2(price));
    if (diff) cur.difficulty = diff;
    t.prices[id] = cur; applyPrices(); save();
    toast(`${a.garment} · ${a.name}: ${money(a.price)} · ${DIFF_LABEL[diffOf(a)]}`, true, 'checkcircle');
  };
  window.v44AddPrice = () => {
    if (!isMgr()) return;
    const g = String(document.getElementById('v44-np-g')?.value || '').trim(), n = String(document.getElementById('v44-np-n')?.value || '').trim();
    const p = Number(document.getElementById('v44-np-p')?.value), d = document.getElementById('v44-np-d')?.value || 'medium';
    if (!g || !n || !(p >= 0)) return toast('Enter garment, job and price', false, 'alerttriangle');
    const id = 'cust_' + (g + '_' + n).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const t = S(); t.custom = t.custom.filter(c => c.id !== id); t.custom.push({ id, garment: g, name: n, price: r2(p) }); t.prices[id] = { price: r2(p), difficulty: d };
    applyPrices(); save(); renderPosContent(); toast(`Added ${g} · ${n}`, true, 'checkcircle');
  };

  /* ---------------- settings ---------------- */
  function settingsTab() {
    const t = S();
    return `<div class="pos-card v44-settings"><h3 style="margin-top:0">Tailor capacity</h3>
      <label>Daily limit (points)<input type="number" min="1" value="${E(t.dailyLimit)}" onchange="v44Set('dailyLimit',this.value)"></label>
      <label>Keep free each day for rush / fittings (points)<input type="number" min="0" value="${E(t.buffer)}" onchange="v44Set('buffer',this.value)"></label>
      <label>Earliest due date (days after drop-off)<input type="number" min="0" value="${E(t.minDays)}" onchange="v44Set('minDays',this.value)"></label>
      <label>After this hour, start counting from tomorrow<input type="number" min="0" max="23" value="${E(t.cutoffHour)}" onchange="v44Set('cutoffHour',this.value)"></label>
      <div class="v44-days"><span>Tailor works:</span>${DOW.map((n, i) => `<label class="v44-dchk"><input type="checkbox" ${t.workdays.includes(i) ? 'checked' : ''} onchange="v44Day(${i},this.checked)"> ${n}</label>`).join('')}</div></div>`;
  }
  window.v44Set = (k, v) => { if (!isMgr()) return; S()[k] = Math.max(0, Number(v) || 0); save(); toast('Saved', true, 'checkcircle'); };
  window.v44Day = (i, on) => { if (!isMgr()) return; const t = S(); t.workdays = on ? [...new Set([...t.workdays, i])].sort() : t.workdays.filter(x => x !== i); save(); };

  function renderTailor(content) {
    applyPrices();
    const body = UI.tab === 'work' ? workTab() : UI.tab === 'cap' ? capTab() : UI.tab === 'prices' ? pricesTab() : UI.tab === 'settings' && isMgr() ? settingsTab() : newTab();
    content.innerHTML = `<div class="v44-tailor">${tabsHTML()}${body}</div>`;
  }

  /* ---------------- sidebar + routing ---------------- */
  if (typeof POS_NAV_ITEMS !== 'undefined' && !POS_NAV_ITEMS.some(n => n.id === 'tailor')) {
    const i = POS_NAV_ITEMS.findIndex(n => n.id === 'rack');
    POS_NAV_ITEMS.splice(i >= 0 ? i + 1 : POS_NAV_ITEMS.length, 0, { id: 'tailor', label: 'Tailor', icon: 'scissors' });
  }
  try { if (typeof POS_TITLES !== 'undefined') POS_TITLES.tailor = ['Tailor', 'Alterations work queue, capacity and pricing — shared with the counter']; } catch (_) {}
  try {
    if (typeof V13_I18N !== 'undefined') {
      Object.assign(V13_I18N.en, { 'nav.tailor': 'Tailor', 'nav.viewed': 'Viewed Customers', 'nav.migration': 'Migration' });
      if (V13_I18N.es) Object.assign(V13_I18N.es, { 'nav.tailor': 'Sastre', 'nav.viewed': 'Clientes vistos', 'nav.migration': 'Migración' });
    }
  } catch (_) {}
  const baseRender = renderPosContent;
  renderPosContent = function v44RenderPosContent() {
    if (state.posNav === 'tailor' && state.session?.loggedIn && !state.simpleMode) {
      const content = document.getElementById('pos-content'); if (!content) return;
      const titleEl = document.getElementById('pos-title'); if (titleEl) titleEl.textContent = 'Tailor';
      const subEl = document.getElementById('pos-sub'); if (subEl) subEl.innerHTML = 'Alterations work queue, capacity and pricing — shared with the counter';
      document.querySelectorAll('.pos-nav button').forEach((b, i) => b.classList.toggle('active', POS_NAV_ITEMS[i]?.id === 'tailor'));
      return renderTailor(content);
    }
    return baseRender.apply(this, arguments);
  };
  try { window.renderPosContent = renderPosContent; } catch (_) {}

  /* ---------------- counter: tailor orders waiting for checkout ---------------- */
  function counterBanner() {
    if (state.posNav !== 'counter') return;
    const content = document.getElementById('pos-content'); if (!content) return;
    const w = waiting();
    const existing = content.querySelector('.v44-counter');
    if (!w.length) { if (existing) existing.remove(); return; }
    const html = `<div class="v44-counter"><strong>✂ From the tailor</strong>${w.slice(0, 4).map(h => `<div class="v44-hand"><div><b>${E(h.customerName || 'Customer not chosen yet')}</b><small>${h.lines.map(l => E(lineLabel(l)) + (Number(l.qty) > 1 ? ' ×' + E(l.qty) : '')).join(', ')}</small><small>${money(h.total)} · due ${E(niceDate(h.dueDate))} · from ${E(h.by)}</small></div><button class="btn btn-primary btn-sm" onclick="v44Checkout('${E(h.id)}')">Check out</button><button class="btn btn-ghost btn-sm" onclick="v44Dismiss('${E(h.id)}')">✕</button></div>`).join('')}</div>`;
    if (existing) { if (existing.__html !== html) { existing.outerHTML = html; const n = content.querySelector('.v44-counter'); if (n) n.__html = html; } return; }
    content.insertAdjacentHTML('afterbegin', html);
    const n = content.querySelector('.v44-counter'); if (n) n.__html = html;
  }
  window.v44Dismiss = id => { const h = handoffs().find(x => x.id === id); if (!h) return; if (!window.confirm('Remove this tailor order from the counter list?')) return; h.status = 'dismissed'; h.dismissedBy = staffName(); save(); renderPosContent(); };
  window.v44Checkout = id => {
    const h = handoffs().find(x => x.id === id); if (!h) return;
    if (!h.customerId) {
      openPosModal(`<h3>Who is this for?</h3><p class="pm-sub">${h.lines.length} alteration${h.lines.length === 1 ? '' : 's'} · ${money(h.total)}</p><input id="v44-pick-q" class="text-input" placeholder="Name, phone or customer #" oninput="v44PickSearch('${E(h.id)}',this.value)"><div id="v44-pick-res" class="v44-results"></div><button class="btn btn-ghost btn-block" style="margin-top:10px" onclick="closePosModal()">Cancel</button>`);
      setTimeout(() => document.getElementById('v44-pick-q')?.focus(), 30);
      return;
    }
    loadToCounter(h);
  };
  window.v44PickSearch = (hid, q) => {
    const box = document.getElementById('v44-pick-res'); if (!box) return;
    const res = q.trim().length > 1 && typeof v8CustomerSearchResults === 'function' ? v8CustomerSearchResults(q) : [];
    box.innerHTML = res.map(r => `<button onclick="v44PickFor('${E(hid)}','${E(r.id)}')"><strong>${E(r.name)}</strong> <span>${E(r.customerNumber || '')} · ${E(r.phone || '')}</span></button>`).join('');
  };
  window.v44PickFor = (hid, cid) => { const h = handoffs().find(x => x.id === hid); if (!h) return; h.customerId = cid; h.customerName = (customerById(cid) || {}).name || ''; closePosModal(); loadToCounter(h); };
  function loadToCounter(h) {
    if (counterDraft && (counterDraft.items || []).length && counterDraft.customerId && counterDraft.customerId !== h.customerId) {
      if (!window.confirm('The counter has another customer’s drop-off in progress. Start this tailor order instead? (Hold the other ticket first if you need it.)')) return;
    }
    counterDraft = typeof freshCounterDraft === 'function' ? freshCounterDraft() : counterDraft;
    state.posNav = 'counter'; state.counterCustomerAction = 'dropoff';
    try { if (window.v282Pick) window.v282Pick(h.customerId); else posPickCustomer(h.customerId); } catch (_) { try { posPickCustomer(h.customerId); } catch (__) {} }
    h.lines.forEach(l => { try { v9AddOrMergeLine({ ...l, garmentNote: [lineLabel(l), h.note].filter(Boolean).join(' · ') }); } catch (e) { counterDraft.items.push({ ...l }); } });
    counterDraft.serviceDueDates = counterDraft.serviceDueDates || {};
    counterDraft.serviceDueDates.alterations = h.dueDate || suggestDate(h.points || 2);
    counterDraft.tailorHandoffId = h.id;
    h.status = 'taken'; h.takenBy = staffName(); h.takenAt = new Date().toISOString();
    save();
    try { if (typeof window.v282Step === 'function') window.v282Step('finish'); else renderPosContent(); } catch (_) { renderPosContent(); }
    toast(`Tailor order loaded — due ${niceDate(counterDraft.serviceDueDates.alterations)}. Review and complete the ticket.`, true, 'scissors');
  }

  /* ---------------- overbooking guard on Complete ---------------- */
  function wrapComplete() {
    const cur = window.posCompleteDropOff;
    if (typeof cur !== 'function' || cur.__v44) return;
    const w = function () {
      try {
        const d = counterDraft, lines = (d && d.items || []).filter(l => l.serviceType === 'alterations');
        if (lines.length && !w.__bypass) {
          const pts = lines.reduce((s, l) => s + linePts(l), 0);
          d.serviceDueDates = d.serviceDueDates || {};
          const date = d.serviceDueDates.alterations || (typeof v8DefaultDue === 'function' ? v8DefaultDue('alterations') : '');
          const booked = bookedPts(date), cap = capOf(), lim = Number(S().dailyLimit);
          if (date && (booked + pts > cap || !isWorkday(date))) {
            const next = suggestDate(pts);
            const args = arguments, self = this;
            window.__v44Go = (mode) => {
              closePosModal();
              if (mode === 'move') d.serviceDueDates.alterations = next;
              if (mode === 'cancel') return;
              w.__bypass = true; try { return cur.apply(self, args); } finally { w.__bypass = false; }
            };
            openPosModal(`<h3>⚠ Tailor is ${isWorkday(date) ? 'fully booked' : 'off'} on ${E(niceDate(date))}</h3>
              <p class="pm-sub">${isWorkday(date) ? `Already booked ${booked} pt + this order ${pts} pt = <strong>${booked + pts} / ${lim} pt</strong> (${S().buffer} pt kept free for rush).` : 'That day is not a tailor workday.'}</p>
              <button class="btn btn-primary btn-block" onclick="__v44Go('move')">Use ${E(niceDate(next))} instead (next open day)</button>
              <button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="__v44Go('anyway')">Keep ${E(niceDate(date))} anyway</button>
              <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="__v44Go('cancel')">Go back</button>`);
            return;
          }
        }
      } catch (e) { console.error('V44 capacity check', e); }
      return cur.apply(this, arguments);
    };
    w.__v44 = true; w.__hcTags = new Set([...(cur.__hcTags || []), 'v44']);
    window.posCompleteDropOff = w; try { posCompleteDropOff = w; } catch (_) {}
  }

  /* ---------------- styles, boot, live refresh ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  .v44-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.v44-tabs button{border:1px solid var(--line,#dfe3e0);background:#fff;border-radius:999px;padding:10px 16px;font-weight:800;font-size:15px;cursor:pointer}.v44-tabs button.on{background:var(--brand,#163f36);color:#fff;border-color:var(--brand,#163f36)}
  .v44-new{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:20px;align-items:start}@media(max-width:900px){.v44-new{grid-template-columns:1fr}}
  .v44-mic-col{display:flex;flex-direction:column;gap:10px;align-items:stretch}
  .v44-mic{width:190px;height:190px;border-radius:50%;margin:6px auto;border:0;background:var(--brand,#163f36);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-weight:900;font-size:15px;box-shadow:0 14px 34px rgba(22,63,54,.3);cursor:pointer}
  .v44-mic.rec{background:#be123c;animation:v44p 1.4s infinite}.v44-mic.busy{background:#a16207}.v44-mic-ic{font-size:46px}
  @keyframes v44p{0%{box-shadow:0 0 0 0 rgba(190,18,60,.45)}70%{box-shadow:0 0 0 22px rgba(190,18,60,0)}100%{box-shadow:0 0 0 0 rgba(190,18,60,0)}}
  .v44-status{text-align:center;font-size:13px;color:#475467;min-height:18px}.v44-status.err{color:#b42318;font-weight:700}
  .v44-chip{display:flex;align-items:center;gap:8px;background:#f3faf5;border:1px solid #9bc7aa;border-radius:12px;padding:8px 10px}.v44-chip button{margin-left:auto;border:0;background:none;font-size:16px;cursor:pointer}
  .v44-results{display:flex;flex-direction:column;border:1px solid #dfe3e0;border-radius:10px;margin-top:4px;overflow:hidden}.v44-results button{text-align:left;border:0;border-bottom:1px solid #eef0ee;background:#fff;padding:10px;cursor:pointer}.v44-results button span{color:#667085;font-size:12px}
  .v44-wait{background:#faf5ff;border:1px solid #d8b4fe;border-radius:12px;padding:10px 12px;font-size:13px}.v44-wait div{display:flex;justify-content:space-between;gap:8px;margin-top:4px}.v44-wait span{color:#6b21a8;font-weight:700}
  .v44-heard{background:#f7f4ee;border:1px solid #e4ddd2;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-style:italic;color:#475467}
  .v44-line{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eef0ee}.v44-line-main{display:flex;flex-direction:column;gap:2px}.v44-line-main small{color:#667085}
  .v44-qty{display:flex;align-items:center;gap:6px}.v44-qty button{width:34px;height:34px;border-radius:9px;border:1px solid #dfe3e0;background:#fff;font-size:18px;font-weight:900;cursor:pointer}
  .v44-price{font-weight:900;min-width:70px;text-align:right}.v44-quote{color:#b54708;font-size:12px}.v44-x{border:0;background:none;font-size:18px;cursor:pointer;color:#98a2b3}
  .v44-diff{display:inline-block;width:max-content;font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px}.v44-diff.simple{background:#eef2ff;color:#3538cd}.v44-diff.medium{background:#fefce8;color:#854d0e}.v44-diff.complex{background:#fff1f2;color:#9f1239}.v44-diff.luxury{background:#faf5ff;color:#6b21a8}
  .v44-add{display:flex;gap:8px;margin:12px 0 8px}.v44-tot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:10px;padding:10px 12px;margin-top:8px;font-size:14px}
  .v44-actions{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:12px}.v44-actions .btn{min-height:50px;font-size:16px}
  .v44-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.v44-kpis div{background:#fff;border:1px solid #dfe3e0;border-radius:12px;padding:12px;text-align:center}.v44-kpis b{display:block;font-size:24px}.v44-kpis span{font-size:12px;color:#667085;font-weight:700}
  .v44-h{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#475467;margin:14px 0 6px}.v44-h.urgent{color:#b42318}
  .v44-job{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #dfe3e0;border-radius:12px;padding:10px 12px;margin-bottom:6px}.v44-job.urgent{border-color:#fda4af}.v44-job-main{flex:1;min-width:0;display:flex;flex-direction:column}.v44-job-main small{color:#667085}
  .v44-n{width:26px;height:26px;border-radius:50%;background:#be123c;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex:none}.v44-n.b{background:var(--brand,#163f36)}
  .v44-pill{font-size:10px;font-weight:900;border-radius:999px;padding:3px 8px;white-space:nowrap}.v44-pill.over{background:#fff1f2;color:#9f1239}.v44-pill.soon{background:#fefce8;color:#854d0e}.v44-pill.prog{background:#fefce8;color:#854d0e}
  .v44-st{display:flex;gap:6px;align-items:center}.v44-st .btn{min-height:40px}
  .v44-batch{background:#f7f4ee;border:1px solid #e4ddd2;border-radius:12px;margin-bottom:8px;padding:6px 10px}.v44-batch summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none;padding:4px 0}.v44-batch[open] summary{margin-bottom:6px}
  .v44-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.v44-day{border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:4px;border:1px solid}.v44-day.ok{background:#f0fdf4;border-color:#86efac}.v44-day.busy{background:#fefce8;border-color:#fde047}.v44-day.full{background:#fff1f2;border-color:#fda4af}.v44-day small{color:#475467}
  .v44-bar{height:6px;background:rgba(0,0,0,.08);border-radius:3px;overflow:hidden}.v44-bar i{display:block;height:100%;background:currentColor;opacity:.6}
  .v44-pg{margin:14px 0 4px}.v44-prow{display:grid;grid-template-columns:1fr 110px 150px;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #eef0ee}.v44-prow input,.v44-prow select{width:100%;padding:6px 8px;border:1px solid #cfd7d0;border-radius:8px}
  .v44-newprice{display:grid;grid-template-columns:auto 1fr 1fr 100px 130px auto;gap:8px;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid #dfe3e0}@media(max-width:900px){.v44-newprice{grid-template-columns:1fr 1fr}}
  .v44-settings label{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eef0ee}.v44-settings input[type=number]{width:90px;padding:6px 8px;border:1px solid #cfd7d0;border-radius:8px}.v44-days{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:10px}.v44-dchk{border:0!important;padding:0!important}
  .v44-counter{background:#faf5ff;border:2px solid #c084fc;border-radius:14px;padding:10px 14px;margin:0 0 12px}.v44-hand{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e9d5ff}.v44-hand>div{flex:1;display:flex;flex-direction:column}.v44-hand small{color:#6b21a8}
  `;
  document.head.appendChild(css);

  try { if (typeof v16ApplySnapshot === 'function') { const ba = v16ApplySnapshot; v16ApplySnapshot = function v44Apply() { const r = ba.apply(this, arguments); try { applyPrices(); } catch (_) {} return r; }; } } catch (_) {}
  applyPrices(); wrapComplete();
  let q = false, lastSig = '';
  const tick = () => {
    try { wrapComplete(); counterBanner(); } catch (e) { console.error('V44', e); }
    // live-refresh the tailor screen when other devices change jobs/handoffs (but not while typing/recording)
    if (state.posNav === 'tailor') {
      const sig = JSON.stringify([waiting().length, openAltOrders().map(o => o.id + (o.tailorStatus || '') + o.dueDate).join(','), JSON.stringify(S().prices).length]);
      if (sig !== lastSig) { lastSig = sig; const ae = document.activeElement; if (!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) && !(UI.rec)) renderPosContent(); }
    }
  };
  const obs = new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(() => { q = false; try { wrapComplete(); counterBanner(); } catch (_) {} }); } });
  const start = () => { obs.observe(document.body, { childList: true, subtree: true }); setInterval(tick, 3000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
