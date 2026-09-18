# Mobile Delivery Access and Recordings Enhancement Notes

Updated areas:
- Delivery Access verify context by deliveryId
- Drop zone listing, creation, selection, and status
- Delivery verification method selection (approve in app / NFC card)
- Delivery recording list, detail, download redirect, and share payload
- Recording cards enhanced for orderId, date, time, company, status, thumbnail, download/share actions
- Recording list supports search, status filter, and quick date windows (7/15/30 days)
- Delivery detail payload enriched with OTP, verification status, selected zone, and rejection code

New endpoints:
- GET /api/v1/delivery-access/deliveries/:deliveryId/verify-context
- GET /api/v1/delivery-access/zones
- POST /api/v1/delivery-access/zones
- GET /api/v1/delivery-access/zones/:zoneId/status
- POST /api/v1/delivery-access/deliveries/:deliveryId/select-zone
- POST /api/v1/delivery-access/deliveries/:deliveryId/select-verification-method
- GET /api/v1/deliveries/recordings
- GET /api/v1/deliveries/:id/recording/detail
- GET /api/v1/deliveries/:id/recording/share
- GET /api/v1/deliveries/:id/recording?download=1

Validation performed:
- npm run test:mobile-delivery
- npm run test:mobile-access-recordings
