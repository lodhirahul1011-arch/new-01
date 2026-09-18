# Dvaari Backend Module Audit

Validated against the current production-ready codebase after route recheck and local contract test run.

## Built and available now

### Auth
- POST `/api/v1/auth/signup`
- POST `/api/v1/auth/login`
- POST `/api/v1/auth/send-otp`
- POST `/api/v1/auth/verify-otp`
- POST `/api/v1/auth/forgot-password`
- POST `/api/v1/auth/reset-password`
- POST `/api/v1/auth/refresh`
- POST `/api/v1/auth/logout`
- GET `/api/v1/auth/me`
- GET `/api/v1/auth/sessions`
- POST `/api/v1/auth/logout-all`

### User / profile
- GET `/api/v1/users/me`
- PATCH `/api/v1/users/me`
- PUT `/api/v1/users/me/photo`
- GET `/api/v1/users/me/preferences`
- PUT `/api/v1/users/me/preferences`
- POST `/api/v1/users/me/fcm-token`

### Family members
- GET `/api/v1/family/members`
- GET `/api/v1/family/roles`
- POST `/api/v1/family/invite`
- POST `/api/v1/family/accept-invite`
- PATCH `/api/v1/family/members/:memberId`
- DELETE `/api/v1/family/members/:memberId`

### Devices
- POST `/api/v1/devices/provision`
- POST `/api/v1/devices/link`
- GET `/api/v1/devices`
- GET `/api/v1/devices/:deviceId`
- PATCH `/api/v1/devices/:deviceId`
- POST `/api/v1/devices/:deviceId/unlink`
- POST `/api/v1/devices/:deviceId/heartbeat`
- GET `/api/v1/devices/:deviceId/status`

### Deliveries
- GET `/api/v1/deliveries/summary`
- GET `/api/v1/deliveries/upcoming`
- GET `/api/v1/deliveries/history/summary`
- GET `/api/v1/deliveries/history/filters`
- GET `/api/v1/deliveries/history`
- GET `/api/v1/deliveries/history/:id`
- GET `/api/v1/deliveries/scheduled/upcoming`
- GET `/api/v1/deliveries/rejection-reasons`
- POST `/api/v1/deliveries/notify-arrival`
- POST `/api/v1/deliveries/verify-nfc`
- GET `/api/v1/deliveries/:id`
- GET `/api/v1/deliveries/:id/proof`
- GET `/api/v1/deliveries/:id/recording`
- POST `/api/v1/deliveries/:id/approve`
- POST `/api/v1/deliveries/:id/reject`
- POST `/api/v1/deliveries/:id/rating`
- POST `/api/v1/deliveries/:id/reschedule`

### Analytics
- GET `/api/v1/analytics/monthly-report`
- GET `/api/v1/analytics/export/pdf`
- GET `/api/v1/analytics/export/excel`
- GET `/api/v1/analytics/share/whatsapp`

### Authorizations
- GET `/api/v1/authorizations/generate-code`
- GET `/api/v1/authorizations/summary`
- GET `/api/v1/authorizations/activity-log`
- GET `/api/v1/authorizations`
- POST `/api/v1/authorizations`
- GET `/api/v1/authorizations/:id`
- PATCH `/api/v1/authorizations/:id/use`
- POST `/api/v1/authorizations/:id/use`
- PATCH `/api/v1/authorizations/:id/revoke`
- POST `/api/v1/authorizations/:id/revoke`

Aliases also available for compatibility:
- `/api/authorizations/*`
- `/authorizations/*`
- `/api/v1/deliveries/authorizations/*`
- `/deliveries/authorizations/*`

### Away mode
- GET `/api/v1/away-mode/overview`
- PATCH `/api/v1/away-mode/toggle`
- PUT `/api/v1/away-mode/schedule`
- POST `/api/v1/away-mode/temporary-code`
- PUT `/api/v1/away-mode/safe-drop`
- PUT `/api/v1/away-mode/video-recording`
- GET `/api/v1/away-mode/presets`

### Backup person
- GET `/api/v1/backup/overview`
- POST `/api/v1/backup/assign`
- GET `/api/v1/backup/assignments`
- DELETE `/api/v1/backup/assignments/:id`

Aliases also available for compatibility:
- `/backup/*`
- `/api/v1/deliveries/backup/*`
- `/deliveries/backup/*`

## Partial or not present yet

### Home dashboard
No dedicated routes found yet for:
- `/api/v1/home/dashboard`
- `/api/v1/home/summary`
- `/api/v1/home/activity`
- `/api/v1/home/device-status`

### Security / recordings full module
Only delivery-linked recording endpoint exists right now:
- GET `/api/v1/deliveries/:id/recording`

No standalone routes found yet for:
- `/api/v1/security/*`
- `/api/v1/recordings/*`

### Settings full module
Current settings support is only through user preferences:
- GET `/api/v1/users/me/preferences`
- PUT `/api/v1/users/me/preferences`

No dedicated module found yet for:
- `/api/v1/settings/*`

### NFC cards module
No dedicated routes found yet for:
- `/api/v1/nfc/cards/*`

### Delivery schedule dedicated CRUD module
Reschedule exists on delivery item, but no separate schedule CRUD module found yet.

### Support / FAQ module
No dedicated routes found yet for:
- `/api/v1/support/faqs`
- `/api/v1/support/contact`

### Notification simple mode
No dedicated routes found yet for:
- `/api/v1/notifications/simple-mode`
- `/api/v1/notifications/test`

### Delivery access / zones / lock actions
Current code covers delivery verification and NFC, but no dedicated module found yet for:
- `/api/v1/delivery-access/*`
- `/api/v1/device-actions/*`

## Validation performed
- App route import check passed.
- `npm run test:final-modules` passed.
- Delivery history, authorization, and away/backup contract scripts passed.

## Recommendation for next backend build priority
1. Home dashboard
2. Security and standalone recordings
3. Settings module
4. NFC cards
5. Delivery access / zones / lock actions
6. Support / FAQ
