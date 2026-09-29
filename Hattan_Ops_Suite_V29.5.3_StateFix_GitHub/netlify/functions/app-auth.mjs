// POST /.netlify/functions/app-auth — customer app sign-in with an emailed 6-digit code.
//   { action:'start', email }            → emails a code
//   { action:'verify', email, code }      → signs in (sets the app session cookie)
//   { action:'logout' }
import crypto from 'node:crypto';
import { env, assertSameOrigin, handleError, json, methodNotAllowed, parseBody, requestIp, selectRows, insertRows, updateRows, storeId, HttpError } from './lib/shared.mjs';
import { requireAccount, appCookie, clearAppCookie, codeHash, isPlaceholderEmail, newCode, normEmail, readStore, sendLoginEmail, validEmail, updateAccount } from './lib/app.mjs';

const sid = () => encodeURIComponent(storeId());
const hourAgo = () => new Date(Date.now() - 3600e3).toISOString();

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    const body = parseBody(event);
    const action = String(body.action || '');

    if (action === 'logout') {
      try { const a = await requireAccount(event); await updateAccount(a.id, { session_epoch: Number(a.session_epoch || 0) + 1 }); } catch (_) { /* already signed out */ }
      return json(200, { ok: true }, { 'Set-Cookie': clearAppCookie() });
    }

    const email = normEmail(body.email);
    if (!validEmail(email) || isPlaceholderEmail(email)) throw new HttpError(400, 'Enter a valid email address');

    if (action === 'start') {
      const ip = requestIp(event) || '';
      const recent = await selectRows('app_login_codes', `store_id=eq.${sid()}&email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(hourAgo())}`, 'id');
      if ((recent || []).length >= 5) throw new HttpError(429, 'Too many codes requested. Please wait a bit and try again.');
      if (ip) {
        const byIp = await selectRows('app_login_codes', `store_id=eq.${sid()}&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(hourAgo())}`, 'id');
        if ((byIp || []).length >= 20) throw new HttpError(429, 'Too many attempts. Please try again later.');
      }
      const code = newCode();
      await insertRows('app_login_codes', [{ store_id: storeId(), email, code_hash: codeHash(email, code), attempts: 0, expires_at: new Date(Date.now() + 10 * 60e3).toISOString(), ip }], 'return=minimal');
      await sendLoginEmail(email, code);
      return json(200, { ok: true });
    }

    if (action === 'verify') {
      const code = String(body.code || '').replace(/\D/g, '');
      if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email');
      // App Store / Google Play reviewers get one fixed demo sign-in (set in Netlify env vars).
      const reviewEmail = normEmail(env('APP_REVIEW_EMAIL')), reviewCode = env('APP_REVIEW_CODE');
      const isReview = reviewEmail && /^\d{6}$/.test(reviewCode) && email === reviewEmail && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(reviewCode));
      const rows = isReview ? [{ id: null, code_hash: codeHash(email, code), attempts: 0 }] : await selectRows('app_login_codes', `store_id=eq.${sid()}&email=eq.${encodeURIComponent(email)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=1`, '*');
      const row = rows?.[0];
      if (!row) throw new HttpError(400, 'That code has expired. Tap "Send a new code".');
      if (Number(row.attempts || 0) >= 5) throw new HttpError(429, 'Too many wrong codes. Tap "Send a new code".');
      if (row.id) {
        // Count this guess atomically first (compare-and-set), so parallel guesses can't
        // get past the 5-try limit.
        const n = Number(row.attempts || 0);
        const took = await updateRows('app_login_codes', `id=eq.${encodeURIComponent(row.id)}&attempts=eq.${n}&used_at=is.null`, { attempts: n + 1 });
        if (!took?.length) throw new HttpError(429, 'Please wait a moment and try again.');
      }
      if (row.code_hash !== codeHash(email, code)) throw new HttpError(400, 'That code is not right. Check the email and try again.');
      if (row.id) {
        const used = await updateRows('app_login_codes', `id=eq.${encodeURIComponent(row.id)}&used_at=is.null`, { used_at: new Date().toISOString() });
        if (!used?.length) throw new HttpError(400, 'That code was already used. Tap "Send a new code".');
      }

      let account = (await selectRows('app_accounts', `store_id=eq.${sid()}&email=eq.${encodeURIComponent(email)}&limit=1`, '*'))?.[0];
      if (account?.status === 'deleted') { await updateAccount(account.id, { status: 'new', customer_id: null, match_customer_id: null, match_note: null }); account = { ...account, status: 'new', customer_id: null }; }
      if (!account) {
        // Link automatically when exactly one POS customer already has this email.
        const { payload } = await readStore();
        const matches = (payload.customers || []).filter(c => c && !isPlaceholderEmail(c.email) && String(c.email || '').trim().toLowerCase() === email);
        const linked = matches.length === 1 ? matches[0] : null;
        const created = await insertRows('app_accounts', [{
          store_id: storeId(), email, customer_id: linked ? linked.id : null,
          status: linked ? 'linked' : matches.length > 1 ? 'pending' : 'new',
          match_note: matches.length > 1 ? `Email matches ${matches.length} customers` : null,
          match_customer_id: matches.length > 1 ? matches.map(m => m.id).join(',') : null,
        }]);
        account = created?.[0];
      }
      await updateAccount(account.id, { last_login_at: new Date().toISOString() });
      return json(200, { ok: true, status: account.status }, { 'Set-Cookie': appCookie(account.id, account.session_epoch) });
    }
    throw new HttpError(400, 'Unknown action');
  } catch (error) { return handleError(error); }
};
