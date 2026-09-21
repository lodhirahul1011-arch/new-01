# Tablet / Door Display Backend Module

This module now covers both the original tablet setup flows and the new live tablet-mobile production flows.

## What it covers

- Direct OTP login aliases for tablet clients via `/api/v1/tablet/auth/*`
- Tablet pairing QR generation
- Mobile app claiming / linking the tablet by scanning the QR
- Tablet config fetch
- Tablet setup updates (name, timezone, language, theme, simple mode)
- Tablet Wi-Fi setup state
- Tablet heartbeat
- Visitor session creation on tablet and resident response from mobile
- Delivery session creation on tablet and OTP verification on tablet
- Generic access-code verification for authorization / away mode / backup flows
- Live tablet-mobile events using Server-Sent Events
- WebRTC signaling relay for offer / answer / ICE candidate exchange
- Ring counting with auto-call start on threshold (default 3)
- OTP display push from mobile app to tablet
- Delivery confirmation from mobile app
- Recording start / stop commands from mobile app to tablet
- Recording upload, temporary links, and thumbnail generation

## Direct login for tablet clients

The existing auth module already supported OTP login using email or mobile number. This build adds tablet-friendly aliases:

- `POST /api/v1/tablet/auth/request-otp`
- `POST /api/v1/tablet/auth/verify-otp`
- `POST /api/v1/tablet/auth/resend-otp`
- `POST /api/v1/tablet/auth/refresh`

If the account does not already exist, the response remains:

- `404 USER_NOT_FOUND`
- message: `Account not found. Please Sign up first.`

## New models

- `DevicePairingSession`
- `VisitorSession`
- `DeliverySession`
- `TabletCallSession`
- `TabletRecording`

## Main routes

### Pairing / setup
- `POST /api/v1/tablet/pairing/session`
- `POST /api/v1/tablet/pairing/claim`
- `GET /api/v1/tablet/:deviceId/config`
- `PATCH /api/v1/tablet/:deviceId/setup`
- `POST /api/v1/tablet/:deviceId/setup/wifi`
- `POST /api/v1/tablet/:deviceId/heartbeat`

### Mobile app management
- `GET /api/v1/tablet/devices`
- `GET /api/v1/tablet/devices/:deviceId`
- `PATCH /api/v1/tablet/devices/:deviceId`

### Visitor flow
- `POST /api/v1/tablet/:deviceId/visitor-sessions`
- `GET /api/v1/tablet/visitor-sessions`
- `PATCH /api/v1/tablet/visitor-sessions/:sessionId/respond`

### Delivery flow
- `POST /api/v1/tablet/:deviceId/delivery-sessions/start`
- `GET /api/v1/tablet/delivery-sessions`
- `GET /api/v1/tablet/delivery-sessions/:sessionId`
- `POST /api/v1/tablet/:deviceId/delivery-sessions/:sessionId/verify-otp`

### Shared code verification
- `POST /api/v1/tablet/:deviceId/access-code/verify`

### Live events and WebRTC signaling
- `GET /api/v1/tablet/realtime/events`
- `GET /api/v1/tablet/:deviceId/realtime/events`
- `POST /api/v1/tablet/:deviceId/calls/initiate`
- `GET /api/v1/tablet/calls`
- `GET /api/v1/tablet/calls/:callId`
- `GET /api/v1/tablet/:deviceId/calls/active`
- `POST /api/v1/tablet/calls/:callId/answer`
- `POST /api/v1/tablet/calls/:callId/reject`
- `POST /api/v1/tablet/calls/:callId/end`
- `POST /api/v1/tablet/:deviceId/calls/:callId/end`
- `POST /api/v1/tablet/calls/:callId/signal`
- `POST /api/v1/tablet/:deviceId/calls/:callId/signal`
- `POST /api/v1/tablet/calls/:callId/show-otp`
- `POST /api/v1/tablet/calls/:callId/recording-command`
- `POST /api/v1/tablet/:deviceId/calls/:callId/recording-status`
- `POST /api/v1/tablet/calls/:callId/confirm-delivery`

### Recordings
- `POST /api/v1/tablet/:deviceId/calls/:callId/recordings/upload`
- `GET /api/v1/tablet/recordings`
- `GET /api/v1/tablet/recordings/:recordingId`
- `GET /api/v1/tablet/recordings/:recordingId/link`
- `GET /api/v1/tablet/recordings/temp/:token`

## AWB fix included

The delivery lookup now supports both:

- `orderId`
- `awbCode`

This removes the earlier mismatch where AWB scans were being matched only against `orderId`.

## Production notes

- Tablet routes use `x-device-id` and `x-device-secret` for device-auth.
- Mobile routes stay on bearer-token user auth.
- Pairing sessions are short-lived and stored server-side.
- Device settings are versioned using `configVersion` so tablet apps can refresh local config when backend config changes.
- Visitor / delivery sessions are home-scoped and share the same `homeId` as the mobile app modules.
- OTP length remains `4` by default unless overridden via env.
- Default recording storage provider is local. You can switch to S3 by setting `STORAGE_PROVIDER=s3` and filling S3 env values.
- WebRTC media stays peer-to-peer between tablet and mobile app. The backend only handles signaling, session state, and recording metadata.
