# Hattan Ops Suite V30 — Customer app

## For customers — `/app/` (web, iPhone, Android)
- Sign in with an emailed 6-digit code (no passwords).
- Home: open tickets, balance due, quick actions.
- Orders: live status timeline, line items, card and cash totals, receipt link, pay, cancel an app pickup.
- Schedule: pickup booking (services, address, day, time window, rush, care notes). It appears on the POS Delivery screen.
- Pay: charge open tickets to the card on file via Clover. The amount is computed on the server, and a ticket can't be charged twice.
- Card: add, replace or remove a card with Clover hosted fields.
- Rewards: points, tier, and redeeming points for store credit.
- Account: profile, addresses, garment preferences, text-update consent (written), sign out, delete account.

## For the shop — POS
- Customers screen: "App sign-ups to confirm". People whose phone number already belongs to a customer wait here for staff to confirm them.
- Delivery screen: "Customer app pickups" with address, window, notes, rush flag, and Picked up / Cancel buttons.
- App payments, cards, preferences, points and consent are written straight into the shared store data. They show up on every counter.

## Security
- The CleanBase customer directory and ticket history are no longer public files. They are served only to signed-in staff (V29.11, `legacy-data` function).
- Customer sessions only ever unlock that customer's own record.

## Setup (one time)
1. Supabase → SQL Editor → run `supabase/customer-app-v30.sql`.
2. Netlify → Environment variables: `SMTP_USER` and `SMTP_PASS` (Gmail app password), or `RESEND_API_KEY` plus `EMAIL_FROM`.
3. Optional: `APP_REVIEW_EMAIL` and `APP_REVIEW_CODE` (a fixed 6-digit sign-in for App Store / Google Play reviewers).
4. Store apps: see `mobile/README.md` (Capacitor project, bundle ID `com.hattancleaners.app`).
