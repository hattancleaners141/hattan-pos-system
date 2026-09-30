/* Hattan Ops Suite V32 — counter fixes
 * - "Scan for Delivery" list and chosen driver survive a page reload on this computer.
 * - Checkout Pickup / Delivery buttons show which one is chosen (CSS in v32-pos-fixes.css).
 * - Sync pill: steady "Saved · Live" / "Saving…" with a fixed width so the header doesn't jump.
 */
(function () {
  'use strict';
  const KEY = 'hattan_delivery_scan_v32';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* storage blocked */ } };
  const ui = () => (state.deliveryUi = state.deliveryUi || { input: '', scanned: [], driverId: '' });
  const current = () => { const u = ui(); return JSON.stringify({ scanned: Array.isArray(u.scanned) ? u.scanned : [], driverId: u.driverId || '' }); };

  // Restore once at start-up (only fills an empty list, so it never overrides fresh work).
  let last = null;
  function restore() {
    const saved = read(); const u = ui();
    if (!Array.isArray(u.scanned)) u.scanned = [];
    if (saved && Array.isArray(saved.scanned) && saved.scanned.length && !u.scanned.length) u.scanned = saved.scanned.slice(0, 500);
    if (saved && saved.driverId && !u.driverId) u.driverId = saved.driverId;
    last = current();
  }
  function persist() {
    if (!started) return;
    try {
      const now = current();
      if (now !== last) { last = now; write(JSON.parse(now)); }
    } catch (_) { /* ignore */ }
  }
  // The POS start-up (loadState on DOMContentLoaded) replaces state.deliveryUi, so restore after it.
  let started = false;
  function start() { if (started) return; started = true; restore(); setInterval(persist, 1000); }
  if (typeof loadState === 'function') {
    const baseLoad = loadState;
    loadState = function v32LoadState() { const r = baseLoad.apply(this, arguments); started ? restore() : start(); return r; };
  }
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  // Cheap check once a second (started above) plus on every save / before leaving the page.
  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);
  if (typeof saveState === 'function') {
    const base = saveState;
    saveState = function v32SaveState() { const r = base.apply(this, arguments); persist(); return r; };
  }
  // The live data loader replaces state after sign-in; put the scan list back if it got cleared.
  if (typeof v16ApplySnapshot === 'function') {
    const baseApply = v16ApplySnapshot;
    v16ApplySnapshot = function v32ApplySnapshot() {
      const keep = current();
      const r = baseApply.apply(this, arguments);
      const u = ui(); const k = JSON.parse(keep);
      if (!Array.isArray(u.scanned) || !u.scanned.length) u.scanned = k.scanned;
      if (!u.driverId && k.driverId) u.driverId = k.driverId;
      return r;
    };
  }
})();
