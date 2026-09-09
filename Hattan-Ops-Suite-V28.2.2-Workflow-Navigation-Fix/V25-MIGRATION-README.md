# Hattan Ops Suite V25 Migration Center

## What V25 adds
Manager-only Migration Center in the POS sidebar.

Supported upload/review paths:
- CSV / TSV: local deterministic column matching
- Excel XLS/XLSX/XLSM/XLSB/ODS: SheetJS browser parser
- JSON: local deterministic import
- PNG/JPG screenshots: secure Netlify Function -> OpenAI structured extraction
- PDF reports: secure Netlify Function -> OpenAI file extraction
- TXT/XML/SQL/HTML/log/code-like text exports: secure Netlify Function -> structured extraction

Data staged for review:
- customers and contact/address data
- customer legacy number
- A/R balance and store credit
- customer notes/preferences/default fulfillment
- ticket history
- dates, status, service/items, totals and unpaid balance
- rack/conveyor/location
- daily revenue history

## Safety
Nothing is written to live Hattan data until Final Import is pressed by a manager.
Final Import automatically downloads a full pre-migration JSON backup first.
### Idempotent / safe re-import behavior
- Every uploaded file gets a SHA-256 fingerprint. If the exact file was already committed, V25 marks it **already imported** and does not parse/import it again.
- Duplicate customers are matched by legacy customer number, then phone, then email and are **updated in place**.
- Repeated identical customer memos are not appended twice.
- Tickets are keyed by legacy ticket number. A later export with the same ticket number **updates the existing ticket** (status, balance/payment state, rack, due date, service/items, notes, totals) instead of creating another ticket.
- Daily revenue is keyed by date and newer values replace the prior imported values for that date.
- Within one staging session, duplicate rows are merged with latest nonblank values winning.
- Newer exports can therefore contain old + new data safely: unchanged identities stay single; changed fields refresh; genuinely new identities are added.

FULL CARD NUMBERS / CVV MUST NOT BE IMPORTED HERE.
The AI endpoint rejects text that appears to contain PAN/card numbers. Card-on-file migration must be processor-to-processor. Use the V25 token mapping template only after the processor returns new vault identifiers/tokens.

## Netlify environment
For image/PDF/text AI extraction add:
OPENAI_API_KEY=...
OPENAI_IMPORT_MODEL=gpt-4.1-mini   (optional)

CSV/Excel/JSON imports do not require OpenAI.

## Deploy
Upload ALL files in this folder/repository to GitHub. Do not upload only index.html.
Netlify should remain connected to the repository with publish directory `.`.
After deploy, hard refresh the POS. The sidebar/footer branding should say V25 Migration.

## Recommended real migration order
1. Export a complete backup from the legacy POS.
2. Import customer master file first.
3. Import open/current tickets and rack/conveyor report.
4. Import A/R and store credit reports.
5. Import historical tickets/revenue in batches.
6. Review counts and spot-check customers before Final Import.
7. Arrange processor-to-processor card vault migration separately.
