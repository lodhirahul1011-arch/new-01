# Mobile Delivery Production Test Checklist

## Delivery dashboard
- GET `/api/v1/deliveries/dashboard?status=all&limit=20`
- Verify summary cards: total, successful, rejected
- Verify item cards contain status badge, order id, verification code, date/time, partner info, and reject reason if any

## Upcoming delivery list
- GET `/api/v1/deliveries/upcoming?status=upcoming&limit=20`
- Verify upcoming orders only
- Verify `mobileItems` payload matches the UI card fields

## Delivery detail
- GET `/api/v1/deliveries/:id`
- Verify package details block: OTP, order id, payment, company, verification code, date/time
- Verify `verificationMethods` contains `nfc` and `app`
- Verify rating block for delivered order

## Rejection flow
- GET `/api/v1/deliveries/rejection-reasons`
- POST `/api/v1/deliveries/:id/reject` with `{ "code": "wrong_item" }`
- Verify response includes rejection message, dialog metadata, order id, and updated status `rejected`

## Approval flow
- POST `/api/v1/deliveries/:id/approve`
- Verify response status `delivered` and `verificationMethod=app`
- Verify logs show `[DELIVERY][APPROVE]`

## NFC flow
- POST `/api/v1/deliveries/verify-nfc`
- Verify response status `delivered` and `verificationMethod=nfc`
- Verify logs show `[DELIVERY][NFC]`

## Monthly report
- GET `/api/v1/analytics/monthly-report?month=YYYY-MM`
- Verify total, successful, rejected, previous month comparison, category percentages, family member counts, security insights
- Test category filter using `category=business|household|personal|other`

## Export / share
- GET `/api/v1/analytics/export/pdf?month=YYYY-MM`
- GET `/api/v1/analytics/export/excel?month=YYYY-MM`
- GET `/api/v1/analytics/share/whatsapp?month=YYYY-MM`
- Verify PDF download, XLSX download, and WhatsApp deep link payload
