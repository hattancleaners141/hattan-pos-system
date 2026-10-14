// Scheduled every 15 minutes: pick up voids / refunds that were done directly on Clover.
// Every run checks card charges from the last 3 days; the ~3am run checks the last 60 days.
import { cloverConfigured } from './lib/shared.mjs';
import { syncCloverReversals } from './lib/clover-sync.mjs';

export default async () => {
  if (!cloverConfigured()) return new Response('{"skipped":"clover not configured"}');
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
  const minute = new Date().getUTCMinutes();
  const days = hour === 3 && minute < 15 ? 60 : 3;
  try {
    const r = await syncCloverReversals({ days });
    console.log('clover-sync', JSON.stringify({ days, checked: r.checked, changed: r.changed }));
    return new Response(JSON.stringify({ days, checked: r.checked, changed: r.changed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('clover-sync failed', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
export const config = { schedule: '*/15 * * * *' };
