# V33 — Clover Flex: send the total to the card terminal

- **Charge on Clover Flex** button in: order Checkout & Collect Payment, Simple Pay, and pickup
  Collect Payment. The exact card total goes to the Flex; the customer taps/inserts/swipes; when
  Clover approves, the server confirms the payment with Clover and the tickets are marked paid
  (card brand, last 4, Clover payment id). Declines/cancels leave tickets unpaid.
- Protection against double charges: each ticket is reserved before the Flex is asked to charge
  (one active charge per ticket, same rule as the card-on-file batch). If the internet drops after
  an approval, the POS keeps the approval and saves it as soon as it can — it never asks to charge again.
- **Settings → Clover Flex** (manager): Connect (one Clover sign-in), choose the device, reconnect, disconnect.

## Setup
1. Supabase → SQL Editor → run `supabase/clover-flex-v33.sql`.
2. Netlify → Environment variables → `CLOVER_APP_SECRET` = the app's App Secret (secret). Redeploy.
3. On the Flex: install and open **Cloud Pay Display**.
4. POS → Settings → Clover Flex → Connect.

Sandbox (Clover test) is the default. After Clover approves the production app, set
`CLOVER_DEVICE_ENVIRONMENT=production`, `CLOVER_APP_ID`, `CLOVER_RAID`, and the production
`CLOVER_APP_SECRET`, redeploy, and connect again.
