/* HATTAN OPS V23.5 STABLE
   Replaces the layered V17/V18/V20 startup wrappers with one bounded boot path.
   It intentionally leaves business, payment, intake, printing, and sync features intact. */
(function installV235StableBoot(){
  'use strict';
  window.V23_BUILD = '23.5.0-stable';

  // Bypass the V18/V20 render gates. v18BaseRenderPosRoot is the normal renderer
  // captured before those loading wrappers were installed.
  if (typeof v18BaseRenderPosRoot === 'function') {
    renderPosRoot = function v235RenderPosRoot(){
      const result = v18BaseRenderPosRoot();
      try { if (typeof v18ClearNavigationSelection === 'function') v18ClearNavigationSelection(); } catch (_) {}
      return result;
    };
    window.renderPosRoot = renderPosRoot;
  }

  function releaseBootMask(){
    document.documentElement.classList.remove('v20-booting','v18-booting','v17-booting');
    const gate = document.getElementById('v17-boot-screen');
    if (gate) gate.remove();
  }

  function showFatal(message){
    releaseBootMask();
    const root = document.getElementById('pos-root');
    if (!root) return;
    root.innerHTML = `<div class="pos-login-wrap"><div class="pos-login-card v16-setup-gate">
      <div class="logo-mark" style="margin:0 auto 10px"></div>
      <h2>POS could not finish loading</h2>
      <p>${typeof esc === 'function' ? esc(message || 'Unknown startup error') : String(message || 'Unknown startup error')}</p>
      <button class="btn btn-primary btn-block" onclick="location.reload()">Retry</button>
    </div></div>`;
  }

  function timeout(ms, label){
    return new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'Request timed out')), ms));
  }
  async function bounded(promise, ms, label){
    return Promise.race([promise, timeout(ms, label)]);
  }

  async function stableBoot(){
    try {
      // Keep the existing secure mask visible only while bounded startup calls run.
      const configResponse = await bounded(v16Api('runtime-config'), 8000, 'Runtime configuration timed out');
      v16Live.config = configResponse && configResponse.ok ? configResponse.data : { mode:'local', sync:{}, clover:{} };
      v16Live.booted = true;

      if (!v16IsShared()) {
        v16Live.syncStatus = 'offline';
        releaseBootMask();
        renderPosRoot();
        try { renderConnPills(); } catch (_) {}
        return;
      }

      const staffResponse = await bounded(v16FetchStaff(), 10000, 'Staff list timed out');
      if (!staffResponse.ok) {
        releaseBootMask();
        return v16SetupRequiredScreen(staffResponse.data?.error || 'Supabase could not be reached.');
      }
      if (staffResponse.data?.needsBootstrap) {
        releaseBootMask();
        return v16BootstrapScreen();
      }

      const sessionResponse = await bounded(v16Api('session'), 10000, 'Session check timed out');
      if (sessionResponse.ok && sessionResponse.data?.authenticated) {
        v16SetSession(sessionResponse.data.staff);
        v16Live.realtimeToken = sessionResponse.data.realtimeToken || '';
        const stateResponse = await bounded(v16PullState(false), 12000, 'Store data sync timed out');
        if (stateResponse?.ok && !stateResponse.data?.exists && sessionResponse.data.staff?.manager) {
          await bounded(v16InitializeSharedStore(true, false), 12000, 'Store initialization timed out');
        }
        releaseBootMask();
        renderPosRoot();
        // Realtime must never block the dashboard becoming usable.
        Promise.resolve().then(() => v16StartRealtime(v16Live.realtimeToken)).catch(() => {});
      } else {
        v16Live.authenticated = false;
        state.session = { loggedIn:false, staffId:null, register:null, clockInTime:null };
        try { v16ClearBusinessMemory(); } catch (_) {}
        loginDraft = { register:'Store POS', staffId:null, pin:'' };
        try { v16ClearBrowserBusinessStorage(); } catch (_) {}
        releaseBootMask();
        renderPosRoot();
      }
      try { renderConnPills(); } catch (_) {}
    } catch (error) {
      console.error('[V23.5 stable boot]', error);
      showFatal(error?.message || 'The secure POS did not finish initializing.');
    }
  }

  // Replace the wrapper chain before the V16 DOMContentLoaded callback fires.
  v16Boot = stableBoot;
  window.v16Boot = stableBoot;

  // Direct branding; no MutationObserver or polling.
  function brand(){
    document.querySelectorAll('.ps-brand .wordmark small').forEach(el => { el.textContent = 'Staff POS · V23.5 Stable'; });
  }
  const oldRender = renderPosRoot;
  renderPosRoot = function v235BrandedRender(){
    const result = oldRender();
    brand();
    return result;
  };
  window.renderPosRoot = renderPosRoot;

  // Safety valve: a network or browser edge case must never leave an invisible page.
  setTimeout(() => {
    const root = document.getElementById('pos-root');
    const hasUi = root && root.children && root.children.length > 0;
    if (!hasUi) showFatal('Startup took too long. Please retry.');
    else releaseBootMask();
  }, 18000);
})();
