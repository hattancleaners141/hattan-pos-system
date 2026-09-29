// GET /.netlify/functions/app-data — everything the signed-in customer's app screens need,
// limited to that customer's own record.
import { env, handleError, json, methodNotAllowed } from './lib/shared.mjs';
import { REWARDS, SERVICES, SHOP, TAGS, TIME_WINDOWS, customerView, orderView, paidTransactions, readStore, requireAccount, siteUrl, vaultCard } from './lib/app.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    const account = await requireAccount(event);
    const { payload: store } = await readStore();
    const environment = env('CLOVER_ENVIRONMENT', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const config = {
      shop: SHOP, services: SERVICES, tags: TAGS, timeWindows: TIME_WINDOWS, rewards: REWARDS,
      clover: env('CLOVER_PUBLIC_TOKEN') && env('CLOVER_MERCHANT_ID') ? {
        publicToken: env('CLOVER_PUBLIC_TOKEN'), merchantId: env('CLOVER_MERCHANT_ID'), environment,
        sdkUrl: environment === 'production' ? 'https://checkout.clover.com/sdk.js' : 'https://checkout.sandbox.dev.clover.com/sdk.js',
      } : null,
    };
    const base = { account: { email: account.email, status: account.status, since: account.created_at }, config };
    const c = account.customer_id ? (store.customers || []).find(x => String(x?.id) === String(account.customer_id)) : null;
    if (!c) return json(200, { ok: true, ...base, account: { ...base.account, status: account.status === 'linked' ? 'new' : account.status }, customer: null, orders: [], card: null });

    const mine = (store.orders || []).filter(o => o && String(o.customerId) === String(c.id) && o.status !== 'voided');
    const paid = await paidTransactions(mine.filter(o => !o.paid).map(o => o.id));
    const url = siteUrl(event);
    const orders = mine.map(o => orderView(o, store, url, paid.get(o.id)))
      .filter(o => !(o.legacy && o.done && !o.amountDue))
      .sort((a, b) => String(b.createdAt || b.pickupDate).localeCompare(String(a.createdAt || a.pickupDate)))
      .slice(0, 100);
    const vault = await vaultCard(c.id);
    return json(200, {
      ok: true, ...base, customer: customerView(c), orders,
      card: vault ? { brand: vault.brand || 'Card', last4: vault.last4 || '', expMonth: vault.exp_month, expYear: vault.exp_year } : null,
    });
  } catch (error) { return handleError(error); }
};
