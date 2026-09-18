# Delivery History Backend Notes

## What was kept backward-compatible
- Existing delivery routes remain available.
- Existing `/api/v1/deliveries/history` route still works; it now returns extra UI-ready fields.
- Existing `/api/v1/deliveries/:id` route still works; it now returns enriched detail data.
- Existing `/api/v1/deliveries/:id/proof` and `/api/v1/deliveries/:id/recording` routes still return JSON by default.

## What was added
- `/api/v1/deliveries/history/summary`
- `/api/v1/deliveries/history/filters`
- `/api/v1/deliveries/history/:id`
- PDF download mode on `/api/v1/deliveries/:id/proof?download=1`
- Redirect mode on `/api/v1/deliveries/:id/recording?view=1`

## Important implementation notes
- `primaryHomeId` is now loaded in auth middleware so home scoping works correctly.
- Query validation now accepts blank query params for frontend compatibility.
- `month` validation is strict (`YYYY-MM` and valid month only).
- List API supports both `page/limit` and legacy `cursor/limit`.
- Proof metadata returns a download URL even when no external file is stored by generating a PDF on demand.

## Local verification
```bash
npm run test:delivery-history
```

This runs contract-style tests against the delivery history service using in-memory fixtures.
