/* Hattan Ops Suite V28.2.10 — thermal ticket apartment/unit hero fix */
(function () {
  'use strict';

  function getCustomer(order) {
    try { return order?.customerId && typeof customerById === 'function' ? customerById(order.customerId) : null; }
    catch (_) { return null; }
  }
  function getAddress(order) {
    try { if (typeof v8AddressForOrder === 'function') return v8AddressForOrder(order); } catch (_) {}
    const customer = getCustomer(order);
    return customer?.addresses?.find(a => a.id === order?.addressId) || customer?.addresses?.[0] || null;
  }
  function unitValue(order) {
    const address = getAddress(order);
    return String(address?.apartment || address?.unit || address?.apt || '')
      .replace(/^(?:apt\.?|apartment|unit|#)\s*/i, '')
      .replace(/\s*\*+\s*$/, '')
      .trim();
  }

  const previous = (typeof window.receiptTicketHTML === 'function')
    ? window.receiptTicketHTML
    : (typeof receiptTicketHTML === 'function' ? receiptTicketHTML : null);
  if (!previous) return;

  function fixedReceipt(order) {
    let html = previous(order);
    const unit = unitValue(order);

    // Remove every legacy apartment/unit hero so there can never be a left-aligned duplicate or auto-added *.
    html = html
      .replace(/<div class="v17-top-unit(?:[^"]*)">[\s\S]*?<\/div>/g, '')
      .replace(/<div class="v23-delivery-unit-label">[\s\S]*?<\/div>/g, '')
      .replace(/<div class="v23-delivery-unit">[\s\S]*?<\/div>/g, '');

    if (unit) {
      const hero = `<div class="v28210-unit-hero">${typeof esc === 'function' ? esc(unit.toUpperCase()) : unit.toUpperCase()}</div>`;
      // Keep RUSH above the apartment when present; otherwise apartment is the first item on the ticket.
      if (/<div class="v17-top-alert[^>]*>[\s\S]*?<\/div>/.test(html)) {
        html = html.replace(/(<div class="v17-top-alert[^>]*>[\s\S]*?<\/div>)/, `$1${hero}`);
      } else {
        html = html.replace(/(<section class="v8-print-ticket[^"]*">)/, `$1${hero}`);
      }
    }
    return html;
  }

  window.receiptTicketHTML = fixedReceipt;
  try { receiptTicketHTML = fixedReceipt; } catch (_) {}
})();
