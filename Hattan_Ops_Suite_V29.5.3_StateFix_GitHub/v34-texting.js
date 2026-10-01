/* Hattan Ops Suite V34 — customer texting (Twilio, A2P-approved campaign)
 *
 * 1. Consent: staff read the approved question and press "Customer said YES" (or "No thanks").
 *    Shown on the counter after picking a customer who hasn't been asked yet, and on the
 *    customer profile. YES saves the number, time and staff member and sends the confirmation text.
 * 2. Automatic texts: drop-off thank-you, ready for pickup, picked up, card charged, card declined,
 *    card saved (delivered texts come from the driver app; 7/14-day reminders run on the server).
 *    The browser only says WHAT happened — the server re-checks the ticket, consent and STOP list,
 *    writes the message itself, and never sends the same text twice.
 * 3. Marketing → "Texts": on/off switches for each automatic text, store notices (hours changes,
 *    weather closures) to everyone opted in, recent messages and opt-outs.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const shared = () => { try { return typeof v16IsShared === 'function' && v16IsShared(); } catch (_) { return false; } };
  const applying = () => { try { return typeof v16Live !== 'undefined' && v16Live.applying; } catch (_) { return false; } };
  const staffName = () => { try { return (typeof v6CurrentStaff === 'function' && v6CurrentStaff()?.name) || 'Staff'; } catch (_) { return 'Staff'; } };
  const isManager = () => { try { return typeof v6IsManager === 'function' ? v6IsManager() : false; } catch (_) { return false; } };
  const e164 = raw => { const d = String(raw || '').replace(/\D/g, ''); if (d.length === 10 && /^[2-9]/.test(d)) return '+1' + d; if (d.length === 11 && d[0] === '1' && /^[2-9]/.test(d[1])) return '+' + d; return ''; };
  const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
  const T = window.hcTexts = { status: null, log: [], optOuts: [] };
  const on = () => !!(T.status && T.status.mode !== 'off' && T.status.twilioConfigured);

  async function loadStatus() {
    if (!shared()) return;
    const r = await v16Api('sms-admin');
    if (r.ok) { T.status = r.data.status; T.log = r.data.log || []; T.optOuts = r.data.optOuts || []; }
  }
  T.refresh = loadStatus;

  async function notify(payload) {
    if (!shared()) return { ok: false };
    try { if (typeof window.hcPushAndWait === 'function') await hcPushAndWait(); } catch (_) {}
    const r = await v16Api('sms-notify', { method: 'POST', body: JSON.stringify(payload) });
    return r;
  }

  // Plain-English reason a text did not go out.
  function why(r) {
    if (!r) return 'no answer from the server';
    if (r.networkError || r.status === 0) return 'no internet connection';
    if (r.status === 404) return 'the texting functions are not deployed yet (redeploy Netlify)';
    const d = r.data || {};
    if (d.error) return d.error;
    const reason = d.skipped || (r.ok ? '' : `server error ${r.status}`);
    if (/not on the test list/i.test(reason)) return 'Test mode is on and this number is not in SMS_TEST_NUMBERS in Netlify';
    if (/SMS_MODE/i.test(reason)) return 'SMS_MODE is off in Netlify — set it to test or live, then redeploy';
    if (/Twilio is not set up/i.test(reason)) return 'Twilio settings are missing in Netlify — add them, then redeploy';
    return reason || 'unknown reason';
  }
  T.why = why;

  /* ---------------- 1. consent ---------------- */
  const QUESTION = 'Would you like order updates from Hattan Cleaners by text at this number? That includes when your order is ready, receipts, card charges and store closures. Message frequency varies, message and data rates may apply, and you can reply STOP anytime to opt out.';
  function consentState(c) {
    const s = c && c.smsConsent;
    if (!s) return 'ask';
    if (s.on && e164(s.phone || c.phone) === e164(c.phone)) return 'on';
    if (s.on) return 'ask'; // number changed since they said yes — ask again
    return 'no';
  }
  function consentCard(c, compact) {
    const st = consentState(c), phone = e164(c.phone);
    if (st === 'on') return `<div class="v34-consent on">${icon('checkcircle', 15)} <span><strong>Texts ON</strong> · ${E(fmtPhone(c.phone))} · since ${E(new Date(c.smsConsent.at).toLocaleDateString())}${c.smsConsent.by ? ' · ' + E(c.smsConsent.by) : ''}</span>${compact ? '' : `<button class="btn btn-ghost btn-sm" onclick="v34Consent('${E(c.id)}','off')">Customer asked to stop</button>`}</div>`;
    if (!phone) return compact ? '' : `<div class="v34-consent">${icon('alerttriangle', 15)} <span>Texts: add a valid mobile number to this customer to offer order texts.</span></div>`;
    if (st === 'no' && compact) return '';
    return `<div class="v34-consent ask"><div class="v34-ask-head">📱 Ask the customer:</div><div class="v34-ask-q">“${E(QUESTION)}”</div>
      <div class="v34-ask-btns"><button class="btn btn-primary" onclick="v34Consent('${E(c.id)}','yes')">Customer said YES</button><button class="btn btn-ghost" onclick="v34Consent('${E(c.id)}','no')">No thanks</button></div>
      <div class="helper-text">Texts go to ${E(fmtPhone(c.phone))}.${st === 'no' ? ' (They said no before.)' : ''}</div></div>`;
  }
  window.v34Consent = async (customerId, answer) => {
    const c = customerById(customerId); if (!c) return;
    const now = new Date().toISOString();
    if (answer === 'yes') {
      c.smsConsent = { on: true, phone: e164(c.phone), at: now, by: staffName(), method: 'counter-verbal' };
      try { recordSync(`Text consent YES · ${c.name} · ${fmtPhone(c.phone)}`); } catch (_) {}
    } else if (answer === 'off') {
      if (!window.confirm(`Stop all texts to ${c.name}?`)) return;
      c.smsConsent = { ...(c.smsConsent || {}), on: false, offAt: now, offBy: staffName() };
    } else {
      c.smsConsent = { on: false, declinedAt: now, by: staffName() };
    }
    if (typeof saveState === 'function') saveState();
    try { renderPosContent(); } catch (_) {}
    if (answer === 'yes') {
      const r = await notify({ kind: 'optin', customerId: c.id });
      if (r && r.ok && r.data && r.data.sent) toast(`Confirmation text sent to ${fmtPhone(c.phone)}`, true, 'checkcircle');
      else if (r && r.ok && r.data && r.data.duplicate) toast('Texts saved as YES (confirmation was already sent before)', true, 'checkcircle');
      else toast(`Texts saved as YES — but NO text was sent: ${why(r)}`, false, 'alerttriangle');
      loadStatus().catch(() => {});
    }
  };

  /* ---------------- 2. automatic texts ---------------- */
  let snap = null, cardSnap = null;
  const sig = o => `${o.status}|${o.paid ? 1 : 0}|${o.cloverChargeId || ''}|${o.paymentError || ''}`;
  const cloverCard = c => { const p = (c && c.paymentMethods || []).find(x => x.processor === 'clover'); return p ? String(p.last4 || 'x') : ''; };
  function takeSnap() {
    snap = new Map((state.orders || []).map(o => [o.id, sig(o)]));
    cardSnap = new Map((state.customers || []).map(c => [c.id, cloverCard(c)]));
  }
  const queue = new Map();
  function enqueue(kind, customerId, orderId, delayMs) {
    const key = `${kind}|${customerId}`;
    let q = queue.get(key);
    if (!q) { q = { kind, customerId, orderIds: new Set(), timer: null }; queue.set(key, q); }
    if (orderId) q.orderIds.add(orderId);
    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
      queue.delete(key);
      try {
        const r = await notify({ kind, customerId, orderIds: [...q.orderIds] });
        const d = (r && r.data) || {};
        const quiet = /Already sent|not in that state|switched off|No text consent|replied STOP|No successful card|No saved card|No valid mobile/i.test(d.skipped || '');
        if (r && r.ok && d.sent) { try { toast(`Text sent: ${LABELS[kind] || kind}`, true, 'checkcircle'); } catch (_) {} }
        else if (!(r && r.ok && quiet)) { try { toast(`Text not sent (${LABELS[kind] || kind}): ${why(r)}`, false, 'alerttriangle'); } catch (_) {} }
      } catch (_) {}
    }, delayMs);
  }
  function diff() {
    if (!snap) return takeSnap();
    const recent = Date.now() - 15 * 60 * 1000;
    for (const o of state.orders || []) {
      if (!o || !o.id || !o.customerId || o.legacy || o.__v294Loaded) continue;
      const before = snap.get(o.id);
      const [s0, p0, ch0, err0] = before ? before.split('|') : [];
      if (!before) {
        const created = Date.parse(o.createdAt || '') || 0;
        if (created > recent && !['scheduled', 'voided'].includes(o.status) && !o.pickupOnly && o.source !== 'customer-app') enqueue('dropoff', o.customerId, o.id, 20000);
        continue;
      }
      if (o.status !== s0) {
        if (o.status === 'ready') enqueue('ready', o.customerId, o.id, 6000);
        if (o.status === 'picked_up') enqueue('pickup', o.customerId, o.id, 6000);
      }
      if (o.cloverChargeId && o.cloverChargeId !== ch0 && o.paymentProcessor === 'clover') enqueue('charged', o.customerId, o.id, 30000);
      if (o.paymentError && o.paymentError !== err0 && !o.paid) enqueue('declined', o.customerId, o.id, 8000);
    }
    for (const c of state.customers || []) {
      if (!c || !c.id) continue;
      const now = cloverCard(c), was = cardSnap.get(c.id);
      if (now && was !== undefined && now !== was) enqueue('cardSaved', c.id, null, 5000);
    }
    takeSnap();
  }
  if (typeof saveState === 'function') {
    const base = saveState;
    saveState = function v34SaveState() {
      const r = base.apply(this, arguments);
      try {
        if (shared() && on() && !applying()) diff();
        else if (shared() && !T.status && !applying() && snap) { diff(); } // status still loading — queue now; the server decides
        else if (!snap || applying()) takeSnap();
      } catch (e) { console.error('V34 texts', e); }
      return r;
    };
  }
  // Changes that arrive from other counters/apps are theirs to text about — just re-baseline.
  if (typeof v16ApplySnapshot === 'function') {
    const baseApply = v16ApplySnapshot;
    v16ApplySnapshot = function v34Apply() { const r = baseApply.apply(this, arguments); try { takeSnap(); } catch (_) {} return r; };
  }

  /* ---------------- 3. Marketing → Texts ---------------- */
  const LABELS = { dropoff: 'Drop-off thank-you + receipt', ready: 'Order ready for pickup', pickup: 'Thanks for picking up', delivered: 'Delivered (with photo link)', charged: 'Card on file charged', declined: 'Card declined', cardSaved: 'Card saved on file', reminder: 'Reminder after 7 and 14 days' };
  const settings = () => { state.interfaceSettings = state.interfaceSettings || {}; const s = state.interfaceSettings.sms = state.interfaceSettings.sms || {}; s.enabled = s.enabled || {}; return s; };
  const enabled = k => settings().enabled[k] !== false;
  const optedIn = () => (state.customers || []).filter(c => consentState(c) === 'on');
  function textsCard() {
    const s = T.status;
    if (!shared()) return '';
    const mode = s ? s.mode : '…';
    const tag = !s ? '' : mode === 'live' ? '<span class="v34-tag live">LIVE</span>' : mode === 'test' ? '<span class="v34-tag test">TEST — only test numbers</span>' : '<span class="v34-tag off">OFF</span>';
    const kindName = k => ({ optin: 'Sign-up confirmation', notice: 'Store notice', reply: 'Customer reply', optout: 'STOP', 'optin-keyword': 'START', help: 'HELP' }[k] || LABELS[k] || k);
    const cname = id => (customerById(id) || {}).name || '';
    return `<div class="pos-card v34-texts"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">${icon('message', 17)} Texts</h3>${tag}<span class="helper-text" style="margin:0">${optedIn().length} customers opted in · ${(T.optOuts || []).length} replied STOP</span><span style="flex:1"></span><button class="btn btn-ghost btn-sm" onclick="v34Refresh()">Refresh</button></div>
      ${s && !s.twilioConfigured ? `<div class="warn-banner" style="margin-top:10px"><span>Twilio settings are missing in Netlify (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID).</span></div>` : ''}
      ${s && s.tablesReady === false ? `<div class="warn-banner" style="margin-top:10px"><span>Run <strong>supabase/sms-v29.11.sql</strong> in Supabase to turn on the message log.</span></div>` : ''}
      ${s ? `<div class="v34-setup"><h4>Setup check</h4><ul>
        <li>${s.mode !== 'off' ? '✅' : '❌'} SMS_MODE = <strong>${E(s.mode)}</strong>${s.mode === 'off' ? ' — set to test or live in Netlify, then redeploy' : ''}</li>
        <li>${s.twilioConfigured ? '✅' : '❌'} Twilio keys ${s.twilioConfigured ? `set (service ${E(s.messagingService || '')})` : `missing: ${E((s.missing || []).filter(k => k !== 'SMS_MODE').join(', '))}`}</li>
        ${s.mode === 'test' ? `<li>${(s.testNumbers || []).length ? '✅' : '❌'} Test numbers: ${(s.testNumbers || []).length ? E(s.testNumbers.join(', ')) : 'none — add SMS_TEST_NUMBERS in Netlify'} <span class="helper-text" style="display:inline;margin:0">(in test mode only these numbers get texts)</span></li>` : ''}
        <li>${s.tablesReady !== false ? '✅' : '❌'} Message log table</li>
        ${s.lastError ? `<li>⚠️ Last failed text (${E(new Date(s.lastError.at).toLocaleString())}): <strong>${E(s.lastError.error)}</strong></li>` : ''}
      </ul>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="v34-test-phone" type="tel" placeholder="Your cell, e.g. 516-592-1550" style="max-width:220px"><button class="btn btn-primary btn-sm" ${isManager() ? '' : 'disabled'} onclick="v34TestText()">Send test text</button><span class="helper-text" style="margin:0">Goes straight to Twilio and shows Twilio's exact answer.</span></div></div>` : ''}
      <div class="v34-grid"><div><h4>Automatic texts</h4>${Object.keys(LABELS).map(k => `<label class="v34-toggle"><input type="checkbox" ${enabled(k) ? 'checked' : ''} ${isManager() ? '' : 'disabled'} onchange="v34Toggle('${k}',this.checked)"> ${E(LABELS[k])}</label>`).join('')}</div>
      <div><h4>Store notice</h4><div class="helper-text" style="margin:0 0 6px">Hours changes, holiday or weather closures — sent to everyone opted in. Not for promotions.</div>
        <textarea id="v34-notice" rows="3" maxlength="240" placeholder="e.g. We're closed Monday 10/12 for the holiday. Open Tuesday 8am."></textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button class="btn btn-primary btn-sm" ${isManager() ? '' : 'disabled'} onclick="v34SendNotice()">Send to ${optedIn().length} customers</button><span class="helper-text" style="margin:0">Starts with “Hattan Cleaners:” and ends with “Reply STOP to opt out.”</span></div></div></div>
      <h4 style="margin:14px 0 6px">Recent messages</h4>
      ${(T.log || []).length ? `<div class="pos-table-wrap"><table class="pos-table"><thead><tr><th>Time</th><th></th><th>Type</th><th>Customer</th><th>Message</th><th>Status</th></tr></thead><tbody>${T.log.slice(0, 60).map(m => `<tr><td style="white-space:nowrap">${E(new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td><td>${m.direction === 'in' ? '⬅︎' : '➡︎'}</td><td>${E(kindName(m.kind))}</td><td>${E(cname(m.customer_id) || ('•••' + String(m.to_phone || '').slice(-4)))}</td><td style="max-width:420px">${E(String(m.body || '').slice(0, 160))}</td><td>${E(m.status || '')}${m.error_message ? `<div class="row-sub" style="color:#b42318">${E(m.error_message)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="helper-text">No messages yet.</div>'}
    </div>`;
  }
  const rerender = () => { const el = document.querySelector('.v34-texts'); if (el) el.outerHTML = textsCard(); };
  window.v34Refresh = async () => { await loadStatus(); rerender(); };
  window.v34Toggle = (k, v) => { settings().enabled[k] = !!v; if (typeof saveState === 'function') saveState(); toast(`${LABELS[k]}: ${v ? 'on' : 'off'}`, true, 'checkcircle'); };
  window.v34TestText = async () => {
    const phone = String(document.getElementById('v34-test-phone')?.value || '').trim();
    if (!e164(phone)) return toast('Enter a 10-digit mobile number', false, 'alerttriangle');
    const r = await v16Api('sms-notify', { method: 'POST', body: JSON.stringify({ kind: 'test', phone }) });
    if (r.ok && r.data && r.data.sent) toast(`Test text sent to ${fmtPhone(phone)} — Twilio status: ${r.data.status || 'queued'}`, true, 'checkcircle');
    else window.alert(`Test text NOT sent.\n\n${why(r)}`);
    await loadStatus(); rerender();
  };
  window.v34SendNotice = async () => {
    const text = String(document.getElementById('v34-notice')?.value || '').trim();
    if (text.length < 5) return toast('Write the notice first', false, 'alerttriangle');
    const list = optedIn();
    if (!list.length) return toast('No customers have opted in yet', false, 'alerttriangle');
    if (!window.confirm(`Send this notice to ${list.length} customer${list.length === 1 ? '' : 's'}?\n\nHattan Cleaners: ${text} Reply STOP to opt out.`)) return;
    const noticeId = 'n' + Date.now().toString(36);
    let sent = 0, skipped = 0, failed = 0;
    for (let i = 0; i < list.length; i += 25) {
      const r = await notify({ kind: 'notice', noticeId, text, customerIds: list.slice(i, i + 25).map(c => c.id) });
      if (!r.ok) { toast(r.data?.error || 'Notice failed', false, 'alerttriangle'); return; }
      (r.data.results || []).forEach(x => { if (x.sent) sent++; else if (x.ok) skipped++; else failed++; });
    }
    toast(`Notice sent to ${sent}${skipped ? ` · ${skipped} skipped` : ''}${failed ? ` · ${failed} failed` : ''}`, !failed, failed ? 'alerttriangle' : 'checkcircle');
    const box = document.getElementById('v34-notice'); if (box) box.value = '';
    await loadStatus(); rerender();
  };

  /* ---------------- inject ---------------- */
  function inject() {
    const content = document.getElementById('pos-content'); if (!content || !state.session?.loggedIn || !shared()) return;
    // Customer profile
    if (state.posNav === 'customers' && state.v7CustomerId && !content.querySelector('.v34-consent')) {
      const c = customerById(state.v7CustomerId), head = content.querySelector('.v288-hero') || content.querySelector('.v7-profile-head');
      if (c && head) head.insertAdjacentHTML('afterend', `<div class="v34-profile-wrap">${consentCard(c, false)}</div>`);
    }
    // Counter (regular kiosk + Simple): ask once, right after the customer is picked
    if (state.posNav === 'counter' && typeof counterDraft !== 'undefined' && counterDraft && counterDraft.customerId && !content.querySelector('.v34-consent')) {
      const c = customerById(counterDraft.customerId);
      if (c && consentState(c) === 'ask' && e164(c.phone)) {
        const banner = content.querySelector('.v287-customer-banner');
        const at = content.querySelector('.v282-main') || content.querySelector('.v13-simple-wrap') || content.querySelector('.counter-grid');
        if (banner) banner.insertAdjacentHTML('afterend', `<div class="v34-counter-wrap">${consentCard(c, true)}</div>`);
        else if (at) at.insertAdjacentHTML('afterbegin', `<div class="v34-counter-wrap">${consentCard(c, true)}</div>`);
      }
    }
    if (state.posNav === 'marketing' && !content.querySelector('.v34-texts')) { content.insertAdjacentHTML('afterbegin', textsCard()); if (!T.status) loadStatus().then(rerender); }
  }
  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; try { inject(); } catch (e) { console.error('V34 inject', e); } }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  let tries = 0;
  const boot = setInterval(async () => { tries++; if (shared() && typeof v16Live !== 'undefined' && v16Live.authenticated) { clearInterval(boot); takeSnap(); await loadStatus(); try { inject(); rerender(); } catch (_) {} } else if (tries > 60) clearInterval(boot); }, 1000);
  setInterval(() => { if (shared() && state.posNav === 'marketing') loadStatus().then(rerender); }, 60000);
})();
