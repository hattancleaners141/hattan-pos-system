/* Hattan Ops Suite V28.3.2 — startup recovery
   Last-loaded watchdog: the secure splash may never become a permanent dead-end.
   It does not reveal shared business data when authentication is unresolved. */
(function installV2832StartupRecovery(){
  'use strict';
  window.HATTAN_BUILD = 'V28.3.2';

  function releaseSplash(){
    document.documentElement.classList.remove('v20-booting','v18-booting','v17-booting');
    var splash = document.getElementById('v17-boot-screen');
    if (splash) splash.remove();
  }

  function safeLoginFallback(){
    try {
      // If the live/shared session did not resolve, never expose cached business state.
      if (typeof v16IsShared === 'function' && v16IsShared()) {
        try { if (typeof v16ClearBusinessMemory === 'function') v16ClearBusinessMemory(); } catch (_) {}
        try { if (typeof v16ClearBrowserBusinessStorage === 'function') v16ClearBrowserBusinessStorage(); } catch (_) {}
        if (typeof state !== 'undefined') state.session = { loggedIn:false, staffId:null, register:null, clockInTime:null };
        if (typeof loginDraft !== 'undefined') loginDraft = { register:'Store POS', staffId:null, pin:'' };
      }
      // Disable the older V20 paint gate if it is still pending.
      try { if (typeof v20BootPending !== 'undefined') v20BootPending = false; } catch (_) {}
      releaseSplash();
      if (typeof renderPosRoot === 'function') renderPosRoot();
    } catch (err) {
      console.error('[V28.3.2 startup recovery]', err);
      releaseSplash();
      var root = document.getElementById('pos-root');
      if (root) root.innerHTML = '<div class="pos-login-wrap"><div class="pos-login-card"><div class="logo-mark" style="margin:0 auto 10px"></div><h2>Hattan POS</h2><p>The secure session could not be restored.</p><button class="btn btn-primary btn-block" onclick="location.reload()">Retry</button></div></div>';
    }
  }

  // Always release a stale splash. Normal boots remove it long before this fires.
  window.setTimeout(function(){
    if (!document.getElementById('v17-boot-screen')) return;
    console.warn('[V28.3.2] Startup splash watchdog activated');
    safeLoginFallback();
  }, 8000);

  // If the page is restored from Safari's back/forward cache, never restore a stale boot mask.
  window.addEventListener('pageshow', function(event){
    if (event.persisted) window.setTimeout(function(){
      if (document.getElementById('v17-boot-screen')) safeLoginFallback();
    }, 500);
  });
})();
