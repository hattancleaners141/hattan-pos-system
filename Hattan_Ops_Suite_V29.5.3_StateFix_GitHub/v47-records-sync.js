/* Hattan Ops Suite V47 — tickets and customers sync one by one; numbers come from the database.
 *
 * Before V47 every save sent the WHOLE shop (all tickets + all customers) as one value, which
 * stops working past ~6 MB, and every device counted ticket numbers on its own, so two devices
 * could write the same ticket number (and one of the two tickets was then lost in the merge).
 *
 * From V47:
 *  - Each ticket / customer is its own database row with a revision number. A save sends only
 *    the records that changed. If another device changed the same record first, the server says
 *    so and this device merges field by field (both changes kept) and saves again.
 *  - Shop settings (prices, racks, texting switches …) still sync as one small value.
 *  - On sign-in a device loads every customer, every open ticket and finished tickets from the
 *    last 120 days, in pages. Older tickets load when a customer's profile is opened.
 *  - Ticket and customer numbers are handed out by the database in small blocks per device, so
 *    a device can keep writing tickets through a short internet drop and numbers never repeat.
 *
 * This file replaces the V16 sync functions (v16PushState, v16PullState, v16ReceiveRealtime …)
 * and keeps their names, so every older screen keeps working unchanged.
 */
(function () {
  'use strict';
  if (typeof v16Live === 'undefined') return;

  const KINDS = { orders: 'order', customers: 'customer' };
  const NOT_SETTINGS = new Set(['orders', 'customers', 'nextTicket', 'nextCustomerNumber']);
  const MAX_BATCH_BYTES = 1_500_000, MAX_BATCH_COUNT = 300;
  const R = window.HATTAN_V47 = {
    loaded: false, loading: null, cursor: 0,
    base: new Map(),            // "order:HC-700001" → { rev, text } — what the server has
    settingsBase: null,         // last settings snapshot in sync with the server
    historyLoaded: new Set(),   // customers whose older tickets were fetched
    pushChain: null, again: false, pullTimer: null,
  };

  // ---------------------------------------------------------------- helpers
  // Key order is not kept by the database, so compare with sorted keys.
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(x => (x === undefined || typeof x === 'function' ? 'null' : stable(x))).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined && typeof v[k] !== 'function').map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  R.stable = stable;
  const keyOf = (kind, id) => `${kind}:${id}`;
  const v296Sig = o => `${!!o.paid}|${o.status}|${Number(o.total || 0)}|${Number(o.discount || 0)}|${o.paymentMethod || ''}`;

  // The exact shape a record is stored in (same cleaning as V16's snapshot).
  function recordData(kind, rec) {
    const data = v16SafeClone(rec);
    if (kind === 'customer') {
      data.paymentMethods = (rec.paymentMethods || []).map(card => ({
        id: card.id, brand: card.brand || 'Card', last4: card.last4 || '',
        default: card.default !== false, processor: card.processor || (String(card.id || '').startsWith('clover_') ? 'clover' : 'legacy'),
      }));
    }
    return data;
  }
  // CleanBase history shown on a profile is read-only display data — only saved once staff change it.
  function syncable(kind, rec) {
    if (!rec || rec.id === undefined || rec.id === null || rec.id === '') return false;
    if (kind === 'order' && rec.__v294Loaded && !R.base.has(keyOf(kind, rec.id))) return !!(rec.__v296Sig && v296Sig(rec) !== rec.__v296Sig);
    return true;
  }
  function settingsSnapshot() {
    const snap = {};
    V16_SHARED_KEYS.forEach(key => { if (!NOT_SETTINGS.has(key) && state[key] !== undefined) snap[key] = v16SafeClone(state[key]); });
    snap.staff = (snap.staff || []).map(s => ({
      id: s.id, name: s.name, displayName: s.displayName || s.name, initials: s.initials,
      manager: !!s.manager, role: s.manager ? 'Manager' : '', active: s.active !== false, payRate: Number(s.payRate || 0),
    }));
    return snap;
  }
  // Records already confirmed equal to the server copy, keyed by object → "rev|raw JSON". A quick
  // native JSON.stringify tells us the object has not changed since, so the slower cleaning and
  // sorted comparison is skipped for the thousands of records nobody touched.
  let cleanCache = new WeakMap();
  function changedRecords() {
    const out = [];
    for (const [key, kind] of Object.entries(KINDS)) {
      for (const rec of state[key] || []) {
        if (!syncable(kind, rec)) continue;
        const k = keyOf(kind, rec.id), b = R.base.get(k);
        let raw = null;
        if (b) {
          try { raw = b.rev + '|' + JSON.stringify(rec); } catch (_) { raw = null; }
          if (raw !== null && cleanCache.get(rec) === raw) continue;
        }
        const data = recordData(kind, rec), text = stable(data);
        if (b && b.text === text) { if (raw !== null) cleanCache.set(rec, raw); continue; }
        out.push({ kind, id: String(rec.id), baseRev: b ? b.rev : 0, data, text });
      }
    }
    return out;
  }
  function hasLocalChanges() {
    if (changedRecords().length) return true;
    return !!R.settingsBase && stable(settingsSnapshot()) !== stable(R.settingsBase);
  }
  function setStatus(s) { v16Live.syncStatus = s; try { renderConnPills(); } catch (_) {} }

  // Put server records into the screen state. Records this device changed are merged field by field.
  // Returns true if anything on screen changed.
  function mergeIntoState(records, settingsRemote) {
    const lists = { order: (state.orders || []).slice(), customer: (state.customers || []).slice() };
    const index = { order: new Map(), customer: new Map() };
    lists.order.forEach((r, i) => r && index.order.set(String(r.id), i));
    lists.customer.forEach((r, i) => r && index.customer.set(String(r.id), i));
    const added = { order: [], customer: [] }, removed = { order: new Set(), customer: new Set() };
    let changed = false;
    for (const r of records) {
      if (r.kind !== 'order' && r.kind !== 'customer') continue;
      const kind = r.kind, id = String(r.id), k = keyOf(kind, id);
      R.cursor = Math.max(R.cursor, Number(r.rev) || 0);
      const b = R.base.get(k);
      if (b && Number(b.rev) >= Number(r.rev)) continue; // already have it
      const i = index[kind].get(id);
      const local = i === undefined ? undefined : lists[kind][i];
      const localDirty = local !== undefined && (!b || stable(recordData(kind, local)) !== b.text);
      if (r.deleted) {
        R.base.delete(k);
        if (local !== undefined && !localDirty) { removed[kind].add(id); changed = true; }
        continue;
      }
      R.base.set(k, { rev: Number(r.rev), text: stable(r.data) });
      if (local === undefined) { added[kind].push(r.data); changed = true; }
      else if (!localDirty) { lists[kind][i] = r.data; changed = true; }
      else {
        const baseData = b ? JSON.parse(b.text) : {};
        lists[kind][i] = v16MergeValue(recordData(kind, local), baseData, r.data);
        changed = true;
      }
    }
    if (!changed && !settingsRemote) return false;
    const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    const orders = [...added.order, ...lists.order.filter(o => !removed.order.has(String(o?.id)))].sort(byNewest);
    const customers = [...lists.customer.filter(c => !removed.customer.has(String(c?.id))), ...added.customer];
    // One apply call so every screen add-on (texts, garments, prices …) sees the same update.
    const snapshot = settingsRemote ? { ...settingsRemote } : { staff: settingsSnapshot().staff };
    snapshot.orders = orders; snapshot.customers = customers;
    v16ApplySnapshot(snapshot, false);
    return true;
  }

  // ---------------------------------------------------------------- numbers from the database
  const NUMBERS = {
    ticket: { prop: 'nextTicket', size: 25, low: 10, min: 1 },
    customer: { prop: 'nextCustomerNumber', size: 5, low: 2, min: 10001 },
  };
  const numKey = () => `hattan_v47_numbers_${(v16Live.config && v16Live.config.storeId) || 'main'}`;
  let numState = null;
  function loadNumbers() {
    if (numState) return numState;
    try { numState = JSON.parse(localStorage.getItem(numKey()) || 'null'); } catch (_) { numState = null; }
    if (!numState || typeof numState !== 'object') numState = {};
    for (const name of Object.keys(NUMBERS)) {
      const s = numState[name] = numState[name] || {};
      s.blocks = Array.isArray(s.blocks) ? s.blocks.filter(b => b && Number(b.next) <= Number(b.end)) : [];
      s.atLeast = Number(s.atLeast || NUMBERS[name].min);
      s.fallback = Number(s.fallback || 0);
      s.lastEnd = Number(s.lastEnd || 0);
      delete s.warned;
    }
    return numState;
  }
  function saveNumbers() { try { localStorage.setItem(numKey(), JSON.stringify(numState)); } catch (_) {} }
  const remaining = s => s.blocks.reduce((n, b) => n + (Number(b.end) - Number(b.next) + 1), 0);
  const inflight = {};
  function refill(name) {
    const s = loadNumbers()[name], cfg = NUMBERS[name];
    if (inflight[name] || !v16IsShared() || !v16Live.authenticated) return inflight[name];
    if (remaining(s) >= cfg.low) return Promise.resolve();
    inflight[name] = v16Api('state-sync', { method: 'POST', body: JSON.stringify({ op: 'reserve', name, count: cfg.size, atLeast: s.atLeast, clientId: v16Live.clientId }) })
      .then(r => {
        if (r.ok && Number.isSafeInteger(r.data?.first)) {
          const first = Number(r.data.first);
          const end = first + Number(r.data.count || cfg.size) - 1;
          s.blocks.push({ next: first, end });
          s.atLeast = Math.max(s.atLeast, first);
          s.lastEnd = Math.max(s.lastEnd, end);
          saveNumbers();
        }
      })
      .finally(() => { inflight[name] = null; });
    return inflight[name];
  }
  R.refillNumbers = () => Promise.all(Object.keys(NUMBERS).map(refill));
  // Highest number already used in the tickets / customers on this screen.
  function highestSeen(name) {
    let max = 0;
    if (name === 'ticket') (state.orders || []).forEach(o => { const t = String(o?.ticket || ''); if (/^\d{1,12}$/.test(t)) max = Math.max(max, Number(t)); });
    else (state.customers || []).forEach(c => { const m = /^C-(\d{1,12})$/.exec(String(c?.customerNumber || '')); if (m) max = Math.max(max, Number(m[1])); });
    return max;
  }
  let warnedNoNumbers = false;
  function currentNumber(name) {
    const s = loadNumbers()[name];
    if (s.blocks.length) return Number(s.blocks[0].next);
    // No reserved numbers (internet down for a long time): keep going above every number this
    // device has seen or been given. If another device used the same number meanwhile, the
    // server keeps both tickets and puts an alert on the staff bell.
    if (!warnedNoNumbers && name === 'ticket' && R.loaded) { warnedNoNumbers = true; try { toast('Internet is down — check ticket numbers once it is back', false, 'alerttriangle'); } catch (_) {} }
    return Math.max(s.fallback || 0, s.lastEnd ? s.lastEnd + 1 : 0, highestSeen(name) + 1, s.atLeast, NUMBERS[name].min);
  }
  function setNumber(name, value) {
    const s = loadNumbers()[name], cur = currentNumber(name), v = Number(value);
    if (!Number.isFinite(v)) return;
    if (v === cur + 1) {
      if (s.blocks.length) {
        s.blocks[0].next = v;
        if (v > s.blocks[0].end) s.blocks.shift();
        s.fallback = Math.max(s.fallback, v);
      } else s.fallback = v;
      saveNumbers();
      refill(name);
    } else if (v > cur + 1) {
      // Someone raised the starting point (e.g. "tickets start at 700000").
      s.atLeast = Math.max(s.atLeast, v);
      s.blocks = s.blocks.filter(b => Number(b.end) >= v).map(b => ({ next: Math.max(Number(b.next), v), end: b.end }));
      s.fallback = Math.max(s.fallback, v);
      saveNumbers();
      refill(name);
    }
    // Lower values (an old saved copy) are ignored: numbers only move forward.
  }
  let numbersInstalled = false;
  function installNumbers() {
    if (numbersInstalled) return;
    numbersInstalled = true;
    loadNumbers();
    for (const [name, cfg] of Object.entries(NUMBERS)) {
      const old = Number(state[cfg.prop] || 0);
      Object.defineProperty(state, cfg.prop, {
        configurable: true, enumerable: true,
        get: () => currentNumber(name),
        set: v => setNumber(name, v),
      });
      if (old > currentNumber(name)) setNumber(name, old);
    }
  }
  R.numbers = { current: currentNumber, state: () => loadNumbers() };

  // ---------------------------------------------------------------- loading
  async function loadInitial() {
    let after = 0, upto = null, first = null;
    const records = [];
    for (let guard = 0; guard < 500; guard++) {
      const q = `mode=initial&after=${after}${upto !== null ? `&upto=${upto}` : ''}`;
      const res = await v16Api(`state-sync?${q}`);
      if (!res.ok) return res;
      if (!first) first = res;
      upto = res.data.upto;
      records.push(...(res.data.records || []));
      if (!res.data.next) break;
      after = res.data.next;
    }
    const data = first.data;
    // The server copy replaces whatever this screen had (the built-in demo data, or a previous
    // signed-in session), exactly like the V16 loader did.
    R.base.clear();
    R.cursor = Number(upto || 0);
    records.forEach(r => { R.base.set(keyOf(r.kind, r.id), { rev: Number(r.rev), text: stable(r.data) }); R.cursor = Math.max(R.cursor, Number(r.rev)); });
    const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    const snapshot = data.exists ? { ...(data.snapshot || {}) } : settingsSnapshot();
    snapshot.orders = records.filter(r => r.kind === 'order').map(r => r.data).sort(byNewest);
    snapshot.customers = records.filter(r => r.kind === 'customer').map(r => r.data);
    v16Live.version = Number(data.version || 0);
    R.settingsBase = data.exists ? v16SafeClone(data.snapshot || {}) : null;
    v16Live.baseline = R.settingsBase;
    v16ApplySnapshot(snapshot, false);
    installNumbers();
    await R.refillNumbers();
    R.loaded = true;
    // Anything saved by other devices while the pages were loading.
    await pullChanges(false);
    return first;
  }

  async function pullChanges(render) {
    const records = [];
    let since = R.cursor, first = null;
    for (let guard = 0; guard < 200; guard++) {
      const res = await v16Api(`state-sync?since=${since}`);
      if (!res.ok) return res;
      if (!first) first = res;
      records.push(...(res.data.records || []));
      if (!res.data.next) break;
      since = res.data.next;
    }
    const data = first.data;
    let settingsRemote = null;
    if (data.exists && Number(data.version || 0) !== v16Live.version) {
      const remote = data.snapshot || {};
      const local = settingsSnapshot();
      const dirty = R.settingsBase && stable(local) !== stable(R.settingsBase);
      settingsRemote = dirty ? v16MergeSnapshots(local, R.settingsBase || {}, remote) : remote;
      v16Live.version = Number(data.version || 0);
      R.settingsBase = v16SafeClone(remote);
      v16Live.baseline = R.settingsBase;
      if (dirty) R.again = true;
    }
    const changed = mergeIntoState(records, settingsRemote);
    if (changed && render) v16SafeRender();
    if (R.again || changedRecords().length) queueSync();
    return first;
  }

  v16PullState = async function v47PullState(render = true) {
    if (!v16IsShared()) return { ok: false, status: 0, data: {} };
    let res;
    try {
      if (!R.loaded) {
        if (!R.loading) R.loading = loadInitial().finally(() => { R.loading = null; });
        res = await R.loading;
        if (res && res.ok && render) v16SafeRender();
      } else res = await pullChanges(render);
    } catch (e) {
      console.error('[V47 pull]', e);
      res = { ok: false, status: 0, data: { error: e.message } };
    }
    if (!res || !res.ok) { setStatus(res && res.status === 401 ? 'signed-out' : 'offline'); if (res && res.status === 401) v16Live.authenticated = false; return res || { ok: false, status: 0, data: {} }; }
    if (!['pending', 'syncing'].includes(v16Live.syncStatus)) setStatus('live');
    return res;
  };

  // ---------------------------------------------------------------- saving
  function batches(list) {
    const out = []; let cur = [], bytes = 0;
    for (const r of list) {
      const size = r.text.length + 200;
      if (cur.length && (cur.length >= MAX_BATCH_COUNT || bytes + size > MAX_BATCH_BYTES)) { out.push(cur); cur = []; bytes = 0; }
      cur.push(r); bytes += size;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  function findLocal(kind, id) {
    const list = state[kind === 'order' ? 'orders' : 'customers'] || [];
    return list.find(r => r && String(r.id) === String(id));
  }

  async function pushOnce() {
    const changes = changedRecords();
    let conflicts = [], anyFailure = false;
    for (const batch of batches(changes)) {
      const res = await v16Api('state-sync', { method: 'PUT', body: JSON.stringify({ clientId: v16Live.clientId, records: batch.map(({ kind, id, baseRev, data }) => ({ kind, id, baseRev, data })) }) });
      if (!res.ok) { anyFailure = res; break; }
      const result = res.data.records || { applied: [], conflicts: [], renamed: [] };
      const sent = new Map(batch.map(r => [keyOf(r.kind, r.id), r]));
      for (const a of result.applied || []) {
        const r = sent.get(keyOf(a.kind, a.id));
        if (r) R.base.set(keyOf(a.kind, a.id), { rev: Number(a.rev), text: r.text });
      }
      for (const m of result.renamed || []) {
        // Another device had already used this id (same ticket number). The server kept both.
        const r = sent.get(keyOf(m.kind, m.from));
        const local = findLocal(m.kind, m.from);
        if (local) local.id = m.to;
        if (r) R.base.set(keyOf(m.kind, m.to), { rev: Number(m.rev), text: stable({ ...r.data, id: m.to }) });
        try { toast(`Ticket #${m.ticket || m.from} was also used on another device — this one was saved as ${m.to}. Check the tags.`, false, 'alerttriangle'); } catch (_) {}
      }
      conflicts = conflicts.concat(result.conflicts || []);
    }
    if (anyFailure) return anyFailure;
    if (conflicts.length) {
      // Someone else saved these first: merge their copy with ours, then save again.
      mergeIntoState(conflicts, null);
      R.again = true;
    }
    // Settings
    const local = settingsSnapshot();
    if (R.settingsBase === null || stable(local) !== stable(R.settingsBase)) {
      const res = await v16Api('state-sync', { method: 'PUT', body: JSON.stringify({ clientId: v16Live.clientId, snapshot: local, baseVersion: v16Live.version }) });
      if (!res.ok) return res;
      const s = res.data.settings || {};
      if (s.conflict) {
        const remote = s.snapshot || {};
        const merged = v16MergeSnapshots(local, R.settingsBase || {}, remote);
        v16Live.version = Number(s.version || 0);
        R.settingsBase = v16SafeClone(remote);
        v16Live.baseline = R.settingsBase;
        v16ApplySnapshot({ ...merged, orders: state.orders, customers: state.customers }, false);
        R.again = true;
      } else {
        v16Live.version = Number(s.version || v16Live.version);
        R.settingsBase = v16SafeClone(local);
        v16Live.baseline = R.settingsBase;
        if (stable(local).length > 2_000_000) console.warn('[V47] shop settings are larger than 2 MB — clock log / delivery batches should be trimmed');
      }
    }
    if (changes.length || conflicts.length) v16Live.savedAt = Date.now();
    return { ok: true };
  }

  function runPush() {
    if (!v16IsShared() || !v16Live.authenticated || !R.loaded) return Promise.resolve();
    if (R.pushChain) { R.again = true; return R.pushChain; }
    R.pushChain = (async () => {
      v16Live.syncing = true;
      setStatus('syncing');
      let result = { ok: true };
      try {
        for (let round = 0; round < 6; round++) {
          R.again = false;
          result = await pushOnce();
          if (!result.ok || !R.again) break;
        }
      } catch (e) { console.error('[V47 push]', e); result = { ok: false, status: 0 }; }
      v16Live.syncing = false;
      R.pushChain = null;
      if (!result.ok) {
        setStatus(result.status === 401 ? 'signed-out' : 'offline');
        if (result.status === 401) v16Live.authenticated = false;
        else { clearTimeout(v16Live.syncTimer); v16Live.syncTimer = setTimeout(runPush, 5000); } // keep trying
      } else setStatus(hasLocalChanges() ? 'pending' : 'live');
      if (result.ok && hasLocalChanges()) { clearTimeout(v16Live.syncTimer); v16Live.syncTimer = setTimeout(runPush, 400); }
      try { renderConnPills(); } catch (_) {}
    })();
    return R.pushChain;
  }
  function queueSync() {
    if (!v16IsShared() || !v16Live.authenticated || !R.loaded) return;
    clearTimeout(v16Live.syncTimer);
    if (v16Live.syncStatus !== 'pending' && v16Live.syncStatus !== 'syncing') setStatus('pending');
    v16Live.syncTimer = setTimeout(runPush, 900);
  }
  // Saving right now (e.g. before charging a card for a ticket just written) waits for everything
  // already being saved as well.
  v16PushState = async function v47PushState() {
    clearTimeout(v16Live.syncTimer);
    await runPush();
    if (R.pushChain) await R.pushChain;
  };
  v16QueueSync = queueSync;
  v16HasLocalChanges = hasLocalChanges;
  v16MarkSynced = function () {};

  // ---------------------------------------------------------------- realtime & sign-out
  v16ReceiveRealtime = function v47ReceiveRealtime(row) {
    if (!row || !R.loaded) return;
    const newer = Number(row.records_rev || 0) > R.cursor || Number(row.version || 0) > v16Live.version;
    if (!newer) return;
    clearTimeout(R.pullTimer);
    R.pullTimer = setTimeout(async () => {
      const res = await v16PullState(true);
      if (res && res.ok && row.updated_client && row.updated_client !== v16Live.clientId) {
        try { toast(`Updated from another device · ${row.updated_by || 'staff'}`, true, 'refresh'); } catch (_) {}
      }
    }, 250);
  };
  const baseClear = v16ClearBusinessMemory;
  v16ClearBusinessMemory = function v47ClearBusinessMemory() {
    baseClear();
    R.loaded = false; R.base.clear(); R.cursor = 0; R.settingsBase = null; R.historyLoaded.clear();
  };

  v16InitializeSharedStore = async function v47InitializeSharedStore(blank = true, confirmFirst = true) {
    if (confirmFirst) {
      const text = blank ? 'Create a blank shared store? Existing shared data will not be overwritten.' : 'Copy this browser’s current test data into the shared database? Use this only if you intentionally want the sample/current records.';
      if (!confirm(text)) return { ok: false, cancelled: true };
    }
    const current = await v16Api('state-sync');
    if (!current.ok) return current;
    if (current.data?.exists) return { ok: false, status: 409, data: { error: 'Shared data already exists. This safety check prevents accidental overwrites.' } };
    const snapshot = blank ? v16BlankSnapshot() : v16BuildSnapshot();
    const settings = {}; Object.keys(snapshot).forEach(k => { if (!NOT_SETTINGS.has(k)) settings[k] = snapshot[k]; });
    const response = await v16Api('state-sync', { method: 'PUT', body: JSON.stringify({ clientId: v16Live.clientId, snapshot: settings, baseVersion: 0 }) });
    if (!response.ok || response.data?.settings?.conflict) return response.ok ? { ok: false, status: 409, data: { error: 'Shared data already exists.' } } : response;
    v16Live.version = Number(response.data.version || 1);
    R.settingsBase = v16SafeClone(settings);
    v16Live.baseline = R.settingsBase;
    v16ApplySnapshot({ ...settings, orders: blank ? [] : snapshot.orders, customers: blank ? [] : snapshot.customers }, false);
    installNumbers();
    await R.refillNumbers();
    R.loaded = true;
    setStatus('live');
    if (!blank) queueSync();
    return { ok: true, status: 200, data: { version: v16Live.version } };
  };

  // ---------------------------------------------------------------- older tickets on demand
  async function loadCustomerHistory(customerId) {
    const id = String(customerId || '');
    if (!id || R.historyLoaded.has(id) || !R.loaded || !v16IsShared()) return;
    R.historyLoaded.add(id);
    const res = await v16Api(`state-sync?customer=${encodeURIComponent(id)}`);
    if (!res.ok) { R.historyLoaded.delete(id); return; }
    const fresh = (res.data.records || []).filter(r => !R.base.has(keyOf(r.kind, r.id)));
    if (fresh.length && mergeIntoState(fresh, null) && state.v7CustomerId === id) {
      try { renderV7CustomerProfile(); } catch (_) {}
    }
  }
  R.loadCustomerHistory = loadCustomerHistory;
  if (typeof v7OpenCustomerProfile === 'function') {
    const baseOpen = v7OpenCustomerProfile;
    v7OpenCustomerProfile = function v47OpenCustomerProfile(custId) {
      const r = baseOpen.apply(this, arguments);
      loadCustomerHistory(custId).catch(e => console.error('[V47 history]', e));
      return r;
    };
    window.v7OpenCustomerProfile = v7OpenCustomerProfile;
  }

  // Test hooks (used by tests/v47-client.test.mjs).
  R._test = { changedRecords, mergeIntoState, settingsSnapshot, runPush, loadInitial, pullChanges, currentNumber, setNumber, installNumbers };
})();
