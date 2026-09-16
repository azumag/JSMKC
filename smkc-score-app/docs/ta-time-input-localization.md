# TA time input localization contract

TA time inputs use `ta.timePlaceholder` as the canonical placeholder source. The current English and Japanese value is `M:SS.mm`, so localization changes do not alter the visible format unless the locale messages intentionally change.

The participant qualification inputs, partner inputs, and Phase 3 report input must all resolve the placeholder through `tTa('timePlaceholder')`; do not hard-code `M:SS.mm` in React components. Parsing and validation remain the responsibility of the shared TA time utilities and are unaffected by this display-text contract.

A static contract test at `__tests__/src/app/tournaments/[id]/ta/participant/phase3-placeholder-contract.test.ts` guards the Phase 3 wiring and English/Japanese message parity.
