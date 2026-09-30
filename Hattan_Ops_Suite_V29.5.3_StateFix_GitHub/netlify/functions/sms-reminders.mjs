// Scheduled daily (about 11am New York time): remind customers whose order has been ready
// for 7 days, and again at 14 days. One text per customer, never twice for the same ticket.
import { selectRows, storeId } from './lib/shared.mjs';
import { compose, deliver, loadStore, smsMode, smsSettings, twilioConfigured } from './lib/sms.mjs';

const DAY = 864e5;
const fmt = iso => { const d = new Date(iso); return `${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' })}`; };

export async function runReminders(now = Date.now()) {
  if (smsMode() === 'off' || !twilioConfigured()) return { skipped: 'texting off' };
  const store = await loadStore();
  if (!smsSettings(store).enabled.reminder) return { skipped: 'reminders switched off' };
  const due = [];
  for (const o of store.orders || []) {
    if (!o || o.legacy || o.status !== 'ready' || !o.customerId || o.fulfillment === 'delivery') continue;
    const at = Date.parse(o.readyAt || '');
    if (!at) continue;
    const age = (now - at) / DAY;
    const step = age >= 14 && age < 21 ? 14 : age >= 7 && age < 14 ? 7 : 0;
    if (step) due.push({ o, key: `remind${step}:${o.id}` });
  }
  if (!due.length) return { sent: 0 };
  const sentKeys = new Set();
  for (let i = 0; i < due.length; i += 100) {
    const keys = due.slice(i, i + 100).map(d => `"${d.key}"`).join(',');
    const rows = await selectRows('sms_log', `store_id=eq.${encodeURIComponent(storeId())}&dedupe_key=in.${encodeURIComponent('(' + keys + ')')}`, 'dedupe_key');
    (rows || []).forEach(r => sentKeys.add(r.dedupe_key));
  }
  const byCust = new Map();
  due.filter(d => !sentKeys.has(d.key)).forEach(d => { if (!byCust.has(d.o.customerId)) byCust.set(d.o.customerId, []); byCust.get(d.o.customerId).push(d); });
  let sent = 0;
  for (const [cid, list] of byCust) {
    const customer = (store.customers || []).find(c => String(c.id) === String(cid));
    if (!customer) continue;
    const orders = list.map(d => d.o);
    const oldest = orders.map(o => o.readyAt).sort()[0];
    try {
      const r = await deliver({ keys: list.map(d => d.key), kind: 'reminder', customer, orderIds: orders.map(o => o.id), body: compose('reminder', { customer, orders, readySince: fmt(oldest) }), sentBy: 'scheduled' });
      if (r.sent) sent++;
    } catch (e) { console.error('reminder', cid, e.message); }
  }
  return { sent };
}

export default async () => {
  const r = await runReminders();
  console.log('sms-reminders', JSON.stringify(r));
  return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
};
// 15:00 UTC = 11am EDT / 10am EST
export const config = { schedule: '0 15 * * *' };
