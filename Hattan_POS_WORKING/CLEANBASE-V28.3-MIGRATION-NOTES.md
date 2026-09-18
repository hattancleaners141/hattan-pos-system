# Hattan Ops Suite V28.3 — CleanBase migration notes

V28.3 recognizes FoxPro/CleanBase DBF, CDX, DBC, DCT, DCX and FPT source files in Migration Center and preserves the V28.2.10 ticket-unit print fix.

The supplied individual legacy tables contain substantial history, including 27,533 customer rows, 253,759 ticket-line rows and 90,959 payment rows. The supplied `_backup_datas.zip` copy of several core transaction DBFs reports zero/near-zero active records, so V28.3 does not silently replace the richer individual exports with those empty snapshot tables.

Customer/card fields in the legacy customer data include encoded fields and apparent card-number material. V28.3 intentionally does not copy raw PAN/CVV or legacy credentials into browser/localStorage/Supabase. Card-on-file migration must be tokenized/vaulted through the payment processor and then linked to Hattan customer IDs.

For production cutover, validate customer identity decoding/mapping and the vWork master-ticket relationship before committing historical records to the live cloud database.
