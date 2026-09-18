# Settings Module

Fresh settings/backend coverage added for these Figma screens:
- Profile overview aggregation
- Notifications
- Language
- Help & Support
- NFC Cards
- Linked Devices summary
- Device wallpaper gallery upload
- Device integrations (Amazon / Flipkart connect + verify)

## Main routes
- `GET /api/v1/settings`
- `GET /api/v1/settings/notifications`
- `PUT /api/v1/settings/notifications`
- `GET /api/v1/settings/language`
- `PUT /api/v1/settings/language`
- `GET /api/v1/settings/help`
- `POST /api/v1/settings/help/contact`
- `GET /api/v1/nfc/cards`
- `POST /api/v1/nfc/cards`
- `PATCH /api/v1/nfc/cards/:cardId`
- `DELETE /api/v1/nfc/cards/:cardId`
- `POST /api/v1/nfc/cards/:cardId/activate`
- `POST /api/v1/nfc/cards/:cardId/deactivate`
- `GET /api/v1/devices/linked/summary`
- `POST /api/v1/devices/link/scan`
- `GET /api/v1/devices/wallpapers`
- `POST /api/v1/devices/:deviceId/wallpaper/gallery`
- `GET /api/v1/devices/:deviceId/integrations`
- `POST /api/v1/devices/:deviceId/integrations/connect`
- `POST /api/v1/devices/:deviceId/integrations/:provider/verify`
- `POST /api/v1/devices/:deviceId/integrations/:provider/disconnect`

## Notes
- Existing profile and device APIs remain backward-compatible.
- Verification code for device integrations is returned only outside production for local QA.
- NFC UID is never stored in raw form; only SHA-256 hash is saved.
