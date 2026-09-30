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
