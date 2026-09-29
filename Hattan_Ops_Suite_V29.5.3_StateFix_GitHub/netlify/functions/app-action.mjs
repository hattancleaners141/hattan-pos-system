// POST /.netlify/functions/app-action — changes a signed-in customer makes in the app.
// Every change is written into the shop's shared data with the same versioned save the POS
// uses, so it appears on the counter screens right away.
import crypto from 'node:crypto';
import { assertSameOrigin, handleError, json, methodNotAllowed, parseBody, HttpError } from './lib/shared.mjs';
import { REWARDS, SERVICES, TAGS, TIME_WINDOWS, customerView, digits10, legacyDirectory, mutateStore, noWrite, readStore, requireAccount, updateAccount, isPlaceholderEmail, clearAppCookie } from './lib/app.mjs';
import { compose, deliver, e164, smsMode } from './lib/sms.mjs';

const id = p => p + crypto.randomBytes(6).toString('base64url');
const clean = (s, n = 120) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const titleCase = s => clean(s, 80).toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase());
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const nyNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WINDOW_END = { '8:00 – 10:00 AM': 10, '10:00 AM – 12:00 PM': 12, '12:00 – 2:00 PM': 14, '2:00 – 4:00 PM': 16, '4:00 – 6:00 PM': 18, '9:00 – 11:00 AM': 11, '11:00 AM – 1:00 PM': 13, '1:00 – 4:00 PM': 16 };

function phoneOrThrow(raw) {
  const p = e164(raw);
  if (!p) throw new HttpError(400, 'Enter a 10-digit US mobile number');
  return p;
}
function addressFrom(a, existingId) {
  const street = clean(a?.street, 100), apartment = clean(a?.apartment, 30), zip = clean(a?.zip, 10).replace(/[^\d-]/g, '');
  if (!street) throw new HttpError(400, 'Enter the street address');
  const city = clean(a?.city, 40) || 'New York', st = (clean(a?.state, 2) || 'NY').toUpperCase();
  return {
    id: existingId || id('addr_'), label: clean(a?.label, 20) || 'Home', street, apartment, city, state: st, postalCode: zip,
    line1: [street, apartment ? `Apt ${apartment}` : ''].filter(Boolean).join(', '), line2: [city, st, zip].filter(Boolean).join(' '),
    building: street, notes: clean(a?.notes, 200),
  };
}
const findCustomer = (store, account) => (store.customers || []).find(c => String(c?.id) === String(account.customer_id));
function needCustomer(store, account) {
  const c = findCustomer(store, account);
  if (!c) throw new HttpError(409, 'Finish setting up your account first');
  return c;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const account = await requireAccount(event);
    const body = parseBody(event);
    const action = String(body.action || '');

    // ---------------- first-time setup for a new email ----------------
    if (action === 'signup') {
      if (account.status === 'linked' && account.customer_id) return json(200, { ok: true, status: 'linked' });
      if (account.status !== 'new') return json(200, { ok: true, status: account.status });
      const name = titleCase(body.name);
      if (name.split(' ').length < 2) throw new HttpError(400, 'Enter your first and last name');
      const phone = phoneOrThrow(body.phone);
      const address = body.address?.street ? addressFrom(body.address) : null;
      const d10 = digits10(phone);
      const { payload } = await readStore();
      const inPos = (payload.customers || []).filter(c => c && digits10(c.phone) === d10);
      const inCleanBase = inPos.length ? [] : legacyDirectory().filter(r => r.phone === d10);
      if (inPos.length || inCleanBase.length) {
        // An account with this phone already exists at the shop. Staff confirm it's really
        // this person before linking, so nobody can see someone else's orders.
        const note = inPos.length ? inPos.map(c => `${c.name || ''} (${c.customerNumber || c.id})`).join('; ') : inCleanBase.map(r => `${r.first} ${r.last} (CleanBase #${r.num})`).join('; ');
        await updateAccount(account.id, {
          status: 'pending', match_customer_id: inPos.length ? inPos.map(c => c.id).join(',') : inCleanBase.map(r => 'cb:' + r.legacyId).join(','),
          match_note: note.slice(0, 500), signup: { name, phone, address, smsOn: !!body.smsOn, at: new Date().toISOString() },
        });
        return json(200, { ok: true, status: 'pending' });
      }
      const customer = await mutateStore(store => {
        const n = Math.max(Number(store.nextCustomerNumber) || 10001, 10001);
        store.nextCustomerNumber = n + 1;
        const at = new Date();
        const c = {
          id: id('cust_'), customerNumber: `C-${n}`, name, initials: initials(name), phone, email: account.email,
          memberSince: at.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), points: 0, storeCredit: 0,
          preferredChannel: 'pickup', addresses: address ? [address] : [], paymentMethods: [],
          garmentPrefs: { starch: 'light', fold: 'hang', fragranceFree: false, notes: '' },
          source: 'customer-app', appAccountId: account.id, createdAt: at.toISOString(),
          ...(body.smsOn ? { smsConsent: { on: true, phone, at: at.toISOString(), by: 'Customer app (written)', method: 'app' } } : {}),
        };
        (store.customers = store.customers || []).push(c);
        return c;
      });
      await updateAccount(account.id, { status: 'linked', customer_id: customer.id, signup: { name, phone, address, smsOn: !!body.smsOn, at: new Date().toISOString() } });
      if (body.smsOn) await confirmTexts(customer, event);
      return json(200, { ok: true, status: 'linked', customer: customerView(customer) });
    }

    if (action === 'deleteAccount') {
      if (account.customer_id) {
        await mutateStore(store => {
          const c = findCustomer(store, account);
          if (!c) return noWrite(null);
          c.appAccountId = null; c.appDeletedAt = new Date().toISOString();
        });
      }
      await updateAccount(account.id, { status: 'deleted', customer_id: null, signup: null, session_epoch: Number(account.session_epoch || 0) + 1 });
      return json(200, { ok: true }, { 'Set-Cookie': clearAppCookie() });
    }

    // ---------------- everything below needs a linked customer ----------------
    if (!account.customer_id) throw new HttpError(409, 'Finish setting up your account first');

    if (action === 'profile') {
      const name = titleCase(body.name);
      if (name.split(' ').length < 2) throw new HttpError(400, 'Enter your first and last name');
      const phone = phoneOrThrow(body.phone);
      const c = await mutateStore(store => {
        const c = needCustomer(store, account);
        c.name = name; c.initials = initials(name);
        if (digits10(c.phone) !== digits10(phone)) {
          c.phone = phone;
          if (c.smsConsent?.on) c.smsConsent = { ...c.smsConsent, phone, at: new Date().toISOString(), by: 'Customer app (written)', method: 'app' };
        }
        if (!c.email || isPlaceholderEmail(c.email)) c.email = account.email;
        return c;
      });
      return json(200, { ok: true, customer: customerView(c) });
    }

    if (action === 'address') {
      const op = String(body.op || 'save');
      const c = await mutateStore(store => {
        const c = needCustomer(store, account);
        c.addresses = c.addresses || [];
        if (op === 'delete') c.addresses = c.addresses.filter(a => a.id !== body.id);
        else {
          const i = c.addresses.findIndex(a => a.id === body.address?.id);
          const a = addressFrom(body.address, i >= 0 ? c.addresses[i].id : null);
          if (i >= 0) c.addresses[i] = { ...c.addresses[i], ...a }; else c.addresses.push(a);
          if (c.addresses.length > 6) throw new HttpError(400, 'You can save up to 6 addresses');
        }
        return c;
      });
      return json(200, { ok: true, customer: customerView(c) });
    }

    if (action === 'prefs') {
      const p = body.garmentPrefs || {};
      const c = await mutateStore(store => {
        const c = needCustomer(store, account);
        c.garmentPrefs = {
          ...(c.garmentPrefs || {}),
          starch: ['none', 'light', 'medium', 'heavy'].includes(p.starch) ? p.starch : 'light',
          fold: ['hang', 'box'].includes(p.fold) ? p.fold : 'hang',
          fragranceFree: !!p.fragranceFree, notes: clean(p.notes, 300),
        };
        return c;
      });
      return json(200, { ok: true, customer: customerView(c) });
    }

    if (action === 'sms') {
      const on = !!body.on;
      const c = await mutateStore(store => {
        const c = needCustomer(store, account);
        if (on && !e164(c.phone)) throw new HttpError(400, 'Add a mobile number first');
        c.smsConsent = on
          ? { on: true, phone: e164(c.phone), at: new Date().toISOString(), by: 'Customer app (written)', method: 'app' }
          : { on: false, at: new Date().toISOString(), by: 'Customer app' };
        return c;
      });
      if (on) await confirmTexts(c, event);
      return json(200, { ok: true, customer: customerView(c) });
    }

    if (action === 'pickup') {
      const services = [...new Set((body.services || []).map(String))].filter(s => SERVICES.some(x => x.id === s));
      if (!services.length) throw new HttpError(400, 'Choose at least one service');
      const date = String(body.date || '');
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!m) throw new HttpError(400, 'Choose a pickup date');
      const day = new Date(+m[1], +m[2] - 1, +m[3]);
      const now = nyNow(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.round((day - today) / 864e5);
      if (diff < 0 || diff > 14) throw new HttpError(400, 'Choose a date in the next two weeks');
      if (day.getDay() === 0) throw new HttpError(400, "We're closed Sundays — choose another day");
      const windows = day.getDay() === 6 ? TIME_WINDOWS.saturday : TIME_WINDOWS.weekday;
      const window = String(body.window || '');
      if (!windows.includes(window)) throw new HttpError(400, 'Choose a pickup time');
      if (diff === 0 && now.getHours() >= (WINDOW_END[window] || 0) - 1) throw new HttpError(400, 'That time has passed — choose a later window');
      const rush = body.speed === 'rush';
      const tags = [...new Set((body.tags || []).map(String))].filter(t => TAGS.some(x => x.id === t));
      if (rush) tags.push('rush');
      const recurring = ['none', 'weekly', 'biweekly', 'monthly'].includes(body.recurring) ? body.recurring : 'none';
      const notes = clean(body.notes, 500);
      const order = await mutateStore(store => {
        const c = needCustomer(store, account);
        let address = (c.addresses || []).find(a => a.id === body.addressId);
        if (!address && body.address?.street) { address = addressFrom(body.address); (c.addresses = c.addresses || []).push(address); }
        if (!address) throw new HttpError(400, 'Choose a pickup address');
        const open = (store.orders || []).filter(o => String(o.customerId) === String(c.id) && o.channel === 'delivery' && o.status === 'scheduled' && o.appRequested);
        if (open.length >= 3) throw new HttpError(400, 'You already have 3 pickups scheduled. Call us to add more.');
        // App pickups get their own "A" numbers so they can never collide with a counter
        // ticket being written on a POS device at the same moment.
        const used = new Set((store.orders || []).map(o => String(o.ticket)));
        let n = Math.floor(Date.now() / 1000) % 100000;
        while (used.has(`A${String(n).padStart(5, '0')}`)) n = (n + 1) % 100000;
        const ticket = `A${String(n).padStart(5, '0')}`;
        const names = services.map(s => SERVICES.find(x => x.id === s).name);
        const label = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const o = {
          id: `HC-${ticket}`, ticket, channel: 'delivery', source: 'customer-app', appRequested: true,
          customerId: c.id, customerName: null, items: names.join(' + '), services, total: 0, lineItems: [],
          status: 'scheduled', stageIndex: 0, fulfillment: 'delivery',
          placedLabel: diff === 0 ? 'Today' : label, dateLabel: diff === 0 ? `Today, ${label}` : label,
          pickupDate: date, window, address: { ...address }, addressId: address.id,
          recurring, notes, tags, rush, paid: false, paymentMethod: null, pointsAwarded: false,
          garmentPhotos: [], deliveryPhotos: [], assignedDriverId: null, invoiced: false, rack: null,
          createdAt: new Date().toISOString(), garmentPrefsSnapshot: c.garmentPrefs || null,
        };
        (store.orders = store.orders || []).unshift(o);
        return o;
      });
      return json(200, { ok: true, orderId: order.id, ticket: order.ticket });
    }

    if (action === 'cancelPickup') {
      await mutateStore(store => {
        const c = needCustomer(store, account);
        const o = (store.orders || []).find(x => x.id === body.orderId && String(x.customerId) === String(c.id));
        if (!o) throw new HttpError(404, 'Pickup not found');
        if (!(o.channel === 'delivery' && o.status === 'scheduled' && o.appRequested)) throw new HttpError(409, 'This pickup can no longer be canceled in the app. Please call us.');
        o.status = 'voided'; o.voided = true; o.voidReason = 'Canceled by customer in the app'; o.voidedAt = new Date().toISOString();
      });
      return json(200, { ok: true });
    }

    if (action === 'redeem') {
      const reward = REWARDS.find(r => r.id === body.rewardId);
      if (!reward) throw new HttpError(400, 'Unknown reward');
      const c = await mutateStore(store => {
        const c = needCustomer(store, account);
        const pts = Math.round(Number(c.points || 0));
        if (pts < reward.cost) throw new HttpError(400, `You need ${reward.cost - pts} more points for this reward`);
        c.points = pts - reward.cost;
        c.storeCredit = Math.round((Number(c.storeCredit || 0) + reward.value) * 100) / 100;
        (c.rewardLog = c.rewardLog || []).unshift({ at: new Date().toISOString(), rewardId: reward.id, title: reward.title, cost: reward.cost, value: reward.value, via: 'customer app' });
        return c;
      });
      return json(200, { ok: true, customer: customerView(c) });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (error) { return handleError(error); }
};

// Written consent in the app → send the confirmation text. A number that replied STOP stays
// opted out until its owner texts START (the app never overrides a STOP).
async function confirmTexts(customer, event) {
  try {
    const phone = e164(customer.smsConsent?.phone || customer.phone);
    if (!phone || smsMode() === 'off') return;
    await deliver({ keys: [`optin:${customer.id}:${phone}`], kind: 'optin', customer, body: compose('optin', {}), sentBy: 'customer-app', event });
  } catch (e) { console.error('app optin text', e.message); }
}
