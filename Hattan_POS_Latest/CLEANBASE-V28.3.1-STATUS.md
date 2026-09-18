# Hattan Ops Suite V28.3.1

This build extends the native CleanBase importer with FoxPro DateTime decoding and historical vWork master-ticket mapping. It can link current vWorkTckt rows to the supplied 2025 vWork master snapshot when the legacy work ID matches, while leaving unmatched 2026 master headers explicitly unresolved rather than fabricating relationships. Current payment, pickup, tag, location, customer, catalog, A/R and other DBFs remain importable/stageable. Card credentials are not copied into browser state; card-on-file relationships require processor vault/token migration.
