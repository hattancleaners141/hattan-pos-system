// Staff alerts: things customers did that the shop should see right away (card saved from a
// text link, text replies, Do Over answers). Saved into the shared store (the POS shows a bell
// with the list) and emailed to the shop inbox (STAFF_ALERT_EMAIL, or SMTP_USER).
import crypto from 'node:crypto';
import { env } from './shared.mjs';
import { mutateStore, sendEmail } from './app.mjs';

const E = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export async function staffAlert({ type, title, text = '', customerId = '', customerName = '', orderIds = [] }) {
  const alert = { id: 'a' + crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), type, title: String(title).slice(0, 120), text: String(text).slice(0, 500), customerId: String(customerId || ''), customerName: String(customerName || '').slice(0, 80), orderIds: orderIds.map(String).slice(0, 10) };
  try {
    await mutateStore(s => { s.staffAlerts = [alert, ...(Array.isArray(s.staffAlerts) ? s.staffAlerts : [])].slice(0, 150); });
  } catch (e) { console.error('staff alert save', e.message); }
  const to = env('STAFF_ALERT_EMAIL') || env('SMTP_USER');
  if (to && env('STAFF_ALERT_EMAIL_OFF') !== '1') {
    try {
      const who = alert.customerName ? `${alert.customerName}: ` : '';
      await sendEmail(to, `POS alert · ${who}${alert.title}`,
        `${alert.title}\n${alert.customerName ? 'Customer: ' + alert.customerName + '\n' : ''}${alert.text}\n\nOpen the POS to see it: https://hattan-ops-suite.netlify.app`,
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;padding:16px;color:#171a17"><div style="font-size:13px;color:#565f57">Hattan POS alert</div><h2 style="margin:4px 0 8px;font-size:19px">${E(alert.title)}</h2>${alert.customerName ? `<div style="font-weight:600">${E(alert.customerName)}</div>` : ''}<p style="margin:8px 0;white-space:pre-wrap">${E(alert.text)}</p><a href="https://hattan-ops-suite.netlify.app" style="color:#123d2b">Open the POS</a></div>`);
    } catch (e) { console.error('staff alert email', e.message); }
  }
  return alert;
}
