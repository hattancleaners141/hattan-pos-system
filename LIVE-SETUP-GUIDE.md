# Hattan Ops Suite V16.1 — Live Setup Guide

V16.1 keeps the existing POS workflow and updates the live foundation for Supabase's current API-key system:

- **Netlify** serves the POS and runs protected server functions.
- **Supabase** stores one shared business state for every counter and app.
- **Clover Hosted iFrame + Ecommerce API** tokenizes cards, stores card-on-file references, runs batch charges, and submits original-card refunds.

This download contains no real credentials. Never type a Supabase secret key, Supabase private signing key, Clover private token, session secret, or bootstrap code into the POS itself or a source file.

## 1. Supabase database — completed once

1. Create the Supabase project.
2. Enable multi-factor authentication on the Supabase owner account.
3. Open **SQL Editor**.
4. Paste all of `supabase/schema.sql` and run it once.
5. Confirm these tables appear in **Table Editor**:
   - `staff_accounts`
   - `login_attempts`
   - `pos_state`
   - `sync_audit`
   - `payment_vault`
   - `payment_transactions`

The schema enables Row Level Security. Staff PIN records, payment-vault references and transaction records have no browser access. Shared writes go through authenticated Netlify Functions.

## 2. Collect the three basic Supabase values

In Supabase, open **Project Settings → API Keys**. Use the **Publishable and secret API keys** section, not the Legacy API Keys section.

Collect these values privately:

| Netlify variable | Supabase value | Safe to expose? |
|---|---|---|
| `SUPABASE_URL` | Project URL, such as `https://abc.supabase.co` | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Key beginning `sb_publishable_` | Yes |
| `SUPABASE_SECRET_KEY` | Key beginning `sb_secret_` | **No — server only** |

If the project shows **Create new API keys**, create the default publishable and secret pair. Do not use the secret key in a browser, POS input box, chat, email, screenshot, source file, or Git repository.

## 3. Add Netlify environment variables

In Netlify open **Project configuration → Environment variables** and add these values individually:

| Variable | First test value | Mark secret? |
|---|---|---|
| `HATTAN_MODE` | `shared` | No |
| `HATTAN_STORE_ID` | `main` | No |
| `HATTAN_SESSION_SECRET` | Unique random value, at least 32 characters | **Yes** |
| `HATTAN_BOOTSTRAP_CODE` | Different unique value, at least 12 characters | **Yes** |
| `SUPABASE_URL` | Your Supabase Project URL | No |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | No |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | **Yes** |
| `CLOVER_ENVIRONMENT` | `sandbox` | No |
| `CLOVER_MERCHANT_ID` | Clover sandbox Merchant ID | No |
| `CLOVER_PUBLIC_TOKEN` | Clover Hosted iFrame public token | No |
| `CLOVER_PRIVATE_TOKEN` | Matching Clover Ecommerce private token | **Yes** |

For every item marked **Yes**, use Netlify's secret-value protection and make it available to **Functions**. Environment-variable changes require a new deployment.

The POS begins with secure five-second synchronization. That is enough to connect and test multiple counters. Section 7 explains the optional instant Realtime upgrade.

## 4. Deploy the complete project

Do not upload `index.html` alone. The deployed project root must contain `index.html`, `netlify.toml`, all CSS/JS files, the `netlify` folder, and the `supabase` folder.

Recommended deployment methods:

1. **Private Git repository connected to Netlify:** use a blank Build command and `.` as the Publish directory.
2. **Netlify CLI:** from this folder run `netlify link`, followed by `netlify deploy --prod`.

Git or the CLI is required for reliable Netlify Function deployment. A plain static-file drag-and-drop is not sufficient for shared data or secure payments.

## 5. Create the first manager

On the first shared-mode visit, the app shows a one-time setup screen instead of demo sign-in.

1. Enter the first manager's name.
2. Choose a unique four-digit PIN.
3. Enter the value stored as `HATTAN_BOOTSTRAP_CODE`.
4. Select **Create Manager & Start Blank Store**.

The server stores only a salted PBKDF2 hash of the PIN. After setup succeeds, replace or remove `HATTAN_BOOTSTRAP_CODE` in Netlify and redeploy.

## 6. Test Supabase on two counters

Open the Netlify URL in two different browsers or devices and sign in.

1. On Counter A, create a test customer.
2. Within five seconds, confirm the customer appears on Counter B.
3. Create separate Dry Cleaning, Shirt Laundry, Wash & Fold and Alteration tickets.
4. Assign tags after drop-off, scan the ticket ready, and assign a rack/conveyor.
5. Scan a delivery batch and confirm exact timestamps on both devices.
6. Punch in on a non-counter device and confirm the team view updates.
7. In **Settings → Live System Setup**, select **Test Secure Connections**.

Do not import every real customer or ticket until these tests pass.

## 7. Optional instant Realtime upgrade

Without this section, the POS remains functional and checks for changes every five seconds. Complete this section only after basic shared mode works.

Supabase recommends asymmetric signing keys for apps that mint custom Realtime JWTs. Generate a private P-256 key on a trusted computer:

```bash
supabase gen signing-key --algorithm ES256
```

Then:

1. Save the complete private JWK in an encrypted password manager. Supabase will not let you extract it later.
2. In Supabase **Project Settings → JWT Signing Keys**, import the generated JWK as a new standby key.
3. Confirm its public key appears in the project's JWKS endpoint before rotating it into use.
4. Store the entire private JWK as Netlify secret `SUPABASE_JWT_PRIVATE_JWK`.
5. Store the same `kid` value as `SUPABASE_JWT_KID`.
6. Redeploy and confirm **Instant Realtime** appears in the POS connection test.

Never send the private JWK in chat, email, screenshots, client code, or browser storage. V16.1 retains temporary support for `SUPABASE_JWT_SECRET` only for existing legacy projects; do not choose it for a new project.

## 8. Test Clover sandbox

Before using a real card:

1. Confirm Clover enabled Ecommerce multi-pay/card-on-file for the sandbox Merchant ID.
2. Open a customer profile and select **Add Card Securely**.
3. Use only a Clover sandbox test card.
4. Check the consent box. Card number, expiration, CVV and billing ZIP stay inside Clover-hosted fields.
5. Run one small sandbox batch charge.
6. Confirm the POS records the Clover charge ID, result, amount, employee and timestamp.
7. Sign in as a manager and test an original-card refund.
8. Replace and remove a saved sandbox card; confirm the previous Clover source can no longer be charged.

Hattan stores only Clover references and display information such as brand and last four digits. It does not store full card numbers, CVV or raw expiration data.

## 9. Production gate

Do not change Clover or the POS to production until all of these are complete:

- Clover confirms the live MID is enabled for Ecommerce multi-pay/card-on-file.
- The live public token, private token and Merchant ID are a matching set.
- Cardholder consent language and stored-credential rules are confirmed.
- Refund permissions are confirmed.
- Two-counter sync, printer, barcode, rack, delivery, pickup recall, refund and restore tests pass.
- Staff use unique PINs and no demo PINs.
- Supabase backups and Netlify Function logs are reviewed.
- A limited pilot is completed before full customer/ticket migration.

Only then set `CLOVER_ENVIRONMENT=production`, set `HATTAN_MODE=live`, enter the production Clover values in Netlify and redeploy.

## Security summary

- `SUPABASE_SECRET_KEY`: Netlify secret, server only, sent to Supabase only as an API key.
- `SUPABASE_JWT_PRIVATE_JWK`: optional Netlify secret, server only.
- Clover private token: Netlify secret, server only.
- Card number, expiration and CVV: Clover Hosted iFrame only.
- Staff PIN: salted PBKDF2 hash; never stored readably.
- Staff session: signed HttpOnly SameSite cookie with an eight-hour lifetime.
- Failed PIN attempts: limited after five failures per employee/IP in fifteen minutes.
- Shared writes: authenticated server endpoint with version conflict detection and audit history.

V16.1 is a secure live foundation, not a substitute for Clover production approval, backup drills, monitoring, staff training and a controlled store pilot.
