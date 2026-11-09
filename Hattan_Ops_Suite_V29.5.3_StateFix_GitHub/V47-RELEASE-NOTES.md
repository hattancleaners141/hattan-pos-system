# V47 — built to run for years: tickets and customers are saved one by one

## Why
Before V47 the whole shop (every ticket and customer) was saved as one value. Every save re-sent all
of it, and Netlify refuses anything over 6 MB, so the system would stop saving after a few thousand
tickets. Each device also counted ticket numbers on its own, so two devices could write the same
ticket number, and when they synced one of the two tickets was erased.

## What changed
- **Every ticket and customer is its own database row** (`pos_records`). A save sends only what
  changed (a few KB), however big the shop gets.
- **Ticket and customer numbers come from the database.** Each device reserves 25 ticket numbers at a
  time, so it can keep writing tickets through a short Wi-Fi drop and numbers never repeat. Numbers
  continue from where the shop is now (700000+).
- **Two devices editing the same ticket keep both changes.** If one saved first, the other merges field by
  field and saves again. If two devices ever create the same ticket id (long offline stretch), both tickets
  are kept and an alert goes to the staff bell.
- **Shop settings** (prices, racks, texting switches, staff alerts) still sync as one small value.
- **Loading:** on sign-in a device loads every customer, every open/unpaid ticket, and finished tickets
  from the last 120 days, in pages. Older tickets load when you open that customer's profile.
- **History / undo:** every earlier version of a ticket or customer is kept for 90 days
  (`pos_record_history`). The original all-in-one data is copied to `pos_state_archive` before moving.
- The customer app, driver app, Clover, texting and receipts read and write single tickets/customers too.

## Go-live steps (in this order)
1. **Supabase → SQL Editor → New query →** paste all of `supabase/records-v47.sql` → **Run**.
   (Safe to run again. It only adds tables; the current site keeps working.)
2. **Merge this pull request** so Netlify deploys V47.
3. **Reload every device** (counter iPad, tailor iPad, any laptop). The first device that loads moves the
   existing tickets/customers into the new table automatically (a few seconds).
4. Check: write a test ticket on two devices at the same time — they get different numbers — then void them.

## To undo (only if something is badly wrong)
The pre-move data is in `pos_state_archive` (newest row). Redeploy the previous version and copy that
row's `payload` back into `pos_state.payload`. Tickets written after the move would need re-entering.

## Behaviour notes
- Reports that add up old tickets only see the last 120 days unless a customer's history is opened.
- Settings still hold the punch clock log and delivery batches; they grow slowly (well under 1 MB a year)
  but should be trimmed or moved to their own table within a few years.

## Tests
`tests/v47-server.test.mjs` and `tests/v47-devices.test.mjs` run against a real Postgres + PostgREST.
The device test opens the real POS in three simulated devices against a shop with 6,000 customers and
12,000 tickets (over 10 MB in the old format) and checks: paged loading, unique ticket numbers when two
devices write at once, both edits kept when two devices change the same ticket, offline tickets, older
history on demand, and that devices settle with nothing left to re-save.
