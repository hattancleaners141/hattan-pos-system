/* Hattan Ops Suite V29.6 — Customer Directory
 *
 * Replaces V29.4 / V29.5 / V29.5.2 / V29.5.3 customer-directory scripts.
 *
 * Why: those versions pushed all ~27,500 CleanBase customers into state.customers.
 * state.customers is written to localStorage (≈5 MB limit — the CleanBase list alone is
 * larger) and synced through state-sync, so the full list was silently dropped / overwritten
 * by the ~300-400 POS-created customers, and the "loaded" check never became true.
 *
 * Now: the CleanBase directory is a separate, read-only in-memory index loaded from a static
 * file. It is never saved to localStorage or synced. A CleanBase customer is copied into
 * state.customers only when staff open them (one small record), so the profile, tickets,
 * memos and new orders work exactly as before.
 */
(function () {
  'use strict';
  const DATA_URL = 'legacy-v296/customer-directory.json?v=296';
  const PAGE_SIZE = 100;
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const digits = s => String(s || '').replace(/\D/g, '');
  const fmtPhone = d => { d = digits(d); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ''; };
  const money = n => (typeof window.money === 'function' ? window.money(n || 0) : '$' + Number(n || 0).toFixed(2));
  const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-'’(])([a-z])/g, (m, a, b) => a + b.toUpperCase());

  const D = window.HATTAN_DIRECTORY = { status: 'loading', error: '', rows: [], byNum: new Map(), byLegacy: new Map(), meta: null };
  const ui = window.HATTAN_DIR_UI = window.HATTAN_DIR_UI || { mode: 'report', period: 'all', sort: 'recent', page: 0 };

  /* ---------- data ---------- */
  function build(json) {
    const F = json.meta.fields, ix = Object.fromEntries(F.map((f, i) => [f, i]));
    D.meta = json.meta;
    D.rows = json.rows.map(a => {
      const last = a[ix.last] || '', first = a[ix.first] || '';
      const name = last ? titleCase(first ? `${first} ${last}` : last) : '';
      const r = {
        legacyId: a[ix.legacyId], num: String(a[ix.customerNumber]), last, first, name,
        street: a[ix.street] || '', apt: a[ix.apt] || '', city: a[ix.city] || 'New York', state: a[ix.state] || 'NY', zip: a[ix.zip] || '',
        phone: a[ix.phone] || '', joined: a[ix.joined] || '', lastActivity: a[ix.lastActivity] || '',
        tickets: a[ix.tickets] || 0, spend: a[ix.spend] || 0, type: a[ix.type] || '', onReport: !!a[ix.onReport],
        ar: ix.arBalance != null ? Number(a[ix.arBalance] || 0) : 0,
      };
      r.t = Date.parse(r.lastActivity) || 0; r.j = Date.parse(r.joined) || 0;
      r.key = [last + first, first + last, r.num, r.street, r.apt].map(norm).join('|'); r.dig = r.phone + '|' + r.num;
      return r;
    });
    D.rows.forEach(r => { D.byNum.set(r.num, r); if (r.legacyId != null) D.byLegacy.set(String(r.legacyId), r); });
    D.status = 'ready';
  }
  function load() {
    D.status = 'loading'; D.error = '';
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw Error(`customer directory file returned ${r.status}`); return r.json(); })
      .then(build)
      .catch(e => { D.status = 'error'; D.error = e.message || String(e); console.error('V29.6 directory:', e); })
      .finally(() => { rerender(); try { if (state.posNav === 'counter') augmentCounter(); } catch (_) {} });
  }
  window.v296RetryDirectory = () => { load(); rerender(); };

  /* ---------- keep state.customers small ---------- */
  // Earlier versions inserted every CleanBase customer as a `cb_` placeholder. Drop the ones
  // nobody has used (no orders, no memo, never opened) so saves and syncs are small again.
  function pruneLegacyPlaceholders() {
    if (typeof state === 'undefined' || !Array.isArray(state.customers)) return 0;
    const used = new Set((state.orders || []).filter(o => !o.__v294Loaded && !o.legacy).map(o => o.customerId));
    Object.keys(state.customerMemos || {}).forEach(id => used.add(id));
    (state.recentCustomerSearches || []).forEach(x => used.add(typeof x === 'string' ? x : x && x.id));
    const before = state.customers.length;
    state.customers = state.customers.filter(c => !(String(c.id).startsWith('cb_') && !c.v296Opened && !used.has(c.id)));
    const removed = before - state.customers.length;
    if (removed && typeof saveState === 'function') saveState();
    return removed;
  }

  /* ---------- rows shown in the directory ---------- */
  function posCustomers() {
    // Customers created / edited in the new POS. Link them to their CleanBase row when possible.
    return (state.customers || []).filter(c => !String(c.id).startsWith('cb_') || c.v296Opened).map(c => {
      const legacy = (c.legacyCustomerId != null && D.byLegacy.get(String(c.legacyCustomerId))) || (c.customerNumber && D.byNum.get(String(c.customerNumber))) || null;
      const a = (c.addresses || [])[0] || {};
      const t = Date.parse(c.legacyLastActivity || c.lastOrderAt || c.updatedAt || '') || (legacy ? legacy.t : 0);
      return {
        pos: c, legacy, num: String(c.customerNumber || (legacy && legacy.num) || ''), name: c.name || (legacy && legacy.name) || '',
        phone: digits(c.phone) || (legacy && legacy.phone) || '', street: a.line1 || (legacy && legacy.street) || '', apt: a.line2 || (legacy && legacy.apt) || '',
        t, j: Date.parse(c.legacyJoinedDate || c.joinedAt || c.createdAt || '') || (legacy ? legacy.j : 0),
        tickets: (legacy && legacy.tickets) || 0, spend: (legacy && legacy.spend) || 0, onReport: legacy ? legacy.onReport : true,
        key: [c.name, c.email, c.customerNumber, a.line1, ...(c.searchAliases || [])].map(norm).join('|') + (legacy ? '|' + legacy.key : ''),
        dig: digits(c.phone) + '|' + (c.customerNumber || '') + '|' + (legacy ? legacy.dig : ''),
      };
    });
  }
  function directoryRows() {
    const pos = posCustomers();
    const linked = new Set(pos.filter(p => p.legacy).map(p => p.legacy.num));
    const legacy = D.rows.filter(r => !linked.has(r.num)).map(r => ({ legacy: r, pos: null, ...r }));
    return pos.concat(legacy);
  }
  function filtered() {
    let list = directoryRows();
    if (ui.mode === 'report') list = list.filter(r => r.onReport || (r.pos && !r.legacy));
    const days = { 30: 30, 90: 90, 180: 180, 365: 365, 730: 730 }[ui.period];
    if (days) { const cut = Date.now() - days * 864e5; list = list.filter(r => r.t >= cut); }
    const q = String(state.posCustSearch || '').trim();
    if (q) {
      const nq = norm(q), qd = digits(q);
      const words = q.toLowerCase().split(/[\s,]+/).map(norm).filter(Boolean);
      list = list.filter(r => (nq && r.key.includes(nq)) || (words.length > 1 && words.every(w => r.key.includes(w))) || (qd.length >= 3 && r.dig.includes(qd)));
    }
    if (ui.sort === 'name') list.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
    else if (ui.sort === 'joined') list.sort((a, b) => b.j - a.j || b.t - a.t);
    else if (ui.sort === 'number') list.sort((a, b) => Number(a.num || 0) - Number(b.num || 0));
    else list.sort((a, b) => b.t - a.t || b.j - a.j);
    return list;
  }

  /* ---------- render ---------- */
  const btn = (on, onclick, label) => `<button class="btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}" onclick="${onclick}">${label}</button>`;
  function statusLine(total) {
    if (D.status === 'loading') return 'Loading CleanBase customer directory…';
    if (D.status === 'error') return '';
    const posOnly = (state.customers || []).filter(c => !String(c.id).startsWith('cb_')).length;
    return `${D.meta.onReport.toLocaleString()} active customers (Customer List 09/01/23–09/28/26) · ${D.rows.length.toLocaleString()} in full CleanBase history · ${posOnly.toLocaleString()} created in this POS`;
  }
  function renderDirectory(content) {
    if (!content) return;
    const list = D.status === 'ready' ? filtered() : [];
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (ui.page >= pages) ui.page = pages - 1;
    const slice = list.slice(ui.page * PAGE_SIZE, ui.page * PAGE_SIZE + PAGE_SIZE);
    const row = r => {
      const addr = [r.street, r.apt ? '#' + r.apt : ''].filter(Boolean).join(' ');
      const id = r.pos ? `p:${r.pos.id}` : `n:${r.num}`;
      return `<tr class="clickable" onclick="v296OpenCustomer('${E(id)}')">
        <td><strong>${E(r.name || `Customer #${r.num}`)}</strong><div class="row-sub">Customer ${E(r.num || '—')}${r.pos && !r.legacy ? ' · new in POS' : ''}${!r.name ? ' · name not migrated yet' : ''}${r.legacy && r.legacy.ar > 0.004 ? ` · <span style="color:#b42318">CleanBase balance ${money(r.legacy.ar)}</span>` : ''}</div></td>
        <td>${E(fmtPhone(r.phone) || '—')}</td>
        <td>${E(addr || '—')}</td>
        <td>${r.t ? new Date(r.t).toLocaleDateString() : '—'}</td>
        <td>${r.j ? new Date(r.j).toLocaleDateString() : '—'}</td>
        <td style="text-align:right">${Number(r.tickets || 0).toLocaleString()}</td>
        <td style="text-align:right">${money(r.spend)}</td></tr>`;
    };
    let body;
    if (D.status === 'loading') body = `<tr><td colspan="7" style="padding:28px;text-align:center">Loading customer directory…</td></tr>`;
    else if (D.status === 'error') body = `<tr><td colspan="7" style="padding:28px;text-align:center">Couldn't load the CleanBase directory (${E(D.error)}).<br><br><button class="btn btn-primary" onclick="v296RetryDirectory()">Try again</button></td></tr>`;
    else body = slice.map(row).join('') || `<tr><td colspan="7" style="padding:20px">No customers match.</td></tr>`;
    const from = list.length ? ui.page * PAGE_SIZE + 1 : 0, to = Math.min(list.length, (ui.page + 1) * PAGE_SIZE);
    const pager = pages > 1 ? `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px">
        ${btn(false, 'v296Page(-1)', '‹ Prev')}<span>Page ${ui.page + 1} of ${pages.toLocaleString()}</span>${btn(false, 'v296Page(1)', 'Next ›')}</div>` : '';
    content.innerHTML = `<div class="v296-customers">
      <div class="pos-card" style="margin-bottom:12px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="pos-search" style="flex:1;min-width:280px"><span class="search-ic">⌕</span>
            <input id="v296-search" placeholder="Search name, phone, customer #, address…" value="${E(state.posCustSearch || '')}" oninput="v296Search(this.value)" /></div>
          <button class="btn btn-secondary" onclick="posOpenNewCustomer()">+ New Customer</button>
        </div>
        <div class="v293-filter-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <strong>Show:</strong>${btn(ui.mode === 'report', "v296Set('mode','report')", 'Active customers')}${btn(ui.mode === 'all', "v296Set('mode','all')", 'All CleanBase history')}
          <span style="width:12px"></span><strong>Last visit:</strong>
          ${btn(ui.period === '30', "v296Set('period','30')", '30 days')}${btn(ui.period === '90', "v296Set('period','90')", '90 days')}${btn(ui.period === '365', "v296Set('period','365')", '1 year')}${btn(ui.period === 'all', "v296Set('period','all')", 'Any')}
          <span style="flex:1"></span>
          <label><strong>Sort:</strong> <select onchange="v296Set('sort',this.value)">
            <option value="recent" ${ui.sort === 'recent' ? 'selected' : ''}>Most recent visit</option>
            <option value="name" ${ui.sort === 'name' ? 'selected' : ''}>Name A–Z</option>
            <option value="number" ${ui.sort === 'number' ? 'selected' : ''}>Customer #</option>
            <option value="joined" ${ui.sort === 'joined' ? 'selected' : ''}>Newest customers</option></select></label>
        </div>
      </div>
      <div class="pos-table-wrap"><table class="pos-table">
        <thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th>Last visit</th><th>Joined</th><th style="text-align:right">Tickets</th><th style="text-align:right">Spend</th></tr></thead>
        <tbody>${body}</tbody></table></div>
      <div class="helper-text" style="margin-top:8px">${D.status === 'ready' ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${list.length.toLocaleString()} · ` : ''}${statusLine()}</div>
      ${pager}</div>`;
  }
  function rerender() {
    if (typeof state !== 'undefined' && state.session && state.session.loggedIn && state.posNav === 'customers' && !state.v7CustomerId) renderDirectory(document.getElementById('pos-content'));
  }

  /* ---------- actions ---------- */
  let searchTimer = null;
  window.v296Search = v => {
    state.posCustSearch = v; ui.page = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const el = document.getElementById('v296-search'); const pos = el ? el.selectionStart : null;
      rerender();
      const el2 = document.getElementById('v296-search'); if (el2) { el2.focus(); if (pos != null) el2.setSelectionRange(pos, pos); }
    }, 150);
  };
  window.posCustDirSearch = window.v296Search;
  window.v296Set = (k, v) => { ui[k] = v; ui.page = 0; rerender(); };
  window.v296Page = d => { ui.page = Math.max(0, ui.page + d); rerender(); const c = document.getElementById('pos-content'); if (c) c.scrollTop = 0; };
  // Old button handlers from V29.4/V29.5.x, in case anything still calls them
  window.v294SetPeriod = v => window.v296Set('period', v);
  window.v294SetSort = v => window.v296Set('sort', v);
  window.v2951SetMode = v => window.v296Set('mode', /all|hist/i.test(String(v)) ? 'all' : 'report');

  function initials(name) { const p = String(name || '').split(/\s+/).filter(Boolean); return ((p[0] || 'C')[0] + (p[p.length - 1] || 'B')[0]).toUpperCase(); }
  function materialize(r) {
    // Existing POS record for this CleanBase customer?
    let c = (state.customers || []).find(x => (x.legacyCustomerId != null && r.legacyId != null && String(x.legacyCustomerId) === String(r.legacyId)) || (x.customerNumber && String(x.customerNumber) === r.num));
    if (!c) {
      c = { id: r.legacyId != null ? `cb_${r.legacyId}` : `cbn_${r.num}`, name: r.name || `Customer #${r.num}`, initials: r.name ? initials(r.name) : 'CB',
        email: '', phone: fmtPhone(r.phone), points: 0, storeCredit: 0, preferredChannel: 'pickup', paymentMethods: [],
        garmentPrefs: { starch: 'none', fold: 'hang', fragranceFree: false, notes: '' },
        addresses: (r.street || r.zip) ? [{ id: `cb_addr_${r.legacyId || r.num}`, line1: r.street, line2: r.apt, city: r.city, state: r.state, zip: r.zip }] : [] };
      state.customers.push(c);
    }
    c.v296Opened = true;
    c.legacyCustomerId = r.legacyId; c.customerNumber = r.num;
    c.legacyLastActivity = r.lastActivity || c.legacyLastActivity || ''; c.legacyJoinedDate = r.joined || c.legacyJoinedDate || '';
    c.legacyTicketCount = r.tickets; c.legacyLifetimeSpend = r.spend;
    if (r.joined && !c.memberSince) c.memberSince = new Date(r.joined).toLocaleDateString();
    if ((!c.name || /^Customer\s*#/i.test(c.name)) && r.name) { c.name = r.name; c.initials = initials(r.name); }
    if (!c.phone && r.phone) c.phone = fmtPhone(r.phone);
    if ((!c.addresses || !c.addresses.length) && (r.street || r.zip)) c.addresses = [{ id: `cb_addr_${r.legacyId || r.num}`, line1: r.street, line2: r.apt, city: r.city, state: r.state, zip: r.zip }];
    c.searchAliases = Array.from(new Set([...(c.searchAliases || []), r.name, r.num].filter(Boolean)));
    return c;
  }
  async function loadTickets(c) {
    const cid = Number(c.legacyCustomerId); if (!Number.isFinite(cid)) return [];
    const r = await fetch(`legacy-v294/tickets4y-${(cid & 15).toString(16)}.json`, { cache: 'force-cache' });
    if (!r.ok) throw Error('ticket history ' + r.status);
    const all = await r.json(); return all.filter(x => Number(x[0]) === cid).map(x => x[1]);
  }
  function asOrder(c, t) {
    const its = (t.items || []).map(i => `${i.q || 1} ${i.d}`).join(', ');
    // CleanBase leaves `paid` off for most tickets paid at pickup; real money owed lives in the
    // customer's CleanBase account balance (added below as a balance-forward line). So a
    // completed CleanBase ticket is treated as settled; only still-open tickets can be due.
    const done = !!t.done, paid = !!t.paid || done;
    return { id: `legacy_${t.w}`, ticket: t.ticket, customerId: c.id, channel: 'counter', createdAt: t.c, dueDate: t.due ? String(t.due).slice(0, 10) : '',
      status: done ? 'picked_up' : 'ready', stageIndex: 0, total: Number(t.total || 0), discount: 0, surcharge: 0, paid,
      paymentMethod: t.paid ? 'CleanBase payment' : (done ? 'Settled in CleanBase' : ''), items: its || `${t.qty || 0} item(s)`, rack: '', tagNumber: '', fulfillment: 'pickup',
      legacy: true, legacyItems: t.items || [], __v294Loaded: true };
  }
  function balanceForward(c, r) {
    if (!(r.ar > 0.004)) return null;
    const asOf = (D.meta && D.meta.arAsOf) || '';
    return { id: `legacy_bf_${r.legacyId || r.num}`, ticket: 'BAL FWD', customerId: c.id, channel: 'counter', createdAt: asOf ? asOf + 'T00:00:00' : '',
      dueDate: asOf, status: 'picked_up', stageIndex: 0, total: r.ar, discount: 0, surcharge: 0, paid: false, paymentMethod: '',
      items: `CleanBase account balance brought forward${asOf ? ' (as of ' + new Date(asOf + 'T12:00:00').toLocaleDateString() + ')' : ''}`,
      rack: '', tagNumber: '', fulfillment: 'pickup', legacy: true, legacyBalanceForward: true, legacyItems: [], __v294Loaded: true };
  }
  const sig = o => `${!!o.paid}|${o.status}|${Number(o.total || 0)}|${Number(o.discount || 0)}|${o.paymentMethod || ''}`;
  // Replace the currently-loaded CleanBase ticket history with this customer's, but never drop a
  // CleanBase ticket (or balance-forward line) that staff have changed — e.g. took payment on.
  function installLegacyOrders(c, fresh) {
    const kept = (state.orders || []).filter(o => !o.__v294Loaded || (o.__v296Sig && sig(o) !== o.__v296Sig));
    const keptIds = new Set(kept.map(o => o.id));
    fresh.forEach(o => { o.__v296Sig = sig(o); });
    state.orders = kept.concat(fresh.filter(o => !keptIds.has(o.id)));
  }
  function applyCredit(c, r) {
    if (r.ar < -0.004 && !c.v296CreditApplied) {
      c.storeCredit = Math.round((Number(c.storeCredit || 0) + (-r.ar)) * 100) / 100;
      c.v296CreditApplied = true;
    }
  }
  window.v296OpenCustomer = async function (ref) {
    let c;
    if (ref.startsWith('p:')) c = (state.customers || []).find(x => x.id === ref.slice(2));
    else { const r = D.byNum.get(ref.slice(2)); if (r) c = materialize(r); }
    if (!c) return;
    await loadLegacy(c);
    if (typeof saveState === 'function') saveState();
    if (typeof v7OpenCustomerProfile === 'function') v7OpenCustomerProfile(c.id);
  };
  async function loadLegacy(c) {
    const r = (c.legacyCustomerId != null && D.byLegacy.get(String(c.legacyCustomerId))) || (c.customerNumber && D.byNum.get(String(c.customerNumber)));
    if (!r) return;
    let ts = [];
    if (c.legacyCustomerId != null) {
      try { ts = await loadTickets(c); }
      catch (e) { console.error(e); if (typeof toast === 'function') toast('Legacy ticket history could not load', false, 'alerttriangle'); }
    }
    const fresh = ts.map(t => asOrder(c, t)); const bf = balanceForward(c, r); if (bf) fresh.push(bf);
    installLegacyOrders(c, fresh); applyCredit(c, r);
  }
  window.v294OpenCustomer = id => window.v296OpenCustomer('p:' + id);

  /* ---------- Drop Off counter search: include the CleanBase directory ---------- */
  function counterMatches(q, exclude) {
    if (D.status !== 'ready' || !q) return [];
    const nq = norm(q), qd = digits(q), words = q.toLowerCase().split(/[\s,]+/).map(norm).filter(Boolean);
    const out = [];
    for (const r of D.rows) {
      if (exclude.has(r.num)) continue;
      if ((nq && r.key.includes(nq)) || (words.length > 1 && words.every(w => r.key.includes(w))) || (qd.length >= 3 && r.dig.includes(qd))) out.push(r);
    }
    out.sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || b.t - a.t);
    return out.slice(0, 8);
  }
  window.v296CounterPick = function (num) {
    const r = D.byNum.get(String(num)); if (!r) return;
    const c = materialize(r);
    loadLegacy(c).finally(() => { if (typeof saveState === 'function') saveState(); if (typeof window.v282Pick === 'function') window.v282Pick(c.id); else if (typeof posPickCustomer === 'function') { posPickCustomer(c.id); renderPosContent(); } });
  };
  function augmentCounter() {
    const box = document.querySelector('#pos-content .v282-results'); const input = document.getElementById('v282search');
    if (!box || !input) return;
    const q = String(typeof posCustomerSearch !== 'undefined' ? posCustomerSearch : input.value || '').trim();
    box.querySelectorAll('.v296-dir-result').forEach(x => x.remove());
    if (!q) return;
    const inPos = new Set((state.customers || []).map(c => String(c.customerNumber || '')).filter(Boolean));
    const ms = counterMatches(q, inPos);
    box.insertAdjacentHTML('beforeend', ms.map(r => `<div class="v282-result v296-dir-result" onclick="v296CounterPick('${E(r.num)}')">${E(r.name || 'Customer #' + r.num)}<small style="display:block">${E(fmtPhone(r.phone) || '')} · ${E([r.street, r.apt ? '#' + r.apt : ''].filter(Boolean).join(' ') || 'Customer ' + r.num)} · CleanBase #${E(r.num)}${r.ar > 0.004 ? ' · owes ' + E(money(r.ar)) : ''}</small></div>`).join(''));
  }
  let counterWrapped = null;
  function wrapCounter() {
    const cur = window.renderPosCounter;
    if (typeof cur !== 'function' || cur === counterWrapped) return;
    counterWrapped = function (content) { const res = cur.apply(this, arguments); try { augmentCounter(); } catch (e) { console.error('V29.6 counter search:', e); } return res; };
    window.renderPosCounter = counterWrapped;
    try { renderPosCounter = counterWrapped; } catch (_) {}
  }
  let keyWrapped = null;
  function wrapSearchKey() {
    const cur = window.v282SearchKey;
    if (typeof cur !== 'function' || cur === keyWrapped) return;
    keyWrapped = function (e) {
      const before = counterDraft && counterDraft.customerId; cur.apply(this, arguments);
      if (e.key !== 'Enter' || (counterDraft && counterDraft.customerId !== before)) return;
      const q = String(posCustomerSearch || '').trim(); if (!q) return;
      const ql = q.toLowerCase();
      const posHits = (state.customers || []).filter(c => [c.name, c.phone, c.address, c.customerNumber].some(x => String(x || '').toLowerCase().includes(ql)));
      if (posHits.length) return;
      const inPos = new Set((state.customers || []).map(c => String(c.customerNumber || '')).filter(Boolean));
      const ms = counterMatches(q, inPos);
      if (ms.length === 1) { e.preventDefault(); window.v296CounterPick(ms[0].num); }
    };
    window.v282SearchKey = keyWrapped;
  }

  /* ---------- install ---------- */
  function install() {
    window.renderPosCustomers = renderDirectory;
    wrapCounter(); wrapSearchKey();
    window.HATTAN_V2953_LOAD_ERROR = null;
  }
  install();
  // Earlier scripts may re-assign these after a delay; keep ours in place.
  let ticks = 0;
  const guard = setInterval(() => {
    if (window.renderPosCustomers !== renderDirectory) { install(); rerender(); }
    if (window.renderPosCounter !== counterWrapped || window.v282SearchKey !== keyWrapped) { wrapCounter(); wrapSearchKey(); }
    if (window.posCustDirSearch !== window.v296Search) window.posCustDirSearch = window.v296Search;
    if (++ticks % 10 === 0) pruneLegacyPlaceholders();
    if (ticks > 600) clearInterval(guard); // 60 s
  }, 100);
  load();
  document.addEventListener('DOMContentLoaded', () => { document.documentElement.setAttribute('data-hattan-release', 'V29.6'); window.HATTAN_RELEASE = 'V29.6'; });
  window.HATTAN_V296 = { prune: pruneLegacyPlaceholders, directory: D };
})();
