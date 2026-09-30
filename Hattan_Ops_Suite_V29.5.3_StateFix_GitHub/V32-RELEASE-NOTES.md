# V32 — counter fixes + grouped driver stops

## Sync pill no longer flips "Saving…" ↔ "Shared Live"
- Cause: the POS shares 7 settings (workflow settings, daily revenue, translations, recent customers,
  import/migration logs) that the server was silently dropping. Every counter therefore believed it
  had unsaved changes and re-sent the entire store (several MB) after every update from anywhere —
  another counter, the driver app or the customer app.
- Server now keeps those settings (`state-sync.mjs`), so they finally sync between counters too.
- The POS remembers what it last had in sync and only sends when staff actually change something.
  Idle counters send nothing (was ~6 full uploads a minute).
- Two counters changing different entries of the same setting at the same moment both keep their
  change (settings objects now merge key by key; before, one side's edit could be lost).
- Pill reads **Saved · Live**, or **Saving…** (still green) while a change is sent. Staff can keep
  working while it says Saving — the change is already in the screen and is sent in the background.

## Scan for Delivery survives a reload
- The scanned list and chosen driver are kept on that computer (`v32-pos-fixes.js`) until the
  manifest is printed or the list is cleared.

## Checkout: Customer Pickup / Delivery shows the choice
- The selected option turns solid green with a ✓; the Pay option also shows a ✓.

## Driver app: stops grouped by building (like Amazon Flex)
- Customers at the same street address (e.g. 3 apartments at 200 E 15th St — spelling variations
  like "East 15th Street" match) show as one numbered stop with a row per apartment.
- Inside a stop, the driver sees the other apartments at that building; scanning any of their
  tickets saves it to the right apartment instead of "wrong stop".
- After completing one apartment the app opens the next one in the same building.
- Moving a stop up/down moves the whole building; Google Maps gets one waypoint per building.
- Each apartment still gets its own photo + handoff record, so proof stays per customer.

## V32.1 — Edit Entire Ticket: switch Pickup ↔ Delivery
- The ticket editor has a "How the customer gets it back" choice (Customer Pickup / Delivery).
- Delivery asks which of the customer's addresses to deliver to; it is blocked (with a clear message)
  for walk-in guests or customers with no address on file.
- Switching a delivery back to pickup takes it off the driver's route and the Scan for Delivery list;
  an "Out for delivery" ticket goes back to Ready.
- The change is written to the ticket's activity and edit history.

## V32.2 — deliveries always reach a driver; Pickups and Deliveries sections
- Bug: the "Send route to driver" menu could display one driver while the saved choice was an old
  demo driver, so manifests went out "Unassigned" and never reached any driver app. The choice is now
  checked before sending (falls back to the driver shown in the menu).
- Delivery screen: a "Needs a driver" card lists any delivery stuck without a real driver — pick the
  driver and tap "Send to driver app" (also fixes the manifest's driver).
- Driver app: separate **Pickups** and **Deliveries** sections with counts; buildings are grouped
  inside each section; "Start deliveries" sits in the Deliveries section.
- Driver app: "Deliveries with no driver — take them" lets a driver claim stuck deliveries.

## V32.3 — printed ticket clean-up
- No Chinese on customer tickets. Wash & Fold tickets get one boxed Chinese line for the laundry team's
  directions (separate colors, low dry, no softener, own detergent, hang dry, fragrance-free, cold wash…).
- Totals: no Sub.T / Tax / G.Total. Unpaid → "Balance"; partly prepaid → Total, PrePay, Balance;
  paid → Total + PAID. Card fee / cash discount lines only when they apply.
- "Cash / check price (3% off)" only when the customer is paying cash/check.
- CleanBase customers keep the apartment in the second address line — it is now read everywhere
  (big apartment number on top of the ticket, address block, driver app, manifests).

## V32.4 — Simple version customer search without lag
- Typing no longer redraws the whole screen after each key (the box kept losing focus). Only the result
  list updates, CleanBase directory customers are included, and Enter picks the first match.

## V32.5 — Simple version Pay: daily batch charge
- The Pay screen in the Simple version shows every unpaid ticket whose customer has a card on file,
  grouped by customer, with one "Charge N tickets" button (Today / All unpaid up to today).
- Same safeguards as the regular Payments screen: manager sign-in, each ticket charged once, declines
  listed and left unpaid.
