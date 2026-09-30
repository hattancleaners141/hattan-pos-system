/* Hattan Cleaners driver app (V31).
 * Route for the day → at each stop scan every ticket, take photo proof (time, GPS and address
 * are stamped on the photo and saved), choose who received it, complete. Customers see the
 * photo in their app and receipt link, and get a text when texting is on.
 * Works through spotty lobby signal: photos and completions wait in an on-phone outbox and
 * send themselves when the connection comes back. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, size = 20, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICON_PATHS || {})[n] || ''}</svg>`;
  const money = n => '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const phoneFmt = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
  const time = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const SHOP_ADDR = '141 3rd Ave, New York, NY 10003';
  const METHODS = ['Handed to customer', 'Left with doorman', 'Front desk / concierge', 'Mailroom / package room', 'Left at door'];
  const FAIL_REASONS = ['No one to receive it', 'Building would not accept', 'Could not get access', 'Wrong / missing address', 'Customer asked to reschedule', 'Other'];

  async function api(name, opts = {}) {
    try {
      const r = await fetch(`/.netlify/functions/${name}`, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      let data = {}; try { data = await r.json(); } catch (_) {}
      return { ok: r.ok, status: r.status, data, net: true };
    } catch (e) { return { ok: false, status: 0, data: { error: 'No connection' }, net: false }; }
  }
  const post = (n, b) => api(n, { method: 'POST', body: JSON.stringify(b || {}) });
  function toast(msg, ok = true) {
    const el = document.createElement('div'); el.className = 'toast' + (ok ? ' ok' : ''); el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ic">${icon(ok ? 'checkcircle' : 'alerttriangle', 16)}</span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3400);
  }
  function openSheet(html) { $('#sheet-content').innerHTML = html; $('#sheet-overlay').classList.add('show'); $('#sheet').classList.add('show'); }
  function closeSheet() { stopScanner(); $('#sheet-overlay').classList.remove('show'); $('#sheet').classList.remove('show'); }
  $('#sheet-overlay').onclick = closeSheet;
  const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };

  /* ------------------------------------------------------------ on-phone outbox (IndexedDB) */
  const DB = { db: null };
  function idb() {
    if (DB.db) return Promise.resolve(DB.db);
    return new Promise((res, rej) => { const r = indexedDB.open('hattan-driver', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { DB.db = r.result; res(DB.db); }; r.onerror = () => rej(r.error); });
  }
  async function kvGet(k) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch (_) { return undefined; } }
  async function kvSet(k, v) { try { const db = await idb(); await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (_) {} }

  /* ------------------------------------------------------------ state */
  const S = { me: null, route: null, stopId: null, work: {}, order: [], outbox: [], sending: false };
  window.HattanDriver = S;
  const today = () => new Date().toLocaleDateString('en-CA');
  async function loadLocal() {
    S.work = (await kvGet('work:' + today())) || {};
    S.order = (await kvGet('order:' + today())) || [];
    S.outbox = (await kvGet('outbox')) || [];
  }
  const saveWork = () => kvSet('work:' + today(), S.work);
  const saveOrder = () => kvSet('order:' + today(), S.order);
  const saveOutbox = () => kvSet('outbox', S.outbox);
  function work(stop) {
    if (!S.work[stop.id]) S.work[stop.id] = { scanned: [], photos: [], method: '', recipient: '', note: '', bags: 1 };
    return S.work[stop.id];
  }

  /* ------------------------------------------------------------ sign in */
  async function boot() {
    await loadLocal();
    const r = await api('session');
    if (r.ok && r.data.authenticated) { S.me = r.data.staff; return loadRoute(); }
    if (!r.net && (await kvGet('route'))) { S.route = await kvGet('route'); S.me = S.route.driver; toast('Offline — showing your saved route', false); return renderRoute(); }
    renderLogin();
  }
  let pickStaff = null, pin = '';
  async function renderLogin() {
    const r = await api('staff-list');
    const staff = (r.data.staff || []).filter(s => s.active !== false);
    const frame = inner => { $('#root').innerHTML = `<div class="auth-scroll"><div class="auth"><div class="auth-top"><div class="auth-logo"></div><h1>Hattan Driver</h1><p>Routes · scanning · photo proof</p></div><div class="auth-card">${inner}</div></div></div>`; };
    if (!pickStaff) {
      frame(`<h2>Who's driving?</h2><p class="lead">Tap your name, then enter your 4-digit PIN.</p>
        <div class="staff-list">${staff.map(s => `<button class="staff-btn" data-id="${esc(s.id)}"><span class="avatar">${esc(s.initials || s.name.slice(0, 2))}</span>${esc(s.name)}</button>`).join('') || '<p class="muted">No staff yet — a manager adds drivers in the POS Team screen.</p>'}</div>`);
      document.querySelectorAll('.staff-btn').forEach(b => b.onclick = () => { pickStaff = staff.find(s => s.id === b.dataset.id); pin = ''; renderLogin(); });
      return;
    }
    frame(`<h2 class="center">${esc(pickStaff.name)}</h2><div class="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="back" aria-label="Back">${icon('chevronleft', 20)}</button><button data-k="0">0</button><button data-k="del" aria-label="Delete">${icon('x', 20)}</button></div>`);
    document.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
      const k = b.dataset.k;
      if (k === 'back') { pickStaff = null; return renderLogin(); }
      if (k === 'del') { pin = pin.slice(0, -1); return renderLogin(); }
      if (pin.length >= 4) return;
      pin += k; renderLogin();
      if (pin.length === 4) {
        const res = await post('staff-login', { staffId: pickStaff.id, pin });
        if (!res.ok) { vibrate([60, 40, 60]); toast(res.data.error || 'Incorrect PIN', false); pin = ''; return renderLogin(); }
        S.me = { id: res.data.staff.id, name: res.data.staff.name }; pickStaff = null; pin = '';
        loadRoute();
      }
    });
  }
  async function signOut() { await post('staff-logout', {}); S.me = null; S.route = null; renderLogin(); }

  /* ------------------------------------------------------------ route */
  async function loadRoute(quiet) {
    const r = await api('driver-route');
    if (r.status === 401) { S.me = null; return renderLogin(); }
    if (!r.ok) { if (!quiet) toast(r.data.error || 'Could not load the route', false); if (!S.route) S.route = await kvGet('route'); return render(); }
    applyRoute(r.data);
  }
  function applyRoute(data) {
    S.route = data; S.me = data.driver || S.me; kvSet('route', data);
    const ids = data.stops.map(s => s.id);
    S.order = [...S.order.filter(id => ids.includes(id)), ...ids.filter(id => !S.order.includes(id))];
    saveOrder();
    render();
  }
  const stops = () => (S.route?.stops || []).slice().sort((a, b) => S.order.indexOf(a.id) - S.order.indexOf(b.id));
  // Same building = same street address, ignoring apartment, punctuation and spelling ("East 15th Street" = "E 15 St").
  const WORDS = { east: 'e', west: 'w', north: 'n', south: 's', street: 'st', str: 'st', avenue: 'ave', av: 'ave', place: 'pl', road: 'rd', boulevard: 'blvd', drive: 'dr', lane: 'ln', square: 'sq' };
  function bkey(s) {
    let t = String(s?.address?.street || '').toLowerCase().replace(/\b(apt|apartment|unit|suite|ste|fl|floor|rm|room)\b.*$/, '').replace(/#.*$/, '');
    t = t.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(w => WORDS[w] || w.replace(/^(\d+)(st|nd|rd|th)$/, '$1')).join(' ');
    return t;
  }
  // Stops in route order, with every stop at the same building pulled together at the first one's spot.
  function groups(list = stops()) {
    const out = [], byKey = new Map();
    for (const s of list) {
      const k = bkey(s) ? `${s.kind}:${bkey(s)}` : '';
      if (k && byKey.has(k)) { byKey.get(k).stops.push(s); continue; }
      const g = { key: k || `${s.kind}:solo:${s.id}`, kind: s.kind, stops: [s] }; out.push(g); if (k) byKey.set(k, g);
    }
    return out;
  }
  const sameBuilding = s => { const k = bkey(s); return k ? stops().filter(x => x.id !== s.id && bkey(x) === k) : []; };
  const unitLabel = s => s.address?.apartment ? `Apt ${s.address.apartment}` : 'No apt';
  function render() { if (S.stopId && (S.route?.stops || []).some(s => s.id === S.stopId)) renderStop(); else { S.stopId = null; renderRoute(); } }
  function mapsQuery(a) { return encodeURIComponent([a.street, a.city || 'New York', a.state || 'NY', a.zip].filter(Boolean).join(', ')); }
  function header(title, sub, back) {
    return `<header class="app-header"><div class="header-row">${back ? `<button class="icon-btn" id="h-back" aria-label="Back">${icon('chevronleft', 18)}</button>` : `<div class="brand-mark"><div class="logo-mark"></div><div class="wordmark">Hattan Driver<small>${esc(S.me?.name || '')}</small></div></div>`}
      <div class="header-actions"><button class="icon-btn" id="h-refresh" aria-label="Refresh">${icon('refresh', 17)}</button>${back ? '' : `<button class="icon-btn" id="h-out" aria-label="Sign out">${icon('logout', 17)}</button>`}</div></div>
      <div><div class="header-title">${title}</div><div class="header-sub">${sub}</div></div></header>${S.outbox.length ? `<div class="outbox">${icon('clock', 13)} ${S.outbox.length} completed stop${S.outbox.length === 1 ? '' : 's'} waiting for signal — they'll send automatically</div>` : ''}`;
  }
  function bindHeader() {
    $('#h-refresh') && ($('#h-refresh').onclick = () => { flushOutbox(); loadRoute(); });
    $('#h-out') && ($('#h-out').onclick = signOut);
    $('#h-back') && ($('#h-back').onclick = () => { S.stopId = null; renderRoute(); });
  }
  function renderRoute() {
    const list = stops(), r = S.route || { stops: [], openPickups: [], openDeliveries: [], done: [] };
    const openDel = r.openDeliveries || [], openPick = r.openPickups || [];
    const pick = list.filter(s => s.kind === 'pickup'), del = list.filter(s => s.kind === 'delivery');
    const left = list.length;
    const notOut = del.flatMap(s => s.orders).filter(o => o.status !== 'out_for_delivery').map(o => o.id);
    const pg = groups(pick), dg = groups(del);
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const cards = gs => gs.map((g, i) => g.stops.length > 1 ? buildingCard(g, i) : stopCard(g.stops[0], i, g.key)).join('');
    const openCard = (s, kind) => `<div class="stop-card ${kind}"><div class="stop-num">${icon('plus', 16)}</div><div class="stop-body"><div class="stop-name">${esc(s.customer.name)}</div><div class="stop-addr">${esc(s.address?.text || 'No address')}</div><div class="stop-meta"><span class="pill ${kind === 'pickup' ? 'gold' : ''}">${kind === 'pickup' ? 'Pickup' : 'Delivery'}${s.window ? ' ' + esc(s.window) : ''}</span>${kind === 'delivery' ? `<span class="pill gray">${count(s.orders.length, 'ticket', 'tickets')}</span>` : ''}</div></div><button class="btn btn-sm btn-primary" data-claim="${esc(s.orders.map(o => o.id).join(','))}" data-claim-kind="${kind}">Take it</button></div>`;
    $('#root').innerHTML = `${header(left ? `${count(left, 'stop', 'stops')} today` : 'No stops right now', [new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), left ? `${count(pick.length, 'pickup', 'pickups')} · ${count(del.length, 'delivery', 'deliveries')}` : '', r.done.length ? `${r.done.length} done` : ''].filter(Boolean).join(' · '))}
      <main class="app-main" id="main">
        ${left ? `<div class="big-actions"><a class="btn btn-primary" href="${routeUrl([...pg, ...dg].flatMap(g => g.stops))}" target="_blank" rel="noopener">${icon('navigation', 16)} Open route in Maps</a></div>` : ''}
        ${openDel.length ? `<div class="section-title sec-alert">${icon('alerttriangle', 14)} Deliveries with no driver — take them</div>${openDel.map(s => openCard(s, 'delivery')).join('')}` : ''}
        <div class="section-title sec-head"><span>${icon('box', 15)} Pickups</span><span class="sec-count">${pick.length}</span></div>
        ${pick.length ? cards(pg) : `<div class="sec-empty">No pickups assigned to you.</div>`}
        ${openPick.length ? `<div class="section-title">Open pickups — anyone can take</div>${openPick.map(s => openCard(s, 'pickup')).join('')}` : ''}
        <div class="section-title sec-head"><span>${icon('truck', 15)} Deliveries</span><span class="sec-count">${del.length}</span></div>
        ${del.length ? `${notOut.length ? `<button class="btn btn-gold btn-block" id="b-start" style="margin-bottom:10px">${icon('truck', 16)} Start deliveries</button>` : `<div class="sec-empty ok">${icon('checkcircle', 14)} Out for delivery</div>`}${cards(dg)}` : `<div class="sec-empty">No deliveries assigned to you.</div>`}
        ${r.done.length ? `<div class="section-title">Done today</div><div class="card">${r.done.map(d => `<div class="list-row" style="cursor:default"><div class="row-icon">${icon(d.kind === 'delivery' ? 'checkcircle' : 'box', 17)}</div><div class="row-body"><div class="row-title">#${esc(d.ticket)} · ${esc(d.name)}</div><div class="row-sub">${d.kind === 'delivery' ? 'Delivered' : 'Picked up'} ${esc(time(d.at))}</div></div></div>`).join('')}</div>` : ''}
      </main>`;
    bindHeader();
    document.querySelectorAll('[data-stop]').forEach(el => el.onclick = e => { if (e.target.closest('.reorder')) return; S.stopId = el.dataset.stop; renderStop(); });
    // Moving a stop moves its whole building.
    document.querySelectorAll('[data-move]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const m = b.dataset.move, cut = m.lastIndexOf('|'), key = m.slice(0, cut), d = m.slice(cut + 1), kind = key.split(':')[0];
      const gs = groups(stops().filter(s => s.kind === kind)); const i = gs.findIndex(g => g.key === key), j = i + Number(d);
      if (i < 0 || j < 0 || j >= gs.length) return;
      [gs[i], gs[j]] = [gs[j], gs[i]];
      const ids = gs.flatMap(g => g.stops.map(s => s.id));
      S.order = [...S.order.filter(id => !ids.includes(id)), ...ids]; saveOrder(); renderRoute();
    });
    document.querySelectorAll('[data-claim]').forEach(b => b.onclick = async () => { b.disabled = true; const res = await post('driver-route', { action: 'claim', kind: b.dataset.claimKind, orderIds: b.dataset.claim.split(',') }); if (!res.ok) { b.disabled = false; return toast(res.data.error || 'Could not take it', false); } toast(b.dataset.claimKind === 'delivery' ? 'Delivery added to your route' : 'Pickup added to your route'); applyRoute(res.data); });
    $('#b-start') && ($('#b-start').onclick = async e => { e.currentTarget.disabled = true; const res = await post('driver-route', { action: 'start', orderIds: notOut }); if (!res.ok) { e.currentTarget.disabled = false; return toast(res.data.error || 'Could not start', false); } toast('Customers now see "Out for delivery"'); applyRoute(res.data); });
  }
  const reorderBtns = key => `<div class="reorder"><button data-move="${esc(key)}|-1" aria-label="Move up">${icon('chevronleft', 14)}</button><button data-move="${esc(key)}|1" aria-label="Move down">${icon('chevronright', 14)}</button></div>`;
  function buildingCard(g, i) {
    const first = g.stops[0], a = first.address || {};
    const nDel = g.stops.filter(s => s.kind === 'delivery').length, nPick = g.stops.length - nDel;
    const tickets = g.stops.reduce((t, s) => t + s.orders.length, 0);
    return `<div class="bldg-card ${g.kind || ''}"><div class="bldg-head"><div class="stop-num">${i + 1}</div>
        <div class="stop-body"><div class="stop-name">${icon('home', 15)} ${esc(a.street || 'Same building')}</div>
          <div class="stop-meta"><span class="pill">${g.stops.length} stops here</span>${nDel ? `<span class="pill gray">${nDel} deliver${nDel === 1 ? 'y' : 'ies'} · ${tickets} ticket${tickets === 1 ? '' : 's'}</span>` : ''}${nPick ? `<span class="pill gold">${nPick} pickup${nPick === 1 ? '' : 's'}</span>` : ''}${a.notes ? `<span class="pill gray">Note</span>` : ''}</div></div>
        ${reorderBtns(g.key)}</div>
      ${g.stops.map(s => { const w = S.work[s.id] || {}; const sc = s.kind === 'delivery' ? s.orders.filter(o => o.codes.some(c => (w.scanned || []).includes(c))).length : 0;
        return `<div class="bldg-unit ${s.kind}" data-stop="${esc(s.id)}" role="button" tabindex="0"><div class="unit-apt">${esc(unitLabel(s))}</div>
          <div class="stop-body"><div class="stop-name">${esc(s.customer.name)}</div><div class="stop-meta"><span class="pill ${s.kind === 'pickup' ? 'gold' : ''}">${s.kind === 'pickup' ? 'Pickup' : 'Delivery'}</span>${s.kind === 'delivery' ? `<span class="pill gray">${sc}/${s.orders.length} scanned</span>` : ''}${(w.photos || []).length ? `<span class="pill gray">${w.photos.length} photo${w.photos.length === 1 ? '' : 's'}</span>` : ''}${s.orders.some(o => o.rush) ? '<span class="pill red">RUSH</span>' : ''}</div></div>
          <div class="unit-go">${icon('chevronright', 16)}</div></div>`; }).join('')}
    </div>`;
  }
  function stopCard(s, i, key) {
    const w = S.work[s.id] || {};
    const scanned = s.kind === 'delivery' ? s.orders.filter(o => o.codes.some(c => (w.scanned || []).includes(c))).length : 0;
    return `<div class="stop-card ${s.kind}" data-stop="${esc(s.id)}" role="button" tabindex="0"><div class="stop-num">${i + 1}</div>
      <div class="stop-body"><div class="stop-name">${esc(s.customer.name)}</div><div class="stop-addr">${esc(s.address?.text || 'No address on file')}</div>
        <div class="stop-meta"><span class="pill ${s.kind === 'pickup' ? 'gold' : ''}">${s.kind === 'pickup' ? 'Pickup' : 'Delivery'}</span>${s.window ? `<span class="pill gray">${esc(s.window)}</span>` : ''}
        ${s.kind === 'delivery' ? `<span class="pill gray">${scanned}/${s.orders.length} scanned</span>` : ''}${(w.photos || []).length ? `<span class="pill gray">${w.photos.length} photo${w.photos.length === 1 ? '' : 's'}</span>` : ''}${s.orders.some(o => o.rush) ? '<span class="pill red">RUSH</span>' : ''}</div></div>
      ${reorderBtns(key || 'solo:' + s.id)}</div>`;
  }
  function routeUrl(list) {
    const seen = new Set();
    const addrs = list.filter(s => { const k = bkey(s) || s.id; if (seen.has(k)) return false; seen.add(k); return true; }).filter(s => s.address?.street).map(s => [s.address.street, s.address.city || 'New York', s.address.zip].filter(Boolean).join(', '));
    if (!addrs.length) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(SHOP_ADDR);
    const dest = addrs[addrs.length - 1], way = addrs.slice(0, -1).slice(0, 9);
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(SHOP_ADDR)}&destination=${encodeURIComponent(dest)}${way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : ''}&travelmode=driving`;
  }

  /* ------------------------------------------------------------ one stop */
  function renderStop() {
    const s = (S.route.stops || []).find(x => x.id === S.stopId); if (!s) return renderRoute();
    const w = work(s), isDel = s.kind === 'delivery', a = s.address || {};
    const allScanned = !isDel || s.orders.every(o => o.codes.some(c => w.scanned.includes(c)));
    const photosOk = w.photos.length > 0;
    const due = s.orders.reduce((t, o) => t + (o.paid ? 0 : o.amountDue), 0);
    const ready = allScanned && photosOk && (!isDel || w.method);
    $('#root').innerHTML = `${header(esc(s.customer.name), `${isDel ? 'Delivery' : 'Pickup'}${a.apartment ? ' · Apt ' + esc(a.apartment) : ''}${s.window ? ' · ' + esc(s.window) : ''}`, true)}
      <main class="app-main" id="main">
        ${(() => { const here = sameBuilding(s); return here.length ? `<div class="bldg-banner">${icon('home', 15)} <span><strong>${here.length} more stop${here.length === 1 ? '' : 's'} at this building</strong> — scan any of their tickets here and they're saved to the right apartment.</span></div>
          <div class="chip-row" style="margin-bottom:12px">${here.map(x => `<div class="chip" data-go="${esc(x.id)}">${esc(unitLabel(x))} · ${esc(x.customer.name.split(' ')[0])}${x.kind === 'pickup' ? ' (pickup)' : ''}</div>`).join('')}</div>` : ''; })()}
        <div class="card"><div class="row-title">${esc(a.street || 'No address')}${a.apartment ? ', Apt ' + esc(a.apartment) : ''}</div><div class="row-sub">${esc([a.city, a.zip].filter(Boolean).join(' '))}</div>
          ${a.notes ? `<div class="warn-banner" style="margin-top:10px"><span class="ic">${icon('alerttriangle', 15)}</span><span>${esc(a.notes)}</span></div>` : ''}
          <div class="big-actions" style="margin-bottom:0"><a class="btn btn-primary" href="https://www.google.com/maps/dir/?api=1&destination=${mapsQuery(a)}&travelmode=driving" target="_blank" rel="noopener">${icon('navigation', 16)} Navigate</a>
          ${s.customer.phone ? `<a class="btn btn-secondary" href="tel:${esc(s.customer.phone.replace(/[^\d+]/g, ''))}">${icon('phone', 16)} ${esc(phoneFmt(s.customer.phone))}</a>` : '<button class="btn btn-secondary" disabled>No phone</button>'}</div></div>

        ${isDel ? `<div class="section-title">1 · Scan every ticket<span class="link">${s.orders.filter(o => o.codes.some(c => w.scanned.includes(c))).length}/${s.orders.length}</span></div>
          <div class="card">${s.orders.map(o => { const ok = o.codes.some(c => w.scanned.includes(c)); return `<div class="tix ${ok ? 'scanned' : ''}"><div class="ok">${ok ? icon('check', 14, 3) : ''}</div><div class="row-body"><div class="row-title">#${esc(o.ticket)} · ${esc(o.items || '')}</div><div class="row-sub">${o.pieces ? o.pieces + ' pc · ' : ''}${o.paid ? 'Paid' : 'Unpaid ' + money(o.amountDue)}${o.notes ? ' · ' + esc(o.notes) : ''}</div></div></div>`; }).join('')}
            <div class="big-actions" style="margin-bottom:0"><button class="btn btn-primary" id="b-scan">${icon('camera', 16)} Scan barcode</button><button class="btn btn-ghost" id="b-type">Type number</button></div></div>
          ${due > 0 ? `<div class="warn-banner" style="margin-top:10px"><span class="ic">${icon('creditcard', 15)}</span><span>${money(due)} unpaid. ${s.customer.cardOnFile ? `Card on file (${esc(s.customer.cardOnFile)}) — the shop charges it.` : 'No card on file — the shop will follow up. Deliver as normal.'}</span></div>` : ''}`
        : `<div class="section-title">What to pick up</div><div class="card">${s.orders.map(o => `<div class="row-title">#${esc(o.ticket)} · ${esc(o.items)}</div>${o.notes ? `<div class="row-sub">“${esc(o.notes)}”</div>` : ''}`).join('<div class="spacer"></div>')}
            ${s.prefs ? `<div class="row-sub" style="margin-top:8px">Prefs: ${esc([s.prefs.starch && 'starch ' + s.prefs.starch, s.prefs.fold === 'box' ? 'shirts boxed' : 'shirts on hangers', s.prefs.fragranceFree && 'fragrance-free'].filter(Boolean).join(' · '))}</div>` : ''}
            <div class="pref-row" style="margin-top:8px"><div class="pr-label">Bags picked up</div><div class="row-gap"><button class="btn btn-ghost btn-sm" id="bag-minus" aria-label="Fewer">−</button><strong style="min-width:22px;text-align:center;align-self:center">${w.bags}</strong><button class="btn btn-ghost btn-sm" id="bag-plus" aria-label="More">+</button></div></div></div>`}

        <div class="section-title">${isDel ? '2' : '1'} · Photo proof${isDel ? ' — show the order where you left it' : ' — bags at pickup'}</div>
        <div class="photos">${w.photos.map((p, i) => `<div class="photo" style="background-image:url('${esc(p.thumb)}')"><span class="st">${p.path ? '✓ saved' : 'waiting…'}</span><button class="rm" data-rm="${i}" aria-label="Remove photo">×</button></div>`).join('')}
          ${w.photos.length < 4 ? `<label class="add-photo" for="cam">${icon('camera', 26)}<span>${w.photos.length ? 'Add photo' : 'Take photo'}</span></label>` : ''}</div>

        ${isDel ? `<div class="section-title">3 · Who received it?</div>
          <div class="chip-row">${METHODS.map(m => `<div class="chip ${w.method === m ? 'selected' : ''}" data-m="${esc(m)}">${esc(m)}</div>`).join('')}</div>
          <div class="field" style="margin-top:12px"><input class="text-input" id="in-recip" placeholder="${w.method === 'Left with doorman' ? "Doorman's name" : 'Name (optional)'}" value="${esc(w.recipient)}"></div>` : ''}
        <div class="field"><input class="text-input" id="in-note" placeholder="Note for the shop (optional)" value="${esc(w.note)}"></div>
        <button class="btn btn-primary btn-block" id="b-done" ${ready ? '' : 'disabled'}>${icon('checkcircle', 17)} ${isDel ? 'Complete delivery' : 'Picked up'}</button>
        ${!ready ? `<div class="helper-text center">${!allScanned ? 'Scan every ticket · ' : ''}${!photosOk ? 'Take a photo · ' : ''}${isDel && !w.method ? 'Choose who received it' : ''}</div>` : ''}
        ${isDel ? `<button class="link-btn danger" id="b-fail" style="width:100%;justify-content:center;margin-top:10px">Couldn't deliver</button>
          ${!allScanned ? `<button class="link-btn" id="b-override" style="width:100%;justify-content:center">Barcode won't scan?</button>` : ''}` : ''}
      </main>`;
    bindHeader();
    document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { S.stopId = el.dataset.go; renderStop(); window.scrollTo(0, 0); });
    $('#b-scan') && ($('#b-scan').onclick = () => openScanner(s));
    $('#b-type') && ($('#b-type').onclick = () => typeCode(s));
    document.querySelectorAll('[data-m]').forEach(el => el.onclick = () => { w.method = el.dataset.m; saveWork(); renderStop(); });
    $('#in-recip') && ($('#in-recip').onchange = e => { w.recipient = e.target.value; saveWork(); });
    $('#in-note').onchange = e => { w.note = e.target.value; saveWork(); };
    $("#bag-minus") && ($("#bag-minus").onclick = () => { w.bags = Math.max(0, w.bags - 1); saveWork(); renderStop(); });
    $("#bag-plus") && ($("#bag-plus").onclick = () => { w.bags = Math.min(50, w.bags + 1); saveWork(); renderStop(); });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { w.photos.splice(Number(b.dataset.rm), 1); saveWork(); renderStop(); });
    $('#cam').onchange = e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(s, f); };
    $('#b-done').onclick = () => complete(s, isDel ? 'delivery' : 'pickup');
    $('#b-fail') && ($('#b-fail').onclick = () => failSheet(s));
    $('#b-override') && ($('#b-override').onclick = () => overrideSheet(s));
  }

  /* ------------------------------------------------------------ scanning */
  const norm = v => String(v || '').toUpperCase().replace(/\s/g, '');
  function codeVariants(raw) {
    const c = norm(raw), out = [c];
    const d = c.replace(/\D/g, ''); if (d) out.push('#' + d.replace(/^0+/, ''));
    const sub = /^(.*)-\d{2}$/.exec(c); if (sub) out.push(sub[1]);
    return out;
  }
  function acceptCode(s, raw) {
    const w = work(s), vars = codeVariants(raw);
    const hit = s.orders.find(o => o.codes.some(c => vars.includes(c)));
    if (hit) {
      const code = hit.codes.find(c => vars.includes(c)) || vars[0];
      if (!w.scanned.includes(code)) w.scanned.push(code);
      saveWork(); vibrate(40); toast(`✓ #${hit.ticket} scanned`); return true;
    }
    const other = (S.route.stops || []).find(x => x.id !== s.id && x.orders.some(o => o.codes.some(c => vars.includes(c))));
    if (other && other.kind === 'delivery' && bkey(other) && bkey(other) === bkey(s)) {
      const ow = work(other), o = other.orders.find(o => o.codes.some(c => vars.includes(c)));
      const code = o.codes.find(c => vars.includes(c)) || vars[0];
      if (!ow.scanned.includes(code)) ow.scanned.push(code);
      saveWork(); vibrate(40); toast(`✓ #${o.ticket} — saved to ${unitLabel(other)} (${other.customer.name})`); return 'other';
    }
    vibrate([80, 60, 80]);
    toast(other ? `Wrong stop — that ticket is for ${other.customer.name}` : `${raw} is not on this stop`, false);
    return false;
  }
  let scanner = null, lastCode = '', lastAt = 0;
  async function stopScanner() { if (scanner) { try { await scanner.stop(); } catch (_) {} try { scanner.clear(); } catch (_) {} scanner = null; } }
  function loadScanLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((res, rej) => { const el = document.createElement('script'); el.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'; el.onload = res; el.onerror = () => rej(new Error('Scanner could not load — check signal or type the number')); document.head.appendChild(el); });
  }
  async function openScanner(s) {
    openSheet(`<h3>Scan tickets</h3><p class="sheet-sub">Point the camera at each ticket's barcode.</p><div id="reader"></div>
      <div id="scan-list" class="helper-text" style="margin-top:10px"></div><button class="btn btn-primary btn-block" id="scan-done" style="margin-top:12px">Done</button>`);
    const upd = () => { const el = $('#scan-list'); if (!el) return; const all = [s, ...sameBuilding(s).filter(x => x.kind === 'delivery')];
      el.innerHTML = all.map(x => { const w = work(x); return `${all.length > 1 ? `<strong>${esc(unitLabel(x))}</strong> ` : ''}${x.orders.map(o => `${o.codes.some(c => w.scanned.includes(c)) ? '✅' : '⬜️'} #${esc(o.ticket)}`).join(' &nbsp; ')}`; }).join('<br>'); };
    upd();
    $('#scan-done').onclick = () => { closeSheet(); renderStop(); };
    try {
      await loadScanLib();
      const F = window.Html5QrcodeSupportedFormats;
      scanner = new window.Html5Qrcode('reader', { formatsToSupport: [F.CODE_128, F.CODE_39, F.QR_CODE, F.EAN_13], useBarCodeDetectorIfSupported: true, verbose: false });
      await scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(Math.min(h, w) * 0.45) }) }, text => {
        const now = Date.now(); if (text === lastCode && now - lastAt < 2500) return; lastCode = text; lastAt = now;
        const hit = acceptCode(s, text); if (hit === 'other') { upd(); return; }
        if (hit) { upd(); const r = $('#reader'); r && r.classList.add('scan-flash'); setTimeout(() => r && r.classList.remove('scan-flash'), 500);
          const w = work(s); if (s.orders.every(o => o.codes.some(c => w.scanned.includes(c)))) { toast('All tickets scanned'); setTimeout(() => { closeSheet(); renderStop(); }, 600); } }
      }, () => {});
    } catch (e) {
      const r = $('#reader'); if (r) r.innerHTML = `<div style="color:#fff;padding:24px;text-align:center">${esc(e?.message || 'Camera not available')}.<br>Allow camera access in your phone settings, or tap "Type number".</div>`;
    }
  }
  function typeCode(s) {
    openSheet(`<h3>Type the ticket number</h3><p class="sheet-sub">The number under the barcode, e.g. HAT-000482 or 482.</p>
      <input class="text-input" id="tc" inputmode="text" autocapitalize="characters" placeholder="Ticket number"><button class="btn btn-primary btn-block" id="tc-ok" style="margin-top:12px">Check</button>`);
    setTimeout(() => $('#tc')?.focus(), 50);
    $('#tc-ok').onclick = () => { const v = $('#tc').value.trim(); if (!v) return; const hit = acceptCode(s, v); if (hit === 'other') { $('#tc').value = ''; return; } if (hit) { closeSheet(); renderStop(); } };
  }
  function overrideSheet(s) {
    openSheet(`<h3>Barcode won't scan?</h3><p class="sheet-sub">First try "Type number". If the ticket is missing or unreadable, explain — the shop sees this note with the delivery.</p>
      <input class="text-input" id="ov" placeholder="e.g. tag torn off, verified by name on bag"><button class="btn btn-primary btn-block" id="ov-ok" style="margin-top:12px">Continue without scan</button>`);
    $('#ov-ok').onclick = () => { const v = $('#ov').value.trim(); if (v.length < 5) return toast('Write a short reason', false); const w = work(s); w.scanOverride = v; s.orders.forEach(o => { if (!o.codes.some(c => w.scanned.includes(c))) w.scanned.push(o.codes[0]); }); saveWork(); closeSheet(); renderStop(); };
  }

  /* ------------------------------------------------------------ photos */
  function getGPS() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }
  async function addPhoto(s, file) {
    const w = work(s);
    const gpsP = getGPS();
    try {
      const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const cw = Math.round(img.width * k), ch = Math.round(img.height * k);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
      g.drawImage(img, 0, 0, cw, ch);
      const gps = await gpsP; w.gps = gps || w.gps || null;
      // Stamp who / when / where on the photo itself.
      const band = Math.round(ch * 0.075), fs = Math.max(14, Math.round(band * 0.36));
      g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, ch - band, cw, band);
      g.fillStyle = '#fff'; g.font = `600 ${fs}px -apple-system, system-ui, sans-serif`; g.textBaseline = 'middle';
      const line1 = `Hattan Cleaners · ${s.kind === 'delivery' ? 'Delivered' : 'Picked up'} · #${s.orders.map(o => o.ticket).join(', #')}`;
      const line2 = `${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${s.address?.street || ''} · ${S.me?.name || ''}${gps ? ` · GPS ±${Math.round(gps.accuracy)}m` : ''}`;
      g.fillText(line1.slice(0, 90), 14, ch - band * 0.68); g.fillText(line2.slice(0, 90), 14, ch - band * 0.28);
      const dataUrl = c.toDataURL('image/jpeg', 0.72);
      const t = document.createElement('canvas'), tk = 240 / Math.max(cw, ch); t.width = Math.round(cw * tk); t.height = Math.round(ch * tk); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      const photo = { id: Math.random().toString(36).slice(2), thumb: t.toDataURL('image/jpeg', 0.6), path: '' };
      w.photos.push(photo); saveWork(); renderStop();
      await kvSet('photo:' + photo.id, dataUrl);
      uploadPhoto(s, photo);
    } catch (e) { toast('That photo could not be read — try again', false); }
  }
  async function uploadPhoto(s, photo) {
    const data = await kvGet('photo:' + photo.id); if (!data) return false;
    const r = await post('driver-photo', { orderIds: s.orders.map(o => o.id), kind: s.kind === 'pickup' ? 'pickup' : photo.kind || 'delivery', image: data });
    if (r.ok) { photo.path = r.data.path; saveWork(); if (S.stopId === s.id) renderStop(); return true; }
    if (r.net) toast(r.data.error || 'Photo upload failed', false);
    return false;
  }

  /* ------------------------------------------------------------ complete / fail */
  async function complete(s, kind, extra = {}) {
    const w = work(s);
    const job = { id: Math.random().toString(36).slice(2), stopId: s.id, kind, orderIds: s.orders.map(o => o.id), photoIds: w.photos.map(p => p.id), photos: w.photos.map(p => p.path), scanned: w.scanned, method: w.method, recipient: w.recipient, note: w.note, bags: kind === 'pickup' ? w.bags : null, scanOverride: w.scanOverride || '', gps: w.gps || null, name: s.customer.name, ...extra };
    const next = sameBuilding(s)[0];
    S.outbox.push(job); saveOutbox();
    S.route.stops = S.route.stops.filter(x => x.id !== s.id); kvSet('route', S.route);
    delete S.work[s.id]; saveWork();
    if (next) { S.stopId = next.id; renderStop(); window.scrollTo(0, 0); } else { S.stopId = null; renderRoute(); }
    toast(`${kind === 'attempt' ? 'Attempt recorded' : `${kind === 'delivery' ? 'Delivered' : 'Picked up'} — ${s.customer.name}`}${next ? ` · next here: ${unitLabel(next)}` : ''}`);
    flushOutbox();
  }
  async function flushOutbox() {
    if (S.sending || !S.outbox.length) return; S.sending = true;
    try {
      for (const job of S.outbox.slice()) {
        // upload any photos that didn't make it yet
        for (let i = 0; i < job.photoIds.length; i++) {
          if (job.photos[i]) continue;
          const data = await kvGet('photo:' + job.photoIds[i]); if (!data) continue;
          const r = await post('driver-photo', { orderIds: job.orderIds, kind: job.kind, image: data });
          if (!r.ok) { if (!r.net || r.status >= 500) return; job.photos[i] = null; continue; }
          job.photos[i] = r.data.path; saveOutbox();
        }
        const r = await post('driver-complete', { kind: job.kind, orderIds: job.orderIds, photos: job.photos.filter(Boolean), scanned: job.scanned, method: job.method, recipient: job.recipient, note: job.note, bags: job.bags, scanOverride: job.scanOverride, reason: job.reason, lat: job.gps?.lat, lng: job.gps?.lng, accuracy: job.gps?.accuracy });
        if (!r.net || r.status >= 500) return; // try again later
        S.outbox = S.outbox.filter(x => x.id !== job.id); saveOutbox();
        job.photoIds.forEach(id => kvSet('photo:' + id, null));
        if (r.ok) { applyRoute(r.data); if (job.kind === 'delivery') toast(`${job.name}: customer notified`); }
        else { toast(`${job.name}: ${r.data.error || 'not saved'} — reopen the stop`, false); loadRoute(true); }
      }
    } finally { S.sending = false; if (!S.stopId) renderRoute(); }
  }
  function failSheet(s) {
    openSheet(`<h3>Couldn't deliver</h3><p class="sheet-sub">The order stays on the shop's delivery list. A photo of the building/door helps.</p>
      <div class="chip-row">${FAIL_REASONS.map(r => `<div class="chip" data-r="${esc(r)}">${esc(r)}</div>`).join('')}</div>
      <button class="btn btn-primary btn-block" id="f-ok" style="margin-top:14px" disabled>Record attempt</button>`);
    let reason = '';
    document.querySelectorAll('[data-r]').forEach(el => el.onclick = () => { reason = el.dataset.r; document.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('selected', x === el)); $('#f-ok').disabled = false; });
    $('#f-ok').onclick = () => { closeSheet(); complete(s, 'attempt', { reason }); };
  }

  /* ------------------------------------------------------------ boot */
  window.addEventListener('online', () => { flushOutbox(); loadRoute(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) { flushOutbox(); if (!S.stopId) loadRoute(true); } });
  setInterval(() => { if (S.outbox.length) flushOutbox(); }, 20000);
  setInterval(() => { if (!document.hidden && S.me && !S.stopId && !$('#sheet').classList.contains('show')) loadRoute(true); }, 90000);
  $('#root').innerHTML = `<div class="app-header" style="min-height:120px"></div><main class="app-main"><div class="skeleton"></div></main>`;
  boot();
})();
