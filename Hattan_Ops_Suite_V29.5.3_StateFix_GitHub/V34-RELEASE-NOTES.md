# V34 — customer texting is on (A2P approved)

- **Consent at the counter**: after picking a customer who hasn't been asked, the counter shows the
  approved question with **Customer said YES / No thanks** (never pre-selected). YES saves the number,
  time and staff member and sends the confirmation text. Also on the customer profile, with
  "Customer asked to stop".
- **Automatic texts** (server writes every message; STOP respected; never sent twice):
  drop-off thank-you + receipt link, ready for pickup (with amount due), thanks for picking up,
  delivered (from the driver app, with photo link), card on file charged, card declined,
  card saved on file, reminders after 7 and 14 days (daily at ~11am).
- **Marketing → Texts**: switch each automatic text on/off, send a store notice (hours, holiday or
  weather closures — not promotions) to everyone opted in, see recent messages and STOP replies.
- Inbound webhook records STOP/START/HELP and replies; delivery status updates the log.

## Go-live checklist
1. Supabase → SQL Editor → run `supabase/sms-v29.11.sql`.
2. Netlify env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret), `TWILIO_MESSAGING_SERVICE_SID`
   (the Hattan Cleaners messaging service), `SMS_MODE=test`, `SMS_TEST_NUMBERS=<your cell>`. Redeploy.
3. Twilio → Messaging Service → Integration → incoming messages webhook:
   `https://hattan-ops-suite.netlify.app/.netlify/functions/sms-inbound` (HTTP POST).
4. Test on your own phone, then set `SMS_MODE=live` and redeploy.
