/* Hattan Ops Suite V35 — every garment on the counter, with a picture
 *
 * 1. Repairs the garment / alteration button lists. (A V32 sync bug shrank the shared
 *    "drycleanOrder" list to one item, so the counter showed only "Vest".) The list is rebuilt
 *    from the shop's order + every dry-clean and household item in the catalog, keeping the order.
 * 2. Regular counter: all garments show at once (no "More"), each with a line drawing.
 *    Simple counter: same pictures, and the rest of the garments are added under the top 8.
 */
(function () {
  'use strict';
  const DEFAULT_DRY = ['g_pants', 'g_shirt_dc', 'g_blouse', 'g_sweater', 'g_dress', 'g_suit2', 'g_jacket', 'g_skirt', 'g_coat', 'g_tie', 'g_scarf', 'g_shorts', 'g_vest'];
  const DEFAULT_ALT = ['pants_hem_short', 'jeans_hem', 'jeans_hem_original', 'patch', 'sweater_hole', 'crotch_hole', 'waist_in', 'waist_out', 'shirt_taper', 'blouse_taper', 'sport_jacket_taper', 'jacket_zipper', 'winter_jacket_zipper',
    'pants_hem', 'pants_waist', 'pants_zipper', 'pants_seam', 'dress_hem', 'dress_zipper', 'jacket_sleeve', 'jacket_button', 'shirt_button', 'shirt_seam', 'coat_zipper', 'general_patch', 'general_hook', 'general_custom'];
  const shared = () => { try { return typeof v16IsShared === 'function' && v16IsShared(); } catch (_) { return false; } };

  /* ---------------- 1. repair the lists ---------------- */
  function repair() {
    if (typeof state === 'undefined' || !state) return false;
    state.interfaceSettings = state.interfaceSettings || {};
    const s = state.interfaceSettings, cat = state.garmentCatalog || [];
    const isGarment = id => cat.some(g => g && g.id === id);
    const dryIds = cat.filter(g => g && ['dryclean', 'household'].includes(g.service) && g.active !== false).map(g => g.id);
    const before = JSON.stringify([s.drycleanOrder, s.alterationOrder]);
    const dry = [];
    [...(Array.isArray(s.drycleanOrder) ? s.drycleanOrder : []), ...DEFAULT_DRY, ...dryIds].forEach(id => { if (typeof id === 'string' && isGarment(id) && !dry.includes(id)) dry.push(id); });
    s.drycleanOrder = dry;
    if (typeof ALTERATION_VARIANTS !== 'undefined') {
      const valid = id => ALTERATION_VARIANTS.some(a => a.id === id);
      const alt = [];
      [...(Array.isArray(s.alterationOrder) ? s.alterationOrder : []), ...DEFAULT_ALT, ...ALTERATION_VARIANTS.map(a => a.id)].forEach(id => { if (typeof id === 'string' && valid(id) && !alt.includes(id)) alt.push(id); });
      s.alterationOrder = alt;
    }
    return JSON.stringify([s.drycleanOrder, s.alterationOrder]) !== before;
  }
  let pushTimer = null;
  function repairAndSave() {
    if (!repair()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} }, 500);
  }
  repairAndSave();
  if (typeof v16ApplySnapshot === 'function') {
    const base = v16ApplySnapshot;
    v16ApplySnapshot = function v35Apply() { const r = base.apply(this, arguments); try { repairAndSave(); } catch (_) {} return r; };
  }
  window.hcRepairGarments = repairAndSave;

  /* ---------------- 2. pictures ---------------- */
  const P = {
    pants: '<path d="M7 3h10l1.2 18h-4.4L12 10.5 10.2 21H5.8z"/><path d="M7 6h10"/>',
    shirt: '<path d="M9 3l3 3 3-3 5 3-2 4.5-2-1V21H8V9.5l-2 1L4 6z"/><path d="M12 6v15"/><path d="M10.5 3.5L12 8l1.5-4.5"/>',
    blouse: '<path d="M9 3c1 2 5 2 6 0l5 3-2 4.5-2-1.2V21H8V9.3L6 10.5 4 6z"/><path d="M10 9h4"/>',
    sweater: '<path d="M8 3h8l5 4-2 3.5-2-1V21H7V9.5l-2 1L3 7z"/><path d="M9.5 3c.5 1.5 4.5 1.5 5 0"/><path d="M7 18h10M9 18v3M12 18v3M15 18v3"/>',
    dress: '<path d="M9.5 3h5l-.8 4.5L18.5 21h-13l4.8-13.5z"/><path d="M10.3 7.5h3.4"/>',
    skirt: '<path d="M7.5 5h9l3.5 15H4z"/><path d="M7.5 7.5h9M10 7.5L8.5 20M14 7.5l1.5 12.5"/>',
    suit: '<path d="M8 3l4 6 4-6 4 3-1.5 15h-13L4 6z"/><path d="M12 9l-1.2 2.5L12 18l1.2-6.5z"/><path d="M8 3l2 7M16 3l-2 7"/>',
    jacket: '<path d="M8 3l4 7 4-7 4 3-1.5 15h-13L4 6z"/><path d="M12 10v11"/><circle cx="13.5" cy="14" r=".6"/><circle cx="13.5" cy="17" r=".6"/><path d="M8 3l2.5 8M16 3l-2.5 8"/>',
    coat: '<path d="M8 2.5l4 6 4-6 4 3-1 16.5H5L4 5.5z"/><path d="M12 8.5V22"/><path d="M6 14h12"/><circle cx="13.5" cy="11" r=".6"/><circle cx="13.5" cy="17.5" r=".6"/>',
    tie: '<path d="M10 3h4l-1 2.5 2.5 11L12 21l-3.5-4.5 2.5-11z"/><path d="M11 5.5h2"/>',
    scarf: '<path d="M5 5h14v4H5z"/><path d="M14 9l1 11h3l-1-11"/><path d="M15 20v1.5M16.5 20v1.5M18 20v1.5"/>',
    shorts: '<path d="M6 5h12l1.2 10h-5.2L12 10l-2 5H4.8z"/><path d="M6 7.5h12"/>',
    vest: '<path d="M8 3l4 6 4-6 3 3v15h-6l-1-12-1 12H5V6z"/><circle cx="12" cy="12.5" r=".6"/><circle cx="12" cy="15.5" r=".6"/>',
    comforter: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 12.5h18M9 6v13M15 6v13"/>',
    blanket: '<rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 9h18M6 6v13"/>',
    rug: '<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M4 9H2M4 12H2M4 15H2M20 9h2M20 12h2M20 15h2"/>',
    curtains: '<path d="M3 4h18"/><path d="M5 4c0 6 1 11 3 16h3c-1-5-1-11-1-16M19 4c0 6-1 11-3 16h-3c1-5 1-11 1-16"/>',
    hanger: '<path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5L3 15h18z"/>',
    gown: '<path d="M10 3h4l-.5 4 5.5 14H5l5.5-14z"/><path d="M8 13c2 1 6 1 8 0"/>',
    jeans: '<path d="M7 3h10l1.2 18h-4.4L12 10.5 10.2 21H5.8z"/><path d="M7 6h10M9 6l.5 2.5M15 6l-.5 2.5"/>',
  };
  function kind(id, name) {
    const byId = { g_pants: 'pants', g_shirt_dc: 'shirt', g_blouse: 'blouse', g_sweater: 'sweater', g_dress: 'dress', g_skirt: 'skirt', g_suit2: 'suit', g_jacket: 'jacket', g_coat: 'coat', g_tie: 'tie', g_scarf: 'scarf', g_shorts: 'shorts', g_vest: 'vest', g_comforter: 'comforter', g_blanket: 'blanket', g_bathrug: 'rug', g_curtains: 'curtains', g_lshirt: 'shirt', g_lshirt_box: 'shirt' };
    if (byId[id]) return byId[id];
    const n = String(name || '').toLowerCase();
    const rules = [['gown', 'gown'], ['jean', 'jeans'], ['short', 'shorts'], ['pant', 'pants'], ['trouser', 'pants'], ['slack', 'pants'], ['blouse', 'blouse'], ['sweater', 'sweater'], ['cardigan', 'sweater'], ['knit', 'sweater'], ['dress', 'dress'], ['skirt', 'skirt'], ['suit', 'suit'],
      ['blazer', 'jacket'], ['jacket', 'jacket'], ['coat', 'coat'], ['parka', 'coat'], ['tie', 'tie'], ['scarf', 'scarf'], ['vest', 'vest'], ['comforter', 'comforter'], ['duvet', 'comforter'], ['blanket', 'blanket'], ['rug', 'rug'], ['curtain', 'curtains'], ['drape', 'curtains'], ['shirt', 'shirt']];
    for (const [k, v] of rules) if (n.includes(k)) return v;
    return 'hanger';
  }
  const svg = (id, name, size) => `<svg class="v35-garment-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[kind(id, name)]}</svg>`;
  window.hcGarmentIcon = (id, size = 34) => { const g = typeof garmentById === 'function' ? garmentById(id) : null; return svg(id, g && g.name, size); };

  let expanded = false;
  function decorate() {
    const content = document.getElementById('pos-content'); if (!content) return;
    // Regular counter: open the full list once, then draw pictures.
    const grid = content.querySelector('.v282-grid');
    if (grid && grid.querySelector('button[onclick^="v282Garment("]')) {
      const more = grid.querySelector('button[onclick="v282More()"]');
      if (more && !expanded && typeof window.v282More === 'function') { expanded = true; window.v282More(); return; }
      grid.querySelectorAll('button[onclick^="v282Garment("]').forEach(b => {
        if (b.querySelector('.v35-garment-svg')) return;
        const id = (/v282Garment\('([^']+)'/.exec(b.getAttribute('onclick')) || [])[1];
        b.classList.add('v35-garment-btn');
        b.insertAdjacentHTML('afterbegin', `<span class="v35-garment-pic">${window.hcGarmentIcon(id, 40)}</span>`);
      });
    }
    // Simple counter: pictures + the rest of the garments.
    const tiles = [...content.querySelectorAll('.v13-tile[onclick^="posSetBuilderGarment("]')];
    if (tiles.length) {
      const wrap = tiles[0].parentElement;
      const shown = new Set(tiles.map(t => (/posSetBuilderGarment\('([^']+)'/.exec(t.getAttribute('onclick')) || [])[1]));
      if (!wrap.querySelector('.v35-extra')) {
        const sel = (typeof counterDraft !== 'undefined' && counterDraft && counterDraft.builder) ? counterDraft.builder.garmentId : '';
        (state.interfaceSettings?.drycleanOrder || []).filter(id => !shown.has(id)).forEach(id => {
          const g = garmentById(id); if (!g) return;
          wrap.insertAdjacentHTML('beforeend', `<div class="v13-tile v35-extra ${sel === id ? 'selected' : ''}" onclick="posSetBuilderGarment('${id}')"><div class="v13-tile-ic"></div><strong>${typeof v13GarmentName === 'function' ? esc(v13GarmentName(id)) : esc(g.name)}</strong><small>${money(g.basePrice)}</small></div>`);
        });
      }
      wrap.querySelectorAll('.v13-tile[onclick^="posSetBuilderGarment("]').forEach(t => {
        const ic = t.querySelector('.v13-tile-ic'); if (!ic || ic.querySelector('.v35-garment-svg')) return;
        const id = (/posSetBuilderGarment\('([^']+)'/.exec(t.getAttribute('onclick')) || [])[1];
        ic.innerHTML = window.hcGarmentIcon(id, 30);
      });
    }
  }
  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; try { decorate(); } catch (e) { console.error('V35 garments', e); } }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // Re-check once the live data has loaded.
  let n = 0; const t = setInterval(() => { n++; if (shared() && typeof v16Live !== 'undefined' && v16Live.authenticated) { repairAndSave(); clearInterval(t); } else if (n > 60) clearInterval(t); }, 1000);
})();
