/* Hattan Cleaners customer app (V30).
 * One screen set for web, iPhone and Android. Talks only to /.netlify/functions/app-* ,
 * which return this customer's own data. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const icon = (name, size = 20, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICON_PATHS || {})[name] || ''}</svg>`;
  const pad = n => String(n).padStart(2, '0');
  const phoneFmt = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const dayLabel = s => { const d = parseYmd(s); if (!d) return ''; const t = new Date(); t.setHours(0, 0, 0, 0); const diff = Math.round((d - t) / 864e5); if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  const when = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const t = new Date(); const same = d.toDateString() === t.toDateString(); return same ? 'Today, ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const WINDOW_END = { '8:00 – 10:00 AM': 10, '10:00 AM – 12:00 PM': 12, '12:00 – 2:00 PM': 14, '2:00 – 4:00 PM': 16, '4:00 – 6:00 PM': 18, '9:00 – 11:00 AM': 11, '11:00 AM – 1:00 PM': 13, '1:00 – 4:00 PM': 16 };
  const SERVICE_ICONS = { drycleaning: 'sparkle', washfold: 'droplet', shirts: 'shirt', household: 'box', alterations: 'scissors' };
  const STAGE_TEXT = {
    counter: { dropped_off: ['Dropped Off', 'Checked in at our counter.'], in_cleaning: ['In Cleaning', 'Being cleaned & pressed.'], ready: ['Ready for Pickup', 'On the rack at 141 3rd Ave.'], picked_up: ['Picked Up', 'Thanks for choosing Hattan!'] },
    delivery: { scheduled: ['Pickup Scheduled', 'Your pickup is confirmed.'], picked_up: ['Picked Up', 'We have your items.'], in_cleaning: ['In Cleaning', 'Being cleaned & pressed.'], ready: ['Ready for Delivery', 'Packed and waiting to go out.'], out_for_delivery: ['Out for Delivery', 'On its way to you.'], delivered: ['Delivered', 'Enjoy your fresh clothes!'] },
  };
  const stageTitle = o => (STAGE_TEXT[o.channel][o.status] || [o.status])[0];

  async function api(name, opts = {}) {
    try {
      const r = await fetch(`/.netlify/functions/${name}`, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      let data = null; try { data = await r.json(); } catch (_) {}
      if (S.offline) { S.offline = false; renderOfflineBar(); }
      return { ok: r.ok, status: r.status, data: data || {} };
    } catch (e) {
      S.offline = true; renderOfflineBar();
      return { ok: false, status: 0, data: { error: "You're offline. Check your connection and try again." } };
    }
  }
  const post = (name, body, method = 'POST') => api(name, { method, body: JSON.stringify(body || {}) });

  function toast(msg, ok = true) {
    const host = $('#toasts'); if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (ok ? ' ok' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ic">${icon(ok ? 'checkcircle' : 'alerttriangle', 16)}</span><span>${esc(msg)}</span>`;
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 3200);
  }
  function openSheet(html) { $('#sheet-content').innerHTML = html; $('#sheet-overlay').classList.add('show'); $('#sheet').classList.add('show'); }
  function closeSheet() { $('#sheet-overlay').classList.remove('show'); $('#sheet').classList.remove('show'); unmountClover(); }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || 'Please wait…'; } else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; } }

  /* ------------------------------------------------------------------ state */
  const S = { data: null, tab: 'home', trackId: null, draft: null, step: 0, auth: { step: 'email', email: '' }, offline: false, loading: true };
  window.HattanApp = S;

  async function load(quiet) {
    const r = await api('app-data');
    if (r.status === 401) { S.data = null; renderAuth(); return false; }
    if (!r.ok) { if (!quiet) toast(r.data.error || 'Could not load your account', false); return false; }
    const prevStatus = S.data?.account?.status;
    S.data = r.data; S.loading = false;
    // Background refreshes never interrupt someone booking a pickup or using a sheet.
    const busyScreen = S.tab === 'schedule' || $('#sheet')?.classList.contains('show') || (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName));
    if (quiet && busyScreen && prevStatus === r.data.account?.status) return true;
    route();
    return true;
  }
  function route() {
    const st = S.data?.account?.status;
    if (!S.data) return renderAuth();
    if (st === 'new') return renderSignup();
    if (st === 'pending') return renderPending();
    if (st === 'rejected') return renderRejected();
    renderShell();
  }

  /* ------------------------------------------------------------------ sign in */
  function authFrame(inner) {
    $('#root').innerHTML = `<div class="auth-scroll"><div class="auth">
      <div class="auth-top"><div class="auth-logo" role="img" aria-label="Hattan Cleaners"></div><h1>Hattan Cleaners</h1><p>Gramercy's dry cleaner since 1977</p></div>
      <div class="auth-card">${inner}
        <div class="auth-foot">Questions? <a href="tel:+12124771740">(212) 477-1740</a><br><a href="https://hattancleaners.com/privacy.html" target="_blank" rel="noopener">Privacy &amp; Terms</a></div>
      </div></div></div>`;
  }
  function renderAuth() {
    const a = S.auth;
    if (a.step === 'email') {
      authFrame(`<h2>Sign in or create an account</h2>
        <p class="lead">Enter your email and we'll send you a 6-digit code. No password needed.</p>
        <form id="f-email" novalidate>
          <div class="field"><label class="field-label" for="in-email">Email</label>
          <input class="text-input" id="in-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="you@example.com" value="${esc(a.email)}" required></div>
          <button class="btn btn-primary btn-block" id="b-send" type="submit">Email me a code</button>
        </form>`);
      $('#f-email').onsubmit = async e => {
        e.preventDefault();
        const email = $('#in-email').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address', false);
        const b = $('#b-send'); busy(b, true, 'Sending…');
        const r = await post('app-auth', { action: 'start', email });
        busy(b, false);
        if (!r.ok) return toast(r.data.error || 'Could not send the code', false);
        a.email = email; a.step = 'code'; renderAuth();
      };
      setTimeout(() => $('#in-email')?.focus(), 50);
    } else {
      authFrame(`<h2>Check your email</h2>
        <p class="lead">We sent a 6-digit code to <strong>${esc(a.email)}</strong>. It can take a minute — check spam too.</p>
        <form id="f-code" novalidate>
          <div class="field"><label class="field-label" for="in-code">Code</label>
          <input class="text-input code-input" id="in-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="••••••"></div>
          <button class="btn btn-primary btn-block" id="b-verify" type="submit">Sign in</button>
        </form>
        <div class="row-gap" style="justify-content:space-between;margin-top:10px">
          <button class="link-btn" id="b-resend">Send a new code</button><button class="link-btn" id="b-change">Use a different email</button>
        </div>`);
      const inp = $('#in-code');
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value.length === 6) $('#f-code').requestSubmit(); };
      $('#f-code').onsubmit = async e => {
        e.preventDefault();
        if (inp.value.length !== 6) return toast('Enter the 6-digit code', false);
        const b = $('#b-verify'); busy(b, true, 'Signing in…');
        const r = await post('app-auth', { action: 'verify', email: a.email, code: inp.value });
        busy(b, false);
        if (!r.ok) { inp.value = ''; return toast(r.data.error || 'That code did not work', false); }
        a.step = 'email'; S.tab = 'home';
        await load();
      };
      $('#b-resend').onclick = async () => { const r = await post('app-auth', { action: 'start', email: a.email }); toast(r.ok ? 'New code sent' : (r.data.error || 'Could not send'), r.ok); };
      $('#b-change').onclick = () => { a.step = 'email'; renderAuth(); };
      setTimeout(() => inp.focus(), 50);
    }
  }

  const smsDisclosure = `By checking this box, you agree to receive order updates, receipts and store notices by text from Hattan Cleaners at this number. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to purchase. <a href="https://hattancleaners.com/privacy.html" target="_blank" rel="noopener">Terms &amp; Privacy</a>`;
  function renderSignup() {
    authFrame(`<h2>Welcome! Let's set up your account</h2>
      <p class="lead">Signed in as <strong>${esc(S.data.account.email)}</strong>. If you're already a Hattan customer, use the phone number we have on file and we'll connect your orders.</p>
      <form id="f-signup" novalidate>
        <div class="field"><label class="field-label" for="su-name">Full name</label><input class="text-input" id="su-name" autocomplete="name" placeholder="First and last name"></div>
        <div class="field"><label class="field-label" for="su-phone">Mobile number</label><input class="text-input" id="su-phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(212) 555-0100"></div>
        <div class="field"><label class="field-label" for="su-street">Address for pickup &amp; delivery <span class="muted" style="font-weight:500">(optional)</span></label><input class="text-input" id="su-street" autocomplete="address-line1" placeholder="Street address"></div>
        <div class="two-col field"><input class="text-input" id="su-apt" autocomplete="address-line2" placeholder="Apt / unit"><input class="text-input" id="su-zip" inputmode="numeric" autocomplete="postal-code" placeholder="ZIP"></div>
        <label class="check-row field"><input type="checkbox" id="su-sms"><span>${smsDisclosure}</span></label>
        <button class="btn btn-primary btn-block" id="b-signup" type="submit">Create my account</button>
      </form>
      <button class="link-btn" id="b-out" style="margin-top:8px">Sign out</button>`);
    $('#f-signup').onsubmit = async e => {
      e.preventDefault();
      const body = { action: 'signup', name: $('#su-name').value, phone: $('#su-phone').value, smsOn: $('#su-sms').checked, address: { street: $('#su-street').value, apartment: $('#su-apt').value, zip: $('#su-zip').value } };
      const b = $('#b-signup'); busy(b, true, 'Setting up…');
      const r = await post('app-action', body);
      busy(b, false);
      if (!r.ok) return toast(r.data.error || 'Could not create the account', false);
      await load();
      if (r.data.status === 'linked') toast('Welcome to Hattan Cleaners!');
    };
    $('#b-out').onclick = signOut;
  }
  function renderPending() {
    authFrame(`<div class="center"><div class="success-ring" style="background:var(--gold-soft);color:var(--gold)">${icon('lock', 36, 1.8)}</div></div>
      <h2 class="center">We found your account</h2>
      <p class="lead center">This phone number is already on file at our shop. To keep your orders private, we'll confirm it's you before connecting them — usually the same business day. You'll see everything here as soon as it's done.</p>
      <a class="btn btn-primary btn-block" href="tel:+12124771740">${icon('phone', 16)} Call to speed it up</a>
      <button class="btn btn-ghost btn-block" id="b-check" style="margin-top:10px">Check again</button>
      <button class="link-btn" id="b-out" style="margin-top:8px;width:100%">Sign out</button>`);
    $('#b-check').onclick = async () => { await load(); if (S.data?.account?.status === 'pending') toast('Not confirmed yet — we\'ll get to it soon', false); };
    $('#b-out').onclick = signOut;
  }
  function renderRejected() {
    authFrame(`<h2>Please contact us</h2><p class="lead">We couldn't confirm this account online. Call or stop by the counter and we'll get you set up.</p>
      <a class="btn btn-primary btn-block" href="tel:+12124771740">${icon('phone', 16)} (212) 477-1740</a>
      <button class="link-btn" id="b-out" style="margin-top:8px;width:100%">Sign out</button>`);
    $('#b-out').onclick = signOut;
  }
  async function signOut() { await post('app-auth', { action: 'logout' }); S.data = null; S.auth = { step: 'email', email: '' }; closeSheet(); renderAuth(); }

  /* ------------------------------------------------------------------ shell */
  const TABS = [['home', 'Home', 'home'], ['schedule', 'Schedule', 'calendar'], ['track', 'Orders', 'truck'], ['rewards', 'Rewards', 'star'], ['account', 'Account', 'user']];
  function header() {
    const c = S.data.customer, h = new Date().getHours();
    const titles = {
      home: [`${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${c.firstName ? ', ' + esc(c.firstName) : ''}`, `${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · Gramercy, NYC`],
      schedule: ['Schedule Pickup', 'Free pickup &amp; delivery within 10 blocks'],
      track: [S.trackId ? 'Order Details' : 'Your Orders', 'Live status on every ticket'],
      rewards: ['Hattan Rewards', 'Earn points, unlock perks'],
      account: ['Your Account', 'Profile, card &amp; preferences'],
    }[S.tab];
    const dot = updates().some(u => u.hot);
    return `<header class="app-header">
      <div class="header-row"><div class="brand-mark"><div class="logo-mark" role="img" aria-label="Hattan Cleaners logo"></div><div class="wordmark">Hattan Cleaners<small>Gramercy · Est. 1977</small></div></div>
      <div class="header-actions"><button class="icon-btn" id="b-bell" aria-label="Updates">${icon('bell', 18)}${dot ? '<i class="update-dot"></i>' : ''}</button></div></div>
      <div><div class="header-title">${titles[0]}</div><div class="header-sub">${titles[1]}</div></div>
    </header>`;
  }
  function renderShell() {
    $('#root').innerHTML = `${header()}<div id="offline"></div><main class="app-main" id="main"></main>
      <nav class="tabbar" aria-label="Main">${TABS.map(([id, label, ic]) => `<button class="tab-btn ${S.tab === id ? 'active' : ''}" data-tab="${id}" aria-current="${S.tab === id ? 'page' : 'false'}">${icon(ic, 21)}<span>${label}</span><i class="tab-dot"></i></button>`).join('')}</nav>`;
    document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => go(b.dataset.tab));
    $('#b-bell').onclick = openUpdates;
    renderOfflineBar();
    renderScreen();
  }
  function renderOfflineBar() { const el = $('#offline'); if (el) el.innerHTML = S.offline ? `<div class="offline-bar">You're offline — showing what we had last.</div>` : ''; }
  function go(tab, opts = {}) {
    S.tab = tab; S.trackId = opts.orderId || null;
    if (tab === 'schedule' && !opts.keepDraft) { S.draft = null; S.step = 0; }
    renderShell();
    const m = $('#main'); if (m) m.scrollTop = 0;
    if (!opts.noRefresh) load(true);
  }
  window.hcGo = go;
  function renderScreen() {
    const m = $('#main'); if (!m) return;
    ({ home: renderHome, schedule: renderSchedule, track: renderTrack, rewards: renderRewards, account: renderAccount })[S.tab](m);
  }

  /* ------------------------------------------------------------------ home */
  const active = () => (S.data.orders || []).filter(o => !o.done);
  const payable = () => (S.data.orders || []).filter(o => o.canPay);
  function orderCard(o) {
    const sub = o.channel === 'delivery' && o.status === 'scheduled'
      ? [['Pickup', dayLabel(o.pickupDate)], ['Window', o.window]]
      : [['Placed', when(o.createdAt) || '—'], [o.status === 'ready' ? 'Ready' : 'Due', o.dueDate ? dayLabel(o.dueDate) : '—'], ['Total', o.priced ? money(o.total) : 'Priced at pickup']];
    return `<div class="order-card" data-order="${esc(o.id)}" role="button" tabindex="0">
      <div class="oc-top"><div><div class="oc-eyebrow">${o.channel === 'delivery' ? 'Pickup' : 'Ticket'} #${esc(o.ticket)}</div><div class="oc-title">${esc(o.items)}</div></div><div class="status-chip"><i class="dot"></i>${esc(stageTitle(o))}</div></div>
      <div class="oc-meta">${sub.map(([k, v]) => `<div>${k}<strong>${esc(v)}</strong></div>`).join('')}</div>
      <div class="oc-cta">View status ${icon('chevronright', 15)}</div></div>`;
  }
  function orderRow(o) {
    const pill = o.amountDue ? `<span class="pill gold">${money(o.amountDue)} due</span>` : o.done ? `<span class="pill gray">${o.channel === 'delivery' ? 'Delivered' : 'Picked up'}</span>` : `<span class="pill">${esc(stageTitle(o))}</span>`;
    return `<div class="list-row" data-order="${esc(o.id)}" role="button" tabindex="0"><div class="row-icon">${icon(o.channel === 'delivery' ? 'truck' : 'receipt', 18)}</div>
      <div class="row-body"><div class="row-title">#${esc(o.ticket)} · ${esc(o.items)}</div><div class="row-sub">${esc(o.channel === 'delivery' && o.status === 'scheduled' ? `Pickup ${dayLabel(o.pickupDate)}, ${o.window}` : when(o.createdAt))}</div></div>
      <div class="row-trail">${pill}</div></div>`;
  }
  function bindOrders(root) { root.querySelectorAll('[data-order]').forEach(el => { const f = () => go('track', { orderId: el.dataset.order }); el.onclick = f; el.onkeydown = e => { if (e.key === 'Enter') f(); }; }); }
  function renderHome(m) {
    const act = active(), due = payable(), total = due.reduce((s, o) => s + o.amountDue, 0);
    const recent = (S.data.orders || []).filter(o => o.done).slice(0, 3);
    m.innerHTML = `
      <div class="section-title">Your Orders${act.length > 1 ? `<span class="link" id="l-all">See all</span>` : ''}</div>
      ${act.length ? orderCard(act[0]) + (act.length > 1 ? `<div class="card order-list" style="margin-top:12px">${act.slice(1, 4).map(orderRow).join('')}</div>` : '') : `
        <div class="empty-order-card"><div class="quick-icon">${icon('truck', 22)}</div><h3>No open orders</h3><p>Schedule a free pickup, or drop off at 141 3rd Ave — your tickets will show up here.</p>
        <button class="btn btn-primary" id="b-sched">${icon('plus', 16)} Schedule Pickup</button></div>`}
      ${total > 0 ? `<div class="due-card"><div><strong>${money(total)} due</strong><span>${due.length} ticket${due.length === 1 ? '' : 's'} · pay now or at pickup</span></div><button class="btn btn-gold btn-sm" id="b-pay">Pay</button></div>` : ''}
      <div class="section-title">Quick Actions</div>
      <div class="quick-grid">
        <div class="quick-item" data-go="schedule"><div class="quick-icon">${icon('calendar', 21)}</div><div class="quick-label">Schedule<br>Pickup</div></div>
        <div class="quick-item" data-go="track"><div class="quick-icon">${icon('truck', 21)}</div><div class="quick-label">My<br>Orders</div></div>
        <div class="quick-item" data-go="rewards"><div class="quick-icon">${icon('star', 21)}</div><div class="quick-label">${S.data.customer.points} pts<br>Rewards</div></div>
        <div class="quick-item" data-go="account"><div class="quick-icon">${icon('shirt', 21)}</div><div class="quick-label">Garment<br>Prefs</div></div>
      </div>
      <div class="section-title">Why Hattan</div>
      <div class="trust-strip">
        <div class="trust-item"><div class="ti-icon">${icon('star', 20)}</div><h4>Est. 1977</h4><p>Family-run in Gramercy for over 45 years.</p></div>
        <div class="trust-item"><div class="ti-icon">${icon('truck', 20)}</div><h4>Free Pickup</h4><p>Within 10 blocks of our storefront.</p></div>
        <div class="trust-item"><div class="ti-icon">${icon('sparkle', 20)}</div><h4>Expert Care</h4><p>Old-school craftsmanship, every item.</p></div>
        <a class="trust-item" href="tel:+12124771740" style="text-decoration:none;color:inherit"><div class="ti-icon">${icon('phone', 20)}</div><h4>We're Local</h4><p>141 3rd Ave · (212) 477-1740</p></a>
      </div>
      ${recent.length ? `<div class="section-title">Recent Activity<span class="link" id="l-hist">See all</span></div><div class="card order-list">${recent.map(orderRow).join('')}</div>` : ''}`;
    bindOrders(m);
    m.querySelectorAll('[data-go]').forEach(el => el.onclick = () => go(el.dataset.go));
    $('#b-sched') && ($('#b-sched').onclick = () => go('schedule'));
    $('#b-pay') && ($('#b-pay').onclick = () => openPay(due.map(o => o.id)));
    $('#l-all') && ($('#l-all').onclick = () => go('track'));
    $('#l-hist') && ($('#l-hist').onclick = () => go('track'));
  }

  /* ------------------------------------------------------------------ schedule */
  function openDates() {
    const out = [], now = new Date();
    for (let i = 0; out.length < 7 && i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (d.getDay() === 0) continue;
      const ws = windowsFor(d, i === 0);
      if (!ws.length) continue;
      out.push({ date: ymd(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }), sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
    return out;
  }
  function windowsFor(d, isToday) {
    const all = S.data.config.timeWindows[d.getDay() === 6 ? 'saturday' : 'weekday'];
    if (!isToday) return all;
    const h = new Date().getHours();
    return all.filter(w => h < (WINDOW_END[w] || 0) - 1);
  }
  function newDraft() {
    const c = S.data.customer;
    return { services: [], addressId: c.addresses[0]?.id || '', newAddress: null, date: '', window: '', speed: 'standard', tags: [], notes: c.garmentPrefs?.notes || '' };
  }
  function renderSchedule(m) {
    if (!S.draft) { S.draft = newDraft(); S.step = 0; }
    const d = S.draft, cfg = S.data.config, steps = ['Services', 'Pickup', 'Options', 'Review'];
    let body = '';
    if (S.step === 0) {
      body = `<div class="wizard-head"><div class="wz-eyebrow">Step 1 of 4</div><h2>What needs cleaning?</h2><p>Pick everything you'd like us to take.</p></div>
        <div style="display:flex;flex-direction:column;gap:10px">${cfg.services.map(s => `
          <div class="service-tile ${d.services.includes(s.id) ? 'selected' : ''}" data-svc="${s.id}" role="checkbox" aria-checked="${d.services.includes(s.id)}" tabindex="0">
            <div class="st-icon">${icon(SERVICE_ICONS[s.id] || 'sparkle', 19)}</div><div class="st-body"><div class="st-title">${esc(s.name)}</div><div class="st-price">${esc(s.desc)}</div></div><div class="st-check">${icon('check', 13, 3)}</div></div>`).join('')}</div>
        <div class="helper-text">${icon('tag', 12)} Priced at our standard rates when we tag your items. <a href="https://hattancleaners.com/pricing.html" target="_blank" rel="noopener">See prices</a></div>
        <div class="wizard-footer"><button class="btn btn-primary btn-block" id="w-next" ${d.services.length ? '' : 'disabled'}>Continue ${icon('chevronright', 16)}</button></div>`;
    } else if (S.step === 1) {
      const dates = openDates();
      if (!dates.some(x => x.date === d.date)) { d.date = dates[0]?.date || ''; d.window = ''; }
      const sel = parseYmd(d.date), ws = sel ? windowsFor(sel, dayLabel(d.date) === 'Today') : [];
      const addrs = S.data.customer.addresses;
      body = `<div class="wizard-head"><div class="wz-eyebrow">Step 2 of 4</div><h2>Pickup details</h2><p>Where and when should we come by?</p></div>
        <span class="field-label">Pickup address</span>
        ${addrs.length ? `<div class="chip-row" style="margin-bottom:8px">${addrs.map(a => `<div class="chip ${d.addressId === a.id ? 'selected' : ''}" data-addr="${esc(a.id)}">${icon('mappin', 14)} ${esc(a.label)} · ${esc(a.street)}${a.apartment ? ' ' + esc(a.apartment) : ''}</div>`).join('')}</div>` : ''}
        <button class="link-btn" id="w-addr">${icon('plus', 14)} ${addrs.length ? 'Add another address' : 'Add your address'}</button>
        <div class="helper-text" style="margin:2px 0 16px">Free within 10 blocks of 141 3rd Ave. Farther away? We'll call to confirm.</div>
        <span class="field-label">Pickup day</span>
        <div class="chip-row" style="margin-bottom:18px">${dates.map(x => `<div class="chip ${d.date === x.date ? 'selected' : ''}" data-date="${x.date}">${x.label} <span class="chip-sub">${x.sub}</span></div>`).join('')}</div>
        <span class="field-label">Time window</span>
        <div class="chip-row">${ws.map(w => `<div class="chip ${d.window === w ? 'selected' : ''}" data-win="${esc(w)}">${icon('clock', 14)} ${esc(w)}</div>`).join('')}</div>
        <div class="wizard-footer"><button class="btn btn-ghost" id="w-back" aria-label="Back">${icon('chevronleft', 16)}</button><button class="btn btn-primary btn-block" id="w-next" ${d.window && d.addressId ? '' : 'disabled'}>Continue ${icon('chevronright', 16)}</button></div>`;
    } else if (S.step === 2) {
      body = `<div class="wizard-head"><div class="wz-eyebrow">Step 3 of 4</div><h2>How should we handle it?</h2><p>Turnaround and any special care.</p></div>
        <span class="field-label">Turnaround</span>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
          <div class="chip block ${d.speed === 'standard' ? 'selected' : ''}" data-speed="standard"><span>Standard · about 2 days</span><span class="chip-sub">Free</span></div>
          <div class="chip block ${d.speed === 'rush' ? 'selected' : ''}" data-speed="rush"><span>${icon('zap', 14)} Rush · next day</span><span class="chip-sub">+${money(10.31)}</span></div>
        </div>
        <span class="field-label">Care instructions</span>
        <div class="chip-row" style="margin-bottom:16px">${cfg.tags.map(t => `<div class="chip ${d.tags.includes(t.id) ? 'selected' : ''}" data-tag="${t.id}">${esc(t.label)}</div>`).join('')}</div>
        <span class="field-label">Notes for our team</span>
        <textarea id="w-notes" rows="3" maxlength="500" placeholder="e.g. Loose button on the navy blazer. Leave with doorman.">${esc(d.notes)}</textarea>
        <div class="wizard-footer"><button class="btn btn-ghost" id="w-back" aria-label="Back">${icon('chevronleft', 16)}</button><button class="btn btn-primary btn-block" id="w-next">Review ${icon('chevronright', 16)}</button></div>`;
    } else {
      const a = S.data.customer.addresses.find(x => x.id === d.addressId);
      body = `<div class="wizard-head"><div class="wz-eyebrow">Step 4 of 4</div><h2>Review &amp; confirm</h2><p>Here's your pickup.</p></div>
        <div class="card" style="margin-bottom:12px">
          <div class="list-row" style="padding-top:0;cursor:default"><div class="row-icon">${icon('mappin', 17)}</div><div class="row-body"><div class="row-title">${esc(a?.label || 'Address')}</div><div class="row-sub">${esc([a?.street, a?.apartment].filter(Boolean).join(', '))}</div></div></div>
          <div class="list-row" style="cursor:default"><div class="row-icon">${icon('calendar', 17)}</div><div class="row-body"><div class="row-title">${esc(dayLabel(d.date))}</div><div class="row-sub">${esc(d.window)}</div></div></div>
          <div class="list-row" style="cursor:default"><div class="row-icon">${icon('sparkle', 17)}</div><div class="row-body"><div class="row-title">${esc(d.services.map(id => cfg.services.find(s => s.id === id)?.name).join(' + '))}</div><div class="row-sub">${d.speed === 'rush' ? 'Rush · next day' : 'Standard · about 2 days'}${d.tags.length ? ' · ' + esc(d.tags.map(t => cfg.tags.find(x => x.id === t)?.label).join(', ')) : ''}</div></div></div>
          ${d.notes ? `<div class="list-row" style="cursor:default"><div class="row-icon">${icon('message', 17)}</div><div class="row-body"><div class="row-sub">${esc(d.notes)}</div></div></div>` : ''}
        </div>
        <div class="warn-banner"><span class="ic">${icon('receipt', 16)}</span><span>We'll count and price your items at the shop and send you a receipt. ${S.data.card ? `Your card •••• ${esc(S.data.card.last4)} can be charged when it's ready, or pay on delivery.` : 'Pay in the app or on delivery.'} Prices shown are card prices; cash is 3% less.</span></div>
        <div class="wizard-footer"><button class="btn btn-ghost" id="w-back" aria-label="Back">${icon('chevronleft', 16)}</button><button class="btn btn-primary btn-block" id="w-confirm">${icon('checkcircle', 17)} Confirm Pickup</button></div>`;
    }
    m.innerHTML = `<div class="wizard-steps">${steps.map((_, i) => `<i class="${i <= S.step ? 'done' : ''}"></i>`).join('')}</div>${body}`;
    const rer = () => renderSchedule(m);
    m.querySelectorAll('[data-svc]').forEach(el => el.onclick = () => { const i = d.services.indexOf(el.dataset.svc); i > -1 ? d.services.splice(i, 1) : d.services.push(el.dataset.svc); rer(); });
    m.querySelectorAll('[data-addr]').forEach(el => el.onclick = () => { d.addressId = el.dataset.addr; rer(); });
    m.querySelectorAll('[data-date]').forEach(el => el.onclick = () => { d.date = el.dataset.date; d.window = ''; rer(); });
    m.querySelectorAll('[data-win]').forEach(el => el.onclick = () => { d.window = el.dataset.win; rer(); });
    m.querySelectorAll('[data-speed]').forEach(el => el.onclick = () => { d.speed = el.dataset.speed; rer(); });
    m.querySelectorAll('[data-tag]').forEach(el => el.onclick = () => { const i = d.tags.indexOf(el.dataset.tag); i > -1 ? d.tags.splice(i, 1) : d.tags.push(el.dataset.tag); rer(); });
    $('#w-notes') && ($('#w-notes').oninput = e => { d.notes = e.target.value; });
    $('#w-addr') && ($('#w-addr').onclick = () => openAddress(null, id => { d.addressId = id; rer(); }));
    $('#w-next') && ($('#w-next').onclick = () => { S.step++; rer(); m.scrollTop = 0; });
    $('#w-back') && ($('#w-back').onclick = () => { S.step--; rer(); m.scrollTop = 0; });
    $('#w-confirm') && ($('#w-confirm').onclick = async e => {
      const b = e.currentTarget; busy(b, true, 'Booking…');
      const r = await post('app-action', { action: 'pickup', services: d.services, addressId: d.addressId, date: d.date, window: d.window, speed: d.speed, tags: d.tags, notes: d.notes });
      busy(b, false);
      if (!r.ok) return toast(r.data.error || 'Could not book the pickup', false);
      const when = `${dayLabel(d.date)}, ${d.window}`;
      S.draft = null; S.step = 0;
      m.innerHTML = `<div class="success-wrap"><div class="success-ring">${icon('checkcircle', 40, 1.6)}</div><h2>Pickup booked!</h2>
        <p>We'll see you ${esc(when.startsWith('Today') || when.startsWith('Tomorrow') ? when.toLowerCase() : 'on ' + when)}. Pickup #${esc(r.data.ticket)}.</p>
        <button class="btn btn-primary btn-block" id="s-track">${icon('truck', 16)} View this pickup</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="s-home">Back to Home</button></div>`;
      $('#s-track').onclick = () => go('track', { orderId: r.data.orderId });
      $('#s-home').onclick = () => go('home');
      load(true);
    });
  }

  /* ------------------------------------------------------------------ orders / tracking */
  function renderTrack(m) {
    const orders = S.data.orders || [];
    const o = S.trackId && orders.find(x => x.id === S.trackId);
    if (!o) {
      const act = orders.filter(x => !x.done), done = orders.filter(x => x.done);
      m.innerHTML = orders.length ? `
        ${act.length ? `<div class="section-title">Open</div><div class="card order-list">${act.map(orderRow).join('')}</div>` : ''}
        ${done.length ? `<div class="section-title">Completed</div><div class="card order-list">${done.slice(0, 30).map(orderRow).join('')}</div>` : ''}`
        : `<div class="empty-order-card"><div class="quick-icon">${icon('receipt', 22)}</div><h3>No orders yet</h3><p>Drop off at 141 3rd Ave or schedule a pickup — your tickets show up here.</p><button class="btn btn-primary" id="b-sched">${icon('plus', 16)} Schedule Pickup</button></div>`;
      bindOrders(m);
      $('#b-sched') && ($('#b-sched').onclick = () => go('schedule'));
      return;
    }
    const stageIds = o.stages;
    const eta = o.done ? (o.channel === 'delivery' ? 'Delivered' : 'Picked up — thank you!')
      : o.status === 'scheduled' ? `Pickup ${dayLabel(o.pickupDate)}, ${o.window}`
      : o.status === 'ready' ? (o.channel === 'delivery' ? 'Ready — delivery coming soon' : 'Ready for pickup now')
      : o.dueDate ? `Ready ${dayLabel(o.dueDate)}` : 'In progress';
    const lines = o.lines.length ? `<div class="line-items" style="margin-top:4px">${o.lines.map(l => `<div class="price-line"><span>${esc(l.qty)} × ${esc(l.label)}</span><span>${money(l.amount)}</span></div>`).join('')}</div>` : '';
    const disc = o.discount > 0.004 ? `<div class="price-line"><span>Discount</span><span>−${money(o.discount)}</span></div>` : '';
    const credit = o.storeCreditApplied > 0.004 ? `<div class="price-line"><span>Store credit</span><span>−${money(o.storeCreditApplied)}</span></div>` : '';
    m.innerHTML = `
      <button class="link-btn" id="b-back" style="margin:-6px 0 6px -4px">${icon('chevronleft', 15)} All orders</button>
      <div class="eta-banner"><span class="ic">${icon(o.done ? 'checkcircle' : 'clock', 22)}</span><div><strong>${esc(eta)}</strong><span>${o.channel === 'delivery' ? 'Pickup' : 'Ticket'} #${esc(o.ticket)} · ${esc(o.items)}</span></div></div>
      <div class="card">
        <div class="timeline">${stageIds.map((id, i) => {
          const [t, desc] = STAGE_TEXT[o.channel][id] || [id, ''];
          const cls = i < o.stageIndex || (o.done && i === o.stageIndex) ? 'done' : i === o.stageIndex ? 'active' : '';
          return `<div class="t-step ${cls}">${i < stageIds.length - 1 ? '<div class="t-line"></div>' : ''}<div class="t-node">${cls === 'done' ? icon('check', 15, 3) : cls === 'active' ? icon('sparkle', 14) : ''}</div><div class="t-body"><div class="t-title">${esc(t)}</div><div class="t-desc">${esc(desc)}</div></div></div>`;
        }).join('')}</div>
      </div>
      <div class="section-title">Details</div>
      <div class="card">
        ${o.channel === 'delivery' && o.address ? `<div class="price-line"><span class="muted">Address</span><span>${esc([o.address.street, o.address.apartment].filter(Boolean).join(', '))}</span></div>` : ''}
        ${o.priced ? `${lines}<div class="totals">${disc}${credit}<div class="price-line"><span class="pl-total">${o.paid ? 'Paid' : 'Total'}</span><span class="pl-total">${money(o.paid ? (o.total - o.discount - o.storeCreditApplied) : o.amountDue)}</span></div></div>
          ${o.paid ? `<div class="cash-note">${icon('checkcircle', 13)} Paid${o.paymentMethod ? ' · ' + esc(o.paymentMethod) : ''}</div>` : o.cardPriced && o.amountDue ? `<div class="cash-note">Card price shown. Paying cash or check at the counter: ${money(o.amountDueCash)}.</div>` : ''}`
          : `<div class="muted small">We'll count and price your items once they're at the shop.</div>`}
        ${o.notes ? `<div class="price-line"><span class="muted">Notes</span><span style="text-align:right;max-width:65%">${esc(o.notes)}</span></div>` : ''}
      </div>
      ${(o.proofs || []).map(p => `<div class="section-title">${p.kind === 'delivery' ? 'Delivery proof' : 'Pickup proof'}</div>
        <div class="card"><div class="row-title">${esc(p.kind === 'delivery' ? 'Delivered' : 'Picked up')} · ${esc(when(p.at))}</div>
          <div class="row-sub">${esc([p.method, p.recipient, p.driver ? 'by ' + p.driver : ''].filter(Boolean).join(' · '))}</div>
          ${p.photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Proof photo" style="width:100%;border-radius:14px;margin-top:10px;display:block"></a>`).join('')}
          ${p.gps ? '<div class="cash-note">' + icon('mappin', 12) + ' Location recorded at handoff</div>' : ''}</div>`).join('')}
      <div class="spacer"></div>
      ${o.canPay ? `<button class="btn btn-gold btn-block" id="b-pay1">${icon('creditcard', 16)} Pay ${money(o.amountDue)}</button><div class="spacer"></div>` : ''}
      ${o.receiptUrl ? `<a class="btn btn-ghost btn-block" href="${esc(o.receiptUrl)}" target="_blank" rel="noopener">${icon('receipt', 16)} View receipt</a>` : ''}
      ${o.canCancel ? `<button class="btn btn-ghost btn-block danger" id="b-cancel" style="margin-top:10px">Cancel this pickup</button>` : ''}
      <div class="section-title">Need help?</div>
      <div class="card"><a class="list-row" href="tel:+12124771740" style="text-decoration:none;color:inherit"><div class="row-icon">${icon('phone', 18)}</div><div class="row-body"><div class="row-title">Call the shop</div><div class="row-sub">(212) 477-1740 · ${esc(S.data.config.shop.hours)}</div></div></a></div>`;
    $('#b-back').onclick = () => go('track');
    $('#b-pay1') && ($('#b-pay1').onclick = () => openPay([o.id]));
    $('#b-cancel') && ($('#b-cancel').onclick = () => openSheet(`<h3>Cancel this pickup?</h3><p class="sheet-sub">${esc(dayLabel(o.pickupDate))}, ${esc(o.window)}</p>
      <button class="btn btn-primary btn-block" id="c-yes" style="background:var(--status-critical);box-shadow:none">Yes, cancel pickup</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="c-no">Keep it</button>`)
      || bindCancel(o));
  }
  function bindCancel(o) {
    $('#c-no').onclick = closeSheet;
    $('#c-yes').onclick = async e => { busy(e.currentTarget, true, 'Canceling…'); const r = await post('app-action', { action: 'cancelPickup', orderId: o.id }); closeSheet(); if (!r.ok) return toast(r.data.error || 'Could not cancel', false); toast('Pickup canceled'); await load(); go('track'); };
  }

  /* ------------------------------------------------------------------ pay */
  function openPay(ids) {
    const card = S.data.card;
    const list = payable().filter(o => ids.includes(o.id));
    if (!list.length) return toast('Nothing to pay right now');
    if (!card) return openCard(() => openPay(ids), 'Add a card to pay in the app');
    const sel = new Set(list.map(o => o.id));
    const draw = () => {
      const total = list.filter(o => sel.has(o.id)).reduce((s, o) => s + o.amountDue, 0);
      openSheet(`<h3>Pay with ${esc(card.brand)} •••• ${esc(card.last4)}</h3><p class="sheet-sub">Card prices shown. Paying cash at the counter is 3% less.</p>
        <div>${list.map(o => `<label class="pay-row"><input type="checkbox" data-pay="${esc(o.id)}" ${sel.has(o.id) ? 'checked' : ''}><span>#${esc(o.ticket)} · ${esc(o.items)}</span><span class="amt">${money(o.amountDue)}</span></label>`).join('')}</div>
        <button class="btn btn-primary btn-block" id="p-go" style="margin-top:14px" ${total > 0 ? '' : 'disabled'}>Pay ${money(total)}</button>
        <button class="link-btn" id="p-card" style="width:100%;margin-top:6px">Use a different card</button>`);
      document.querySelectorAll('[data-pay]').forEach(el => el.onchange = () => { el.checked ? sel.add(el.dataset.pay) : sel.delete(el.dataset.pay); draw(); });
      $('#p-card').onclick = () => openCard(() => openPay(ids));
      $('#p-go').onclick = async e => {
        const b = e.currentTarget; busy(b, true, 'Charging…');
        const attemptId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
        const r = await post('app-pay', { orderIds: [...sel], attemptId });
        busy(b, false);
        const paidAmt = (r.data.results || []).filter(x => x.ok && x.amount).reduce((s, x) => s + x.amount, 0);
        if (r.ok && r.data.ok) {
          openSheet(`<div class="success-wrap"><div class="success-ring">${icon('checkcircle', 40, 1.6)}</div><h2>Payment complete</h2><p>${money(paidAmt)} charged to ${esc(card.brand)} •••• ${esc(card.last4)}. A receipt is in each order.</p><button class="btn btn-primary btn-block" id="p-done">Done</button></div>`);
          $('#p-done').onclick = closeSheet;
        } else {
          openSheet(`<div class="success-wrap"><div class="success-ring" style="background:#fde9e7;color:var(--status-critical)">${icon('alerttriangle', 36, 1.8)}</div><h2>${paidAmt ? 'Partly paid' : 'Payment didn\'t go through'}</h2><p>${esc(r.data.error || 'The card was not charged.')}${paidAmt ? ` ${money(paidAmt)} was paid.` : ''}</p>
            <button class="btn btn-primary btn-block" id="p-retry">Try again</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="p-new">Use a different card</button></div>`);
          $('#p-retry').onclick = () => { load(true).then(() => openPay(ids)); };
          $('#p-new').onclick = () => openCard(() => openPay(ids));
        }
        load(true);
      };
    };
    draw();
  }

  /* ------------------------------------------------------------------ card (Clover hosted fields) */
  let cloverState = null;
  function unmountClover() { if (!cloverState) return; (cloverState.els || []).forEach(e => { try { e.unmount(); } catch (_) {} }); cloverState = null; }
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`) && window.Clover) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the secure card form')); document.head.appendChild(s); }); }
  function openCard(after, lead) {
    const cfg = S.data.config.clover;
    if (!cfg) return openSheet(`<h3>Card payments coming soon</h3><p class="sheet-sub">For now, pay at the counter or on delivery.</p><button class="btn btn-primary btn-block" onclick="document.getElementById('sheet-overlay').click()">OK</button>`);
    openSheet(`<h3>${S.data.card ? 'Replace your card' : 'Add a card'}</h3><p class="sheet-sub">${esc(lead || 'Your card is stored securely by Clover, our payment processor. We never see the full number.')}</p>
      <label class="field-label">Card number</label><div class="clover-field" id="cl-num"></div>
      <div class="two-col"><div><label class="field-label">Expiry</label><div class="clover-field" id="cl-date"></div></div><div><label class="field-label">CVV</label><div class="clover-field" id="cl-cvv"></div></div></div>
      <label class="field-label">ZIP</label><div class="clover-field" id="cl-zip"></div>
      <label class="check-row" style="margin:6px 0 14px"><input type="checkbox" id="cl-ok"><span>I authorize Hattan Cleaners to keep this card on file and charge it for my orders — payments I make in this app and tickets I choose to put on my card. I can remove it anytime in Account.</span></label>
      <div id="cl-status" class="helper-text" style="margin-bottom:10px">Loading secure card form…</div>
      <button class="btn btn-primary btn-block" id="cl-save" disabled>Save card</button>`);
    (async () => {
      try {
        await loadScript(cfg.sdkUrl);
        if (!window.Clover) throw new Error('Secure card form did not load');
        const clover = new window.Clover(cfg.publicToken, { merchantId: cfg.merchantId, locale: 'en-US' });
        const elements = clover.elements();
        const style = { body: { fontFamily: '-apple-system, system-ui, sans-serif', fontSize: '16px' }, input: { fontSize: '16px' } };
        const els = [['CARD_NUMBER', '#cl-num'], ['CARD_DATE', '#cl-date'], ['CARD_CVV', '#cl-cvv'], ['CARD_POSTAL_CODE', '#cl-zip']].map(([t, sel]) => { const e = elements.create(t, style); e.mount(sel); return e; });
        cloverState = { clover, els };
        $('#cl-status').textContent = '🔒 Secure fields ready';
        $('#cl-save').disabled = false;
      } catch (e) { const st = $('#cl-status'); if (st) st.textContent = e.message + ' — please try again, or pay at the counter.'; }
    })();
    $('#cl-save').onclick = async e => {
      if (!$('#cl-ok').checked) return toast('Please tick the authorization box', false);
      if (!cloverState) return;
      const b = e.currentTarget; busy(b, true, 'Saving…');
      try {
        const t = await cloverState.clover.createToken();
        if (t?.errors) throw new Error(Object.values(t.errors).join(' · '));
        if (!t?.token) throw new Error('Card could not be verified');
        const r = await post('app-card', { token: t.token, consent: true });
        if (!r.ok) throw new Error(r.data.error || 'Card could not be saved');
        closeSheet(); toast(`Card •••• ${r.data.card?.last4 || ''} saved`);
        await load(true);
        if (after) after();
      } catch (err) { busy(b, false); $('#cl-status').textContent = err.message; toast(err.message, false); }
    };
  }

  /* ------------------------------------------------------------------ rewards */
  function renderRewards(m) {
    const c = S.data.customer, next = c.nextTier;
    const pct = next ? Math.min(100, Math.round(((c.points - c.tier.min) / (next.min - c.tier.min)) * 100)) : 100;
    m.innerHTML = `
      <div class="rewards-hero"><div class="rh-top"><div class="kicker" style="color:var(--gold-soft)">Hattan Rewards</div><div class="rh-tier">${icon('star', 13)} ${esc(c.tier.name)}</div></div>
        <div class="rh-points">${c.points.toLocaleString()}<small>points</small></div>
        <div class="meter-track"><div class="meter-fill" style="width:${pct}%"></div></div>
        <div class="meter-labels"><span>${esc(c.tier.name)}</span><span>${next ? `${(next.min - c.points).toLocaleString()} pts to ${esc(next.name)}` : 'Top tier — thank you!'}</span></div></div>
      ${c.storeCredit > 0 ? `<div class="due-card" style="background:var(--brand-tint-1);border-color:var(--brand-tint-2)"><div><strong>${money(c.storeCredit)} store credit</strong><span>Applied at the counter on your next order</span></div></div>` : ''}
      <div class="section-title">How to earn</div>
      <div class="card"><div class="list-row" style="cursor:default;padding-top:0"><div class="row-icon">${icon('tag', 18)}</div><div class="row-body"><div class="row-title">1 point for every $1</div><div class="row-sub">On every paid order — counter, pickup or delivery</div></div></div>
        <div class="list-row" style="cursor:default"><div class="row-icon">${icon('gift', 18)}</div><div class="row-body"><div class="row-title">Redeem for store credit</div><div class="row-sub">Credit is used automatically on your next order</div></div></div></div>
      <div class="section-title">Redeem points</div>
      <div class="card">${S.data.config.rewards.map(r => `<div class="reward-card list-row" style="cursor:default"><div class="rc-icon">${icon('gift', 20)}</div><div class="rc-body"><div class="rc-title">${esc(r.title)}</div><div class="rc-sub">${esc(r.sub)}</div><div class="rc-cost">${r.cost.toLocaleString()} pts</div></div>
        <button class="btn btn-sm ${c.points >= r.cost ? 'btn-gold' : 'btn-ghost'}" data-redeem="${r.id}" ${c.points >= r.cost ? '' : 'disabled style="opacity:.5"'}>Redeem</button></div>`).join('')}</div>`;
    m.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
      const r = S.data.config.rewards.find(x => x.id === b.dataset.redeem);
      openSheet(`<h3>Redeem ${r.cost.toLocaleString()} points?</h3><p class="sheet-sub">${esc(r.title)} — ${money(r.value)} goes to your store credit and is used on your next order.</p>
        <button class="btn btn-gold btn-block" id="r-yes">Redeem</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="r-no">Not now</button>`);
      $('#r-no').onclick = closeSheet;
      $('#r-yes').onclick = async e => { busy(e.currentTarget, true); const res = await post('app-action', { action: 'redeem', rewardId: r.id }); closeSheet(); if (!res.ok) return toast(res.data.error || 'Could not redeem', false); toast(`${money(r.value)} added to your store credit`); S.data.customer = res.data.customer; renderShell(); };
    });
  }

  /* ------------------------------------------------------------------ account */
  function renderAccount(m) {
    const c = S.data.customer, card = S.data.card, p = c.garmentPrefs;
    const seg = (key, opts) => `<div class="segmented" data-seg="${key}">${opts.map(([v, l]) => `<div class="seg ${p[key] === v ? 'selected' : ''}" data-v="${v}" role="button" tabindex="0">${l}</div>`).join('')}</div>`;
    m.innerHTML = `
      <div class="card profile-card"><div class="avatar">${esc(c.initials)}</div><div style="flex:1;min-width:0"><div class="p-name">${esc(c.name)}</div><div class="p-sub">${esc(c.tier.name)} member${c.memberSince ? ' · since ' + esc(c.memberSince) : ''}</div><div class="p-sub">${esc(phoneFmt(c.phone))}</div><div class="p-sub" style="overflow:hidden;text-overflow:ellipsis">${esc(S.data.account.email)}</div></div>
        <button class="icon-btn" id="b-edit" style="background:var(--brand-tint-1);color:var(--brand-deep);border:0" aria-label="Edit profile">${icon('edit', 16)}</button></div>
      <div class="section-title">Payment</div>
      <div class="card">${card ? `<div class="card-chip" style="padding-top:0"><div class="cc-icon">${esc((card.brand || 'CARD').slice(0, 4).toUpperCase())}</div><div class="row-body"><div class="row-title">•••• ${esc(card.last4)}</div><div class="row-sub">Card on file${card.expMonth ? ` · exp ${esc(card.expMonth)}/${esc(String(card.expYear).slice(-2))}` : ''}</div></div><span class="cc-default">Default</span></div>
          <div class="row-gap" style="margin-top:8px"><button class="btn btn-secondary btn-sm" id="b-card">Replace card</button><button class="btn btn-ghost btn-sm" id="b-rmcard">Remove</button></div>`
        : `<div class="list-row" style="padding:0" id="b-card"><div class="row-icon">${icon('creditcard', 18)}</div><div class="row-body"><div class="row-title">Add a card</div><div class="row-sub">Pay in the app, skip the wait at pickup</div></div><div class="row-trail">${icon('chevronright', 15)}</div></div>`}
        ${c.storeCredit > 0 ? `<div class="price-line" style="margin-top:8px"><span>Store credit</span><strong>${money(c.storeCredit)}</strong></div>` : ''}</div>
      <div class="section-title">Addresses<span class="link" id="b-addaddr">+ Add</span></div>
      ${c.addresses.length ? c.addresses.map(a => `<div class="addr-card"><div class="row-icon">${icon('mappin', 17)}</div><div class="grow"><div class="row-title">${esc(a.label)}</div><div class="row-sub">${esc([a.street, a.apartment].filter(Boolean).join(', '))}${a.zip ? ' · ' + esc(a.zip) : ''}</div>${a.notes ? `<div class="row-sub">${esc(a.notes)}</div>` : ''}</div><button class="link-btn" data-editaddr="${esc(a.id)}">Edit</button></div>`).join('') : `<div class="card muted small">No address yet — add one to book pickups.</div>`}
      <div class="section-title">Notifications</div>
      <div class="card"><div class="pref-row" style="padding-top:0"><div><div class="pr-label">Text me order updates</div><div class="pr-sub">Ready alerts, receipts, card charges &amp; store closures</div></div><div class="switch ${c.smsOn ? 'on' : ''}" id="sw-sms" role="switch" aria-checked="${c.smsOn}" tabindex="0"></div></div></div>
      <div class="section-title">Garment preferences</div>
      <div class="card">
        <span class="field-label">Starch</span>${seg('starch', [['none', 'None'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']])}
        <span class="field-label" style="margin-top:14px">Shirts</span>${seg('fold', [['hang', 'On hangers'], ['box', 'Boxed & folded']])}
        <div class="pref-row" style="margin-top:6px"><div><div class="pr-label">Fragrance-free detergent</div></div><div class="switch ${p.fragranceFree ? 'on' : ''}" id="sw-ff" role="switch" aria-checked="${!!p.fragranceFree}" tabindex="0"></div></div>
        <span class="field-label" style="margin-top:8px">Care notes</span><textarea id="pf-notes" rows="2" maxlength="300" placeholder="Anything we should always know">${esc(p.notes || '')}</textarea>
        <button class="btn btn-primary btn-block" id="b-prefs" style="margin-top:12px">Save preferences</button>
      </div>
      <div class="section-title">Help</div>
      <div class="card">
        <a class="list-row" href="tel:+12124771740" style="text-decoration:none;color:inherit;padding-top:0"><div class="row-icon">${icon('phone', 18)}</div><div class="row-body"><div class="row-title">Call us</div><div class="row-sub">(212) 477-1740</div></div></a>
        <a class="list-row" href="https://maps.app.goo.gl/mtoK4BakNMF6Xwuw7" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div class="row-icon">${icon('mappin', 18)}</div><div class="row-body"><div class="row-title">141 3rd Avenue</div><div class="row-sub">${esc(S.data.config.shop.hours)}</div></div></a>
        <a class="list-row" href="https://hattancleaners.com/privacy.html" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div class="row-icon">${icon('lock', 18)}</div><div class="row-body"><div class="row-title">Privacy &amp; Terms</div></div></a>
      </div>
      <button class="btn btn-ghost btn-block" id="b-out" style="margin-top:18px">${icon('logout', 16)} Sign out</button>
      <button class="link-btn danger" id="b-delete" style="width:100%;margin-top:8px">Delete my app account</button>
      <div class="center small muted" style="margin-top:6px">Hattan Cleaners app · v30.0</div>`;
    const prefs = { ...p };
    m.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('.seg').forEach(s => s.onclick = () => { prefs[g.dataset.seg] = s.dataset.v; g.querySelectorAll('.seg').forEach(x => x.classList.toggle('selected', x === s)); }));
    $('#sw-ff').onclick = e => { prefs.fragranceFree = !prefs.fragranceFree; e.currentTarget.classList.toggle('on', prefs.fragranceFree); };
    $('#b-prefs').onclick = async e => { prefs.notes = $('#pf-notes').value; busy(e.currentTarget, true, 'Saving…'); const r = await post('app-action', { action: 'prefs', garmentPrefs: prefs }); busy(e.currentTarget, false); if (!r.ok) return toast(r.data.error || 'Could not save', false); S.data.customer = r.data.customer; toast('Preferences saved'); };
    $('#sw-sms').onclick = () => {
      if (c.smsOn) return setSms(false);
      openSheet(`<h3>Get order updates by text?</h3><p class="sheet-sub">To ${esc(phoneFmt(c.phone))}</p><p class="small muted" style="line-height:1.5">${smsDisclosure}</p>
        <button class="btn btn-primary btn-block" id="sms-yes">Yes, text me</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="sms-no">Not now</button>`);
      $('#sms-no').onclick = closeSheet; $('#sms-yes').onclick = () => { closeSheet(); setSms(true); };
    };
    $('#b-card').onclick = () => openCard();
    $('#b-rmcard') && ($('#b-rmcard').onclick = () => {
      openSheet(`<h3>Remove card •••• ${esc(card.last4)}?</h3><p class="sheet-sub">You can add a new one anytime.</p><button class="btn btn-primary btn-block" id="rm-yes" style="background:var(--status-critical);box-shadow:none">Remove card</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="rm-no">Keep it</button>`);
      $('#rm-no').onclick = closeSheet;
      $('#rm-yes').onclick = async e => { busy(e.currentTarget, true); const r = await api('app-card', { method: 'DELETE' }); closeSheet(); if (!r.ok) return toast(r.data.error || 'Could not remove', false); toast('Card removed'); await load(true); };
    });
    $('#b-addaddr').onclick = () => openAddress(null);
    m.querySelectorAll('[data-editaddr]').forEach(b => b.onclick = () => openAddress(c.addresses.find(a => a.id === b.dataset.editaddr)));
    $('#b-edit').onclick = openProfile;
    $('#b-out').onclick = signOut;
    $('#b-delete').onclick = () => {
      openSheet(`<h3>Delete your app account?</h3><p class="sheet-sub">This removes your app sign-in and saved card. Your order history stays with the shop for our records. You can sign up again anytime.</p>
        <button class="btn btn-primary btn-block" id="d-yes" style="background:var(--status-critical);box-shadow:none">Delete my account</button><button class="btn btn-ghost btn-block" style="margin-top:10px" id="d-no">Cancel</button>`);
      $('#d-no').onclick = closeSheet;
      $('#d-yes').onclick = async e => { busy(e.currentTarget, true, 'Deleting…'); if (S.data.card) await api('app-card', { method: 'DELETE' }); const r = await post('app-action', { action: 'deleteAccount' }); if (!r.ok) { busy(e.currentTarget, false); return toast(r.data.error || 'Could not delete', false); } closeSheet(); S.data = null; S.auth = { step: 'email', email: '' }; renderAuth(); toast('Your app account was deleted'); };
    };
  }
  async function setSms(on) {
    const r = await post('app-action', { action: 'sms', on });
    if (!r.ok) return toast(r.data.error || 'Could not update', false);
    S.data.customer = r.data.customer; toast(on ? "You'll get order updates by text" : 'Text updates turned off'); renderShell();
  }
  function openProfile() {
    const c = S.data.customer;
    openSheet(`<h3>Your details</h3><p class="sheet-sub">Email: ${esc(S.data.account.email)}</p>
      <div class="field"><label class="field-label" for="pr-name">Full name</label><input class="text-input" id="pr-name" value="${esc(c.name)}" autocomplete="name"></div>
      <div class="field"><label class="field-label" for="pr-phone">Mobile number</label><input class="text-input" id="pr-phone" type="tel" value="${esc(phoneFmt(c.phone))}" autocomplete="tel"></div>
      <button class="btn btn-primary btn-block" id="pr-save">Save</button>`);
    $('#pr-save').onclick = async e => { busy(e.currentTarget, true, 'Saving…'); const r = await post('app-action', { action: 'profile', name: $('#pr-name').value, phone: $('#pr-phone').value }); busy(e.currentTarget, false); if (!r.ok) return toast(r.data.error || 'Could not save', false); S.data.customer = r.data.customer; closeSheet(); toast('Saved'); renderShell(); };
  }
  function openAddress(a, after) {
    const x = a || { label: 'Home', street: '', apartment: '', zip: '', notes: '' };
    openSheet(`<h3>${a ? 'Edit address' : 'Add an address'}</h3><p class="sheet-sub">Free pickup &amp; delivery within 10 blocks of 141 3rd Ave.</p>
      <div class="chip-row field">${['Home', 'Work', 'Other'].map(l => `<div class="chip ${x.label === l ? 'selected' : ''}" data-lbl="${l}">${l}</div>`).join('')}</div>
      <div class="field"><input class="text-input" id="ad-street" placeholder="Street address" autocomplete="address-line1" value="${esc(x.street)}"></div>
      <div class="two-col field"><input class="text-input" id="ad-apt" placeholder="Apt / unit" autocomplete="address-line2" value="${esc(x.apartment)}"><input class="text-input" id="ad-zip" placeholder="ZIP" inputmode="numeric" autocomplete="postal-code" value="${esc(x.zip)}"></div>
      <div class="field"><input class="text-input" id="ad-notes" placeholder="Delivery notes (doorman, buzzer…)" value="${esc(x.notes)}"></div>
      <button class="btn btn-primary btn-block" id="ad-save">Save address</button>
      ${a ? '<button class="link-btn danger" id="ad-del" style="width:100%;margin-top:6px">Delete address</button>' : ''}`);
    let label = x.label;
    document.querySelectorAll('[data-lbl]').forEach(el => el.onclick = () => { label = el.dataset.lbl; document.querySelectorAll('[data-lbl]').forEach(z => z.classList.toggle('selected', z === el)); });
    $('#ad-save').onclick = async e => {
      busy(e.currentTarget, true, 'Saving…');
      const r = await post('app-action', { action: 'address', address: { id: a?.id, label, street: $('#ad-street').value, apartment: $('#ad-apt').value, zip: $('#ad-zip').value, notes: $('#ad-notes').value } });
      busy(e.currentTarget, false);
      if (!r.ok) return toast(r.data.error || 'Could not save', false);
      const before = new Set(S.data.customer.addresses.map(z => z.id));
      S.data.customer = r.data.customer; closeSheet(); toast('Address saved');
      const added = r.data.customer.addresses.find(z => !before.has(z.id));
      if (after) after(a ? a.id : added?.id); else renderShell();
    };
    $('#ad-del') && ($('#ad-del').onclick = async () => { const r = await post('app-action', { action: 'address', op: 'delete', id: a.id }); if (!r.ok) return toast(r.data.error || 'Could not delete', false); S.data.customer = r.data.customer; closeSheet(); renderShell(); });
  }

  /* ------------------------------------------------------------------ updates (bell) */
  function updates() {
    const out = [];
    (S.data?.orders || []).slice(0, 25).forEach(o => {
      if (o.amountDue && o.status === 'ready') out.push({ hot: true, icon: 'creditcard', title: `#${o.ticket} is ready — ${money(o.amountDue)} due`, at: o.readyAt || o.createdAt, id: o.id });
      else if (o.status === 'ready') out.push({ hot: true, icon: 'checkcircle', title: `#${o.ticket} is ready${o.channel === 'delivery' ? ' — delivery coming soon' : ' for pickup'}`, at: o.readyAt || o.createdAt, id: o.id });
      else if (o.status === 'scheduled') out.push({ icon: 'calendar', title: `Pickup ${dayLabel(o.pickupDate)}, ${o.window}`, at: o.createdAt, id: o.id });
      else if (!o.done) out.push({ icon: 'sparkle', title: `#${o.ticket} is ${stageTitle(o).toLowerCase()}`, at: o.createdAt, id: o.id });
      else if (o.status === 'delivered' && (o.proofs || []).length) out.push({ hot: false, icon: 'camera', title: `#${o.ticket} delivered — see photo`, at: o.proofs[0].at, id: o.id });
      else if (o.paid && o.paidAt) out.push({ icon: 'receipt', title: `Paid ${money(o.total - o.discount - o.storeCreditApplied)} for #${o.ticket}`, at: o.paidAt, id: o.id });
    });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  }
  function openUpdates() {
    const list = updates();
    openSheet(`<h3>Updates</h3><p class="sheet-sub">Your orders at a glance</p>${list.length ? list.map(u => `<div class="list-row" data-u="${esc(u.id)}"><div class="row-icon">${icon(u.icon, 18)}</div><div class="row-body"><div class="row-title">${esc(u.title)}</div><div class="row-sub">${esc(when(u.at))}</div></div></div>`).join('') : '<p class="muted small">Nothing new right now.</p>'}
      <button class="btn btn-ghost btn-block" style="margin-top:14px" id="u-close">Close</button>`);
    $('#u-close').onclick = closeSheet;
    document.querySelectorAll('[data-u]').forEach(el => el.onclick = () => { closeSheet(); go('track', { orderId: el.dataset.u }); });
  }

  /* ------------------------------------------------------------------ boot */
  $('#sheet-overlay').onclick = closeSheet;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.data) load(true); });
  setInterval(() => { if (!document.hidden && S.data && !$('#sheet').classList.contains('show')) load(true); }, 60000);
  window.addEventListener('online', () => { if (S.data) load(true); });
  $('#root').innerHTML = `<div class="app-header" style="min-height:120px"></div><main class="app-main"><div class="skeleton"></div><div class="spacer"></div><div class="skeleton" style="height:90px"></div></main>`;
  load();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
