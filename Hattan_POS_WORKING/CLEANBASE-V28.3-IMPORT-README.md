# Hattan Ops Suite V28.3 — CleanBase Native Import

This build adds a real browser-side Visual FoxPro DBF reader to Migration. It can decode/stage the live customer table, linked phone table, item catalog, ticket-line history, and payment history without sending raw DBF contents to an AI service.

## Important limitation in the supplied snapshot
The complete `_backup_datas.zip` contains a `vwork.dbf`, but that copy has 0 live records (schema/template only). The separately supplied live `vworktckt.dbf` has 253,759 line records. Without the matching live `vwork.dbf` master rows, V28.3 deliberately does not invent customer/ticket relationships for those line items.

Customer names and street-address fields in the live `vcust.dbf` are encoded/obfuscated. V28.3 does not guess at those values. It can stage customer number, linked phone, state/ZIP, preferences and fulfillment data where recoverable. Existing card credentials are not written to browser storage or Supabase; use processor vault migration and import only tokens/last4 metadata.

For the cleanest operational migration, obtain the live/current `vwork.dbf` from the same data folder/snapshot as the 253,759-row `vworktckt.dbf` and the corresponding CleanBase mechanism/key needed to decode customer identity fields.
