# Hattan Ops Suite V29

V29 is rebuilt from the last known-good V28.2.10 baseline after the experimental V28.3 builds corrupted the rendered page.

## Release approach
- Preserves the working V28.2.10 POS application and all existing Netlify functions.
- Preserves the centered apartment/unit thermal-ticket fix.
- Does not include the experimental inline CleanBase patches that caused JavaScript source to render as page text.
- Adds only an isolated V29 release marker, leaving the working POS runtime untouched.

## Validation
- All local JS/MJS files pass Node syntax checking.
- All local assets referenced by index.html are present.
- ZIP integrity is verified after packaging.
- The repository's existing test suite has 60 tests: 57 pass and 3 fail on both the original V28.2.10 baseline and V29, so V29 introduces no additional test regressions relative to the supplied working baseline.

CleanBase migration should be added later as an isolated server-side/import module, not injected into the main inline POS application.
