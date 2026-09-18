(()=>{'use strict';
window.HATTAN_BUILD='V28.3.1';
// Keep custom POS controls keyboard/click accessible without changing native controls.
document.addEventListener('keydown',e=>{const el=e.target;if((e.key==='Enter'||e.key===' ')&&el&&el.matches('[role="button"][tabindex="0"]')){e.preventDefault();el.click();}},true);
// Surface broken inline handlers during testing instead of silently doing nothing.
window.addEventListener('error',e=>{if(/is not defined|is not a function/.test(String(e.message||''))) console.warn('[V28.3 button audit]',e.message);});
})();
