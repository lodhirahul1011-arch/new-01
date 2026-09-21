# Dvaari Backend – API Contract (v1)

Base URL: `http://<host>:<port>`

- Preferred versioned routes: `/api/v1/*`
- Backward compatibility: `/auth/*` is still available.

All JSON responses follow:

```json
{ "ok": true, "data": { } }
```

On error:

```json
{ "ok": false, "error": "message", "details": [] }
```

---

## Auth (OTP + JWT)

### Request OTP
`POST /api/v1/auth/request-otp`  (also: `POST /auth/request-otp`)

Body:
```json
{ "identifier": "+919876543210" }
```
OR
```json
{ "identifier": "user@gmail.com" }
```

Response:
```json
{ "ok": true, "message": "Verification code sent", "to": "+91•••••••••", "expiresAt": "2026-03-05T00:00:00.000Z" }
```

### Verify OTP (Login)
`POST /api/v1/auth/verify-otp` (also: `POST /auth/verify-otp`)

Body:
```json
{ "identifier": "+919876543210", "code": "123456" }
```

Response:
```json
{ "ok": true, "accessToken": "...", "refreshToken": "...", "user": { "id": "...", "name": "...", "email": "...", "phone": "..." } }
```

### Device Registration (Signup) – Request OTP
`POST /api/v1/auth/device-registration-request-otp`

Body:
```json
{ "name": "Design", "email": "design@gmail.com", "phone": "+919876543210" }
```

Response:
```json
{ "ok": true, "message": "Verification code sent", "to": "+91•••••••••", "expiresAt": "...", "userId": "..." }
```

### Device Registration (Signup) – Verify OTP
`POST /api/v1/auth/device-registration-verify-otp`

Body:
```json
{ "identifier": "+919876543210", "code": "123456" }
```

Response:
```json
{ "ok": true, "accessToken": "...", "refreshToken": "...", "user": { "id": "...", "name": "...", "email": "...", "phone": "..." } }
```

### Resend OTP
`POST /api/v1/auth/resend-otp`

Body:
```json
{ "identifier": "+919876543210", "purpose": "login" }
```

Response:
```json
{ "ok": true, "message": "Verification code resent", "expiresAt": "..." }
```

### Refresh Tokens
`POST /api/v1/auth/refresh`

Body:
```json
{ "refreshToken": "..." }
```

Response:
```json
{ "ok": true, "accessToken": "...", "refreshToken": "..." }
```

### Logout
`POST /api/v1/auth/logout`

Body:
```json
{ "refreshToken": "..." }
```

Response:
```json
{ "ok": true, "message": "Logged out" }
```

---

## Users (Profile + Preferences)

All routes require header:

`Authorization: Bearer <accessToken>`

### Get Current User
`GET /api/v1/users/me`

Response:
```json
{ "ok": true, "data": { "id": "...", "name": "...", "email": "...", "phone": "...", "isVerified": true, "preferences": { } } }
```

### Update Profile
`PATCH /api/v1/users/me`

Body (any subset):
```json
{ "name": "New Name", "email": "new@email.com", "phone": "+911234567890" }
```

Response:
```json
{ "ok": true, "data": { "id": "...", "name": "...", "email": "...", "phone": "..." } }
```

### Get Preferences
`GET /api/v1/users/me/preferences`

Response:
```json
{ "ok": true, "data": { "language": "en", "mode": "active", "notifications": { "doorbellAlerts": true }, "sound": "default", "vibration": true } }
```

### Update Preferences (Merged)
`PUT /api/v1/users/me/preferences`

Body (any subset; server merges nested values):
```json
{ "mode": "away", "notifications": { "deviceStatus": true } }
```

Response:
```json
{ "ok": true, "data": { "language": "en", "mode": "away", "notifications": { "deviceStatus": true }, "sound": "default", "vibration": true } }
```

### Save FCM Token
`POST /api/v1/users/me/fcm-token`

Body:
```json
{ "token": "<fcm_token>", "platform": "android" }
```

Response:
```json
{ "ok": true, "data": { "count": 1 } }
```

---

## Devices (Provision + Link + Management)

### Provision Device (Testing/Manufacturing)
`POST /api/v1/devices/provision`

Body:
```json
{ "deviceId": "DV123", "type": "box", "name": "Main Entrance Box" }
```

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123", "qrToken": "PAIR_xxx.yyy", "deviceSecret": "SEC_...", "pairingExpiresAt": "..." } }
```

### Link Device (from QR)
`POST /api/v1/devices/link`

Headers: `Authorization: Bearer <accessToken>`

Body:
```json
{ "qrToken": "PAIR_xxx.yyy" }
```

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123", "name": "Main Entrance Box", "type": "box", "status": "offline" } }
```

### List Devices
`GET /api/v1/devices`

Response:
```json
{ "ok": true, "data": [ { "deviceId": "DV123", "name": "..." } ] }
```

### Update Device (rename/settings)
`PATCH /api/v1/devices/:deviceId`

Body:
```json
{ "name": "Dvaari Box", "settings": { "wallpaperPreset": "Gradient Blue", "fontSize": 18 } }
```

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123", "name": "Dvaari Box", "settings": { "fontSize": 18 } } }
```

### Unlink Device
`POST /api/v1/devices/:deviceId/unlink`

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123" } }
```

### Heartbeat (Device → Backend)
`POST /api/v1/devices/:deviceId/heartbeat`

Headers:
- `x-device-id: DV123`
- `x-device-secret: SEC_...`

Body:
```json
{ "status": "online" }
```

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123", "status": "online", "lastSeenAt": "..." } }
```

### Get Device Status
`GET /api/v1/devices/:deviceId/status`

Response:
```json
{ "ok": true, "data": { "deviceId": "DV123", "status": "online", "lastSeenAt": "..." } }
```


---

## Deliveries – Delivery History Module

These routes extend the existing delivery module without removing legacy routes.
Legacy routes such as `/api/v1/deliveries/summary`, `/api/v1/deliveries/history`, `/api/v1/deliveries/:id`, `/api/v1/deliveries/:id/proof`, and `/api/v1/deliveries/:id/recording` still work.

### History Summary
`GET /api/v1/deliveries/history/summary`

Query params:
```json
{ "month": "2025-11", "search": "", "memberId": "", "company": "" }
```

Response:
```json
{
  "ok": true,
  "message": "Delivery history summary fetched successfully",
  "data": { "total": 47, "successful": 43, "delivered": 43, "rejected": 4 }
}
```

### History Filters
`GET /api/v1/deliveries/history/filters`

Response:
```json
{
  "ok": true,
  "message": "Delivery history filters fetched successfully",
  "data": {
    "statuses": [
      { "key": "all", "label": "ALL" },
      { "key": "delivered", "label": "Delivered" },
      { "key": "rejected", "label": "Rejected" }
    ],
    "months": [
      { "key": "2025-11", "label": "Nov 2025" }
    ],
    "companies": [
      { "key": "flipkart", "label": "Flipkart" }
    ]
  }
}
```

### History List
`GET /api/v1/deliveries/history`

Supported query params:
```json
{
  "status": "all",
  "page": 1,
  "limit": 20,
  "cursor": "",
  "month": "2025-11",
  "search": "",
  "memberId": "",
  "company": ""
}
```

- `status`: `all | delivered | rejected`
- `page` + `limit`: page-based pagination
- `cursor`: backward-compatible cursor pagination

Response includes:
- `summary` for top cards
- `filters` echo block for frontend state
- `items` as UI-ready cards
- `pagination` and `nextCursor`

### History Detail
`GET /api/v1/deliveries/history/:id`

Returns raw delivery fields plus UI-ready fields such as:
- `statusLabel`
- `statusColor`
- `dateLabel`
- `timeLabel`
- `partner`
- `proof`
- `recording`
- `rejection`
- `timeline`

### Proof Metadata
`GET /api/v1/deliveries/:id/proof`

Response:
```json
{
  "ok": true,
  "message": "Proof file ready",
  "data": {
    "id": "...",
    "available": true,
    "fileName": "RFK-2891-proof.pdf",
    "downloadUrl": "/api/v1/deliveries/<id>/proof?download=1",
    "proofUrl": "/api/v1/deliveries/<id>/proof?download=1"
  }
}
```

### Proof PDF Download
`GET /api/v1/deliveries/:id/proof?download=1`

- Returns a generated PDF when no external proof file exists.
- Redirects to existing proof URL when a direct file URL is stored.

### Recording Metadata
`GET /api/v1/deliveries/:id/recording`

Response:
```json
{
  "ok": true,
  "message": "Recording fetched successfully",
  "data": {
    "id": "...",
    "available": true,
    "type": "video",
    "viewUrl": "/api/v1/deliveries/<id>/recording?view=1",
    "streamUrl": "https://...",
    "recordingUrl": "https://...",
    "thumbnailUrl": "https://...",
    "durationSeconds": null,
    "recordingSaved": true
  }
}
```

### Recording Redirect
`GET /api/v1/deliveries/:id/recording?view=1`

- Redirects to the underlying recording URL when available.

### Validation and Error Shape

All delivery-history validations now use a consistent error payload:
```json
{
  "ok": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation error",
  "error": "Validation error",
  "details": []
}
```

Not-found example:
```json
{
  "ok": false,
  "code": "DELIVERY_NOT_FOUND",
  "message": "Delivery not found",
  "error": "Delivery not found"
}
```
