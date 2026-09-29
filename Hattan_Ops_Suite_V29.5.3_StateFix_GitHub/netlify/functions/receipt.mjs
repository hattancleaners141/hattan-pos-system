// GET /r/<token> — customer-facing receipt page linked from text messages.
// The token is signed per ticket, so links can't be guessed or edited to see other tickets.
import { loadStore, orderIdFromToken, SHOP, baseDue } from './lib/sms.mjs';

const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const usd = n => '$' + r2(n).toFixed(2);
const page = (status, inner) => ({
  statusCode: status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt · ${SHOP.name}</title>
<style>:root{--ink:#1d2433;--muted:#5b6475;--line:#e6e2d8;--bg:#f6f4ef;--ok:#1f6f43;--due:#b54708}
@media (prefers-color-scheme:dark){:root{--ink:#eceae4;--muted:#a3a9b6;--line:#343a46;--bg:#15181e}.card{background:#1d2129!important}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:520px;margin:0 auto;padding:24px 16px 48px}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px}
h1{font-size:22px;margin:0}.sub{color:var(--muted);font-size:14px;margin:2px 0 16px}table{width:100%;border-collapse:collapse}td{padding:7px 0;vertical-align:top;border-bottom:1px solid var(--line)}
td.r{text-align:right;white-space:nowrap;padding-left:12px}.note{color:var(--muted);font-size:13px}.tot td{border:none;padding:4px 0}.grand td{font-weight:700;font-size:18px;border-top:2px solid var(--ink);padding-top:10px}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:600;font-size:14px;margin-top:14px}.paid{background:#e6f4ec;color:var(--ok)}.unpaid{background:#fff4e5;color:var(--due)}
footer{color:var(--muted);font-size:13px;text-align:center;margin-top:18px}</style></head><body><main>${inner}
<footer>${SHOP.name} · ${SHOP.address}, New York, NY · ${SHOP.phone}</footer></main></body></html>`,
});

function lineAmount(l) {
  let cash = Number(l.unitPrice || 0) * Number(l.qty || 0);
  if (l.pricingVersion === 'flat-upcharge-v17') cash += Number(l.materialUpcharge || 0);
  cash = r2(cash);
  return l.cardPrice ? r2(cash / 0.97) : cash;
}

// Example link used in the carrier (A2P) campaign sample messages: shows a clearly labeled
// sample receipt with made-up data, never a real customer's ticket.
const SAMPLE_TOKENS = new Set(['SEMtMTA0ODI.k7Qm2xPa9LwE3rTz', 'sample']);
const SAMPLE_STORE = {
  garmentCatalog: [{ id: 'g_pants', name: 'Pants' }, { id: 'g_blouse', name: 'Blouse' }, { id: 'g_lshirt', name: 'Laundered Shirt' }],
  orders: [{
    id: 'SAMPLE', ticket: '10482', status: 'dropped_off', dueDate: '2026-10-01', createdAt: '2026-09-29T15:00:00Z',
    pricing: 'card-price-v299', total: 26.70, cashPrice: 25.90, discount: 0, paid: true, paymentMethod: 'Card on file •4242', amountCharged: 26.70,
    lineItems: [
      { garmentId: 'g_pants', qty: 1, unitPrice: 12.95, cardPrice: true },
      { garmentId: 'g_blouse', qty: 1, unitPrice: 8.95, cardPrice: true },
      { garmentId: 'g_lshirt', qty: 1, unitPrice: 4.00, cardPrice: true },
    ],
  }],
};

export const handler = async (event) => {
  const token = (event.queryStringParameters?.t || String(event.path || '').split('/r/')[1] || '').split(/[/?#]/)[0];
  const sample = SAMPLE_TOKENS.has(token);
  let orderId = sample ? 'SAMPLE' : null;
  if (!sample) { try { orderId = orderIdFromToken(token); } catch { orderId = null; } }
  if (!orderId) return page(404, `<div class="card"><h1>Receipt not found</h1><p class="sub">This link isn't valid. Call us at ${SHOP.phone}.</p></div>`);
  let store;
  if (sample) store = SAMPLE_STORE;
  else { try { store = await loadStore(); } catch { return page(503, `<div class="card"><h1>Please try again</h1><p class="sub">We couldn't load your receipt right now.</p></div>`); } }
  const o = (store.orders || []).find(x => String(x?.id) === orderId);
  if (!o || o.status === 'voided') return page(404, `<div class="card"><h1>Receipt not available</h1><p class="sub">Call us at ${SHOP.phone}.</p></div>`);
  const garments = store.garmentCatalog || [];
  const lines = (o.lineItems || o.itemsDetail || []).map(l => {
    const g = garments.find(x => x.id === l.garmentId);
    const label = l.serviceType === 'alterations' && l.garmentNote ? String(l.garmentNote).split(' · ').slice(0, 2).join(' · ') : (g?.name || l.name || 'Item');
    const qty = l.serviceType === 'washfold' ? `${Number(l.qty)} lb` : `${Number(l.qty) || 1} ×`;
    return `<tr><td>${E(qty)} ${E(label)}</td><td class="r">${usd(lineAmount(l))}</td></tr>`;
  }).join('') || `<tr><td>${E(o.items || 'Order')}</td><td class="r">${usd(o.total)}</td></tr>`;
  const cashDisc = Number(o.cashDiscount || 0), otherDisc = r2(Number(o.discount || 0) - cashDisc), credit = Number(o.storeCreditApplied || 0);
  const newModel = o.pricing === 'card-price-v299';
  const due = baseDue(o);
  const paid = o.paid || o.paymentStatus === 'paid';
  const charged = paid ? Number(o.amountCharged ?? o.amountPaid ?? due) || due : due;
  const surcharge = paid && !newModel ? Number(o.surcharge || 0) : 0;
  const ratio = Number(o.total) > 0 && o.cashPrice != null ? Number(o.cashPrice) / Number(o.total) : 0.97;
  const method = String(o.paymentMethod || '').replace(/Clover card on file/i, 'Card on file');
  const placed = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '';
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(o.dueDate || '')) ? new Date(o.dueDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const statusText = { dropped_off: 'Received', in_cleaning: 'In progress', quality_check: 'In progress', ready: 'Ready for pickup', picked_up: 'Picked up', out_for_delivery: 'Out for delivery', delivered: 'Delivered' }[o.status] || 'Received';
  const inner = `${sample ? '<p class="note" style="text-align:center;margin:0 0 10px">Sample receipt — example of what customers see</p>' : ''}<div class="card"><h1>${SHOP.name}</h1><p class="sub">Ticket #${E(String(o.ticket || o.id).replace(/^HC-/, ''))}${placed ? ' · ' + E(placed) : ''} · ${E(statusText)}${dueDate && !['picked_up', 'delivered'].includes(o.status) ? ' · Ready ' + E(dueDate) : ''}</p>
  <table>${lines}</table>
  <table class="tot" style="margin-top:8px">
  ${otherDisc > 0.004 ? `<tr><td>Discount</td><td class="r">−${usd(otherDisc)}</td></tr>` : ''}
  ${cashDisc > 0.004 ? `<tr><td>Cash discount (3%)</td><td class="r">−${usd(cashDisc)}</td></tr>` : ''}
  ${credit > 0.004 ? `<tr><td>Store credit</td><td class="r">−${usd(credit)}</td></tr>` : ''}
  ${surcharge > 0.004 ? `<tr><td>Card fee</td><td class="r">${usd(surcharge)}</td></tr>` : ''}
  <tr class="grand"><td>${paid ? 'Total paid' : 'Total'}</td><td class="r">${usd(paid ? charged : due)}</td></tr></table>
  ${paid ? `<span class="badge paid">✓ Paid${method ? ' · ' + E(method) : ''}</span>`
    : `<span class="badge unpaid">Balance due at pickup</span>${newModel && due > 0 ? `<p class="note">Prices shown are card prices. Pay cash or check and save 3%: ${usd(due * ratio)}.</p>` : ''}`}
  </div>`;
  return page(200, inner);
};
