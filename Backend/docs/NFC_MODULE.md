# NFC Module

Endpoints added/updated:
- GET /api/v1/nfc/cards/overview
- GET /api/v1/nfc/cards
- POST /api/v1/nfc/cards
- PATCH /api/v1/nfc/cards/:cardId
- DELETE /api/v1/nfc/cards/:cardId
- POST /api/v1/nfc/verify-access
- GET /api/v1/nfc/access-logs
- GET /api/v1/delivery-access/methods

Key rules:
- One active NFC card per home
- Raw UID is never stored, only uidHash
- Card removal is soft-delete via status=removed
- Every access attempt is logged to NfcAccessLog
- Settings overview includes nfcCard summary for direct UI rendering
