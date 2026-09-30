# Hattan Ops Suite V31 — Driver app with photo proof of delivery

## Drivers — `/driver/` (add to the phone's home screen)
- Sign in with a staff name and Team PIN.
- Today's route: deliveries sent from the POS Delivery screen, plus app pickups. Open pickups can be taken by any driver. Stops can be reordered.
- "Open route in Maps" opens the whole route in Google Maps. "Start deliveries" shows customers "Out for delivery".
- At each stop:
  - Navigate, call the customer, read building notes.
  - Scan every ticket with the phone camera (CODE128 `HAT-000123`). The app warns if a ticket is for the wrong stop. Tickets can also be typed in, and an unscannable ticket needs a written reason.
  - Take a photo. It is stamped with the date, time, address, ticket numbers and driver, and the GPS position is recorded.
  - Choose the handoff (customer, doorman, front desk, mailroom or left at door) and the recipient's name.
- Pickups: a photo of the bags and the bag count.
- Couldn't deliver: pick a reason and the ticket goes back to the shop.
- Weak signal in lobbies: photos and completions wait on the phone and send themselves when the signal returns.

## Customers
- Their app's order screen shows "Delivered · time · handoff · driver" with the photo(s).
- The receipt link shows the same proof.
- When texting is on: "Your order #123 was delivered (left with doorman) at 3:42 PM. Delivery photo & receipt: …"

## Shop — POS
- Drivers are the real Team accounts.
- Delivery screen:
  - A "Proof of delivery" gallery. Open any card for the photos, handoff, scanned tickets and GPS link.
  - A driver picker on app pickups.

## Setup (one time)
Supabase → SQL Editor → run `supabase/driver-app-v31.sql`. It creates the proof table and a private photo bucket.
