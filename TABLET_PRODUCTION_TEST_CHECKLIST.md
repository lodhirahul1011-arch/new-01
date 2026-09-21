# Tablet Production Test Checklist

Use this checklist against the updated backend zip. The order below matches the intended production flow and Postman collection folders.

## 1. Signup and Login
- Request OTP with an existing mobile-app email or phone.
- Verify OTP and confirm login succeeds.
- Repeat with a non-existing identifier and confirm backend returns sign-up required / user-not-found.
- Call `GET /api/v1/tablet/auth/me` and confirm the logged-in mobile user is correct.

## 2. Pairing and Device Naming
- Create pairing session from tablet bootstrap.
- Scan / claim QR token from the mobile side.
- Confirm device is linked and visible in `GET /api/v1/tablet/devices`.
- Rename the device and confirm the new display name is returned in device list and config.

## 3. Setup and Mobile-Tablet Sync
- Open both SSE endpoints:
  - mobile: `GET /api/v1/tablet/realtime/events`
  - tablet: `GET /api/v1/tablet/:deviceId/realtime/events`
- Update setup, Wi-Fi, and heartbeat.
- Confirm config update / heartbeat events arrive on the opposite side.
- Confirm `GET /api/v1/tablet/:deviceId/config` returns latest configVersion and displayName.

## 4. Doorbell / Visitor Flow
- Create visitor session from tablet.
- Verify session appears in mobile-side visitor list.
- Trigger 3-ring call initiation and confirm call is created and mobile receives ringing/started event.
- Accept or reject visitor session from mobile and confirm tablet sees the state change.

## 5. Delivery Flow
- Start delivery session using orderId and AWB.
- Confirm session is created and OTP is returned.
- Verify OTP from tablet and confirm delivery status changes.
- Confirm delivery from mobile and verify final state.

## 6. Live Call and WebRTC Signaling
- Initiate a call from tablet with `forceStart=true` and `ringIncrement=3`.
- Answer from mobile.
- Exchange offer, answer, and ICE signaling through the API endpoints.
- Confirm active call API reflects signaling state changes.
- Push OTP from mobile and verify tablet gets the show-otp event.

## 7. Recording Flow
- Send recording start command from mobile.
- Tablet reports `recording` status.
- Upload recorded file from tablet.
- Confirm recording list, detail, temp link, and thumbnail endpoints all work.
- Stop recording and confirm call/recording state is updated.

## 8. End Call
- End call from mobile and from tablet.
- Confirm final state is `ended` and `endReason` is stored.

## 9. Regression Checks
- AWB flow should work even when AWB differs from orderId.
- Simple mode and device naming changes should still reflect in config.
- No existing mobile auth routes should be broken by `/api/v1/tablet/auth/*` aliases.
