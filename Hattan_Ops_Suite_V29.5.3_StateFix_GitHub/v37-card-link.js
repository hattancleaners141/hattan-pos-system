/* Hattan Ops Suite V37 — "Text card link"
 * On the customer profile's card box: texts the customer a secure link where they type their
 * own card (with CVV + ZIP) into Clover's hosted form. When they save it, the card appears on
 * their profile and batch charging works for them. If they haven't opted in to texts, staff get
 * the link to copy and send another way.
 */
(function () {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };

  window.v37TextCardLink = async (customerId) => {
    const c = customerById(customerId); if (!c) return;
    const btn = document.querySelector('.v37-link-btn'); if (btn) btn.disabled = true;
    try {
      if (typeof window.hcPushAndWait === 'function') { try { await hcPushAndWait(); } catch (_) {} }
      const r = await v16Api('sms-notify', { method: 'POST', body: JSON.stringify({ kind: 'cardLink', customerId: c.id }) });
      const d = r.data || {};
      if (r.ok && d.sent) { toast(`Card link texted to ${fmtPhone(c.phone)}`, true, 'checkcircle'); return; }
      const why = (window.hcTexts && hcTexts.why) ? hcTexts.why(r) : (d.error || d.skipped || 'not sent');
      if (!d.link) { toast(`Card link not sent: ${why}`, false, 'alerttriangle'); return; }
      openPosModal(`<h3>Card link for ${E(c.name)}</h3>
        <p class="pm-sub">Not texted: ${E(why)}. Copy the link and send it another way (email, your phone). It works for 7 days and only for this customer.</p>
        <input id="v37-link" class="text-input" readonly value="${E(d.link)}" onclick="this.select()">
        <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="v37Copy()">Copy link</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Close</button>`);
    } finally { if (btn) btn.disabled = false; }
  };
  window.v37Copy = async () => {
    const el = document.getElementById('v37-link'); if (!el) return;
    try { await navigator.clipboard.writeText(el.value); } catch (_) { el.select(); document.execCommand && document.execCommand('copy'); }
    toast('Link copied', true, 'checkcircle');
  };

  function inject() {
    const box = document.querySelector('#pos-content .v298-card');
    if (!box || box.querySelector('.v37-link-btn') || !state.v7CustomerId) return;
    const c = customerById(state.v7CustomerId); if (!c) return;
    const has = (c.paymentMethods || []).some(p => p.processor === 'clover');
    box.insertAdjacentHTML('beforeend', `<button class="btn ${has ? 'btn-ghost' : 'btn-secondary'} v37-link-btn" onclick="v37TextCardLink('${E(c.id)}')" title="Customer types their own card on Clover's secure page">📱 Text card link</button>`);
  }
  let queued = false;
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; try { inject(); } catch (e) { console.error('V37 inject', e); } }); } });
  const start = () => obs.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
