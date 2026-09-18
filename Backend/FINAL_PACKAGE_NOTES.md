# Dvaari Backend Final Package

Included modules:
- Delivery History
- Authorizations
- Away Mode
- Backup Assignment
- Existing auth, family, device, analytics, and delivery routes
- Tablet setup + live tablet-mobile module

Validation performed:
- npm run test:all

Notes:
- This package intentionally excludes node_modules.
- Copy .env.example to .env and fill production secrets before deployment.
- Static uploads are served from /uploads.

## Tablet / Door Display production upgrade
- Added shared tablet backend module under `/api/v1/tablet`
- Added direct tablet auth aliases under `/api/v1/tablet/auth/*`
- Added pairing-session + mobile claim flow for QR based tablet linking
- Added tablet setup/config/wifi/heartbeat endpoints
- Added visitor session APIs for tablet initiated visitor-at-door flow
- Added delivery session APIs for tablet initiated AWB/order scan + OTP verify flow
- Added AWB field support on `Delivery` and fixed delivery lookup by `awbCode`
- Added real-time Server-Sent Event channels between tablet and mobile app
- Added live call sessions with ring counting and auto-start threshold support
- Added WebRTC signaling endpoints (offer / answer / ICE)
- Added mobile-to-tablet OTP display push
- Added mobile-to-tablet recording start / stop commands
- Added tablet recording upload, temporary links, and thumbnail generation
- Added delivery confirmation endpoint linked to live call state
- Added smoke test: `npm run test:tablet-live`

## Recommended production flow
1. Tablet requests pairing QR and receives device secret.
2. Mobile user scans QR and claims the tablet.
3. Tablet stores `x-device-id` + `x-device-secret`.
4. Mobile and tablet both connect to `/api/v1/tablet/.../realtime/events`.
5. Tablet creates visitor or delivery session.
6. Tablet starts or escalates a live call after the configured ring threshold.
7. WebRTC signaling happens through the call endpoints.
8. Mobile can push OTP, request recording, confirm delivery, and end the call.
9. Tablet uploads the recording after the call.
10. Mobile fetches recording metadata and temporary playback link.
