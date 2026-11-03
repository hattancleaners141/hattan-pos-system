/* V46 — Ticket numbers start at 700000.
   The old CleanBase system already used ticket numbers up to 601105, so new POS tickets start at
   700000 and can never repeat an old number. The counter only ever moves forward: if any device
   (or an old saved copy) ever sends a lower number back, it is pushed up again before the next
   ticket is made. */
(function () {
  'use strict';
  const START = 700000;
  function lift() {
    try {
      if (typeof state === 'undefined' || !state) return false;
      if (Number(state.nextTicket || 0) < START) { state.nextTicket = START; return true; }
    } catch (_) {}
    return false;
  }
  function liftAndSave() { if (lift() && typeof saveState === 'function') { try { saveState(); } catch (_) {} } }

  // Right before any ticket is made at the counter.
  ['posCompleteDropOff', 'v14CompleteDropOff', 'v8CompleteDropOff'].forEach(name => {
    const base = window[name];
    if (typeof base !== 'function') return;
    const wrapped = function v46LiftThenComplete() { lift(); return base.apply(this, arguments); };
    window[name] = wrapped;
    try { if (name === 'posCompleteDropOff') posCompleteDropOff = wrapped; } catch (_) {}
  });
  // When the screen redraws (the drop-off panel shows the upcoming ticket number).
  const baseRender = window.renderPosContent;
  if (typeof baseRender === 'function') {
    const r = function v46RenderPosContent() { lift(); return baseRender.apply(this, arguments); };
    window.renderPosContent = r; try { renderPosContent = r; } catch (_) {}
  }
  // On load, and after live updates arrive from other devices.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', liftAndSave); else liftAndSave();
  setInterval(liftAndSave, 3000);
  window.V46_TICKET_START = START;
})();
