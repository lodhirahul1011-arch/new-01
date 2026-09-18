# Dvaari Backend (Node + Express + MongoDB)

This backend now covers the mobile app APIs and the tablet / door-display production flows.

## Included capabilities
- OTP login using email or mobile number
- Device registration and device linking
- User settings and device management
- Delivery, authorization, away-mode, backup, NFC, analytics modules
- Tablet pairing and setup
- Tablet visitor and delivery flows
- Live tablet-mobile events using Server-Sent Events
- WebRTC signaling relay for tablet to mobile live calls
- Recording upload, temporary playback links, and thumbnail generation

## Tech
- Node.js + Express
- MongoDB + Mongoose
- OTP (hashed), expiry, attempts, resend limits
- JWT access + refresh tokens
- Zod validation
- Rate limiting + Helmet

## Setup

1. Install dependencies
```bash
npm install
```

2. Create `.env`
Copy `.env.example` to `.env` and update values.

3. Run
```bash
npm run dev
```

## Main auth routes
Base URL: `http://localhost:5000`

### Mobile auth
- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/resend-otp`
- `POST /api/v1/auth/refresh`

### Tablet auth aliases
- `POST /api/v1/tablet/auth/request-otp`
- `POST /api/v1/tablet/auth/verify-otp`
- `POST /api/v1/tablet/auth/resend-otp`
- `POST /api/v1/tablet/auth/refresh`

If a user does not already exist, OTP login returns `USER_NOT_FOUND` and the app should show `Please Sign up first`.

## Main tablet routes
- Pairing/setup: `/api/v1/tablet/pairing/*`, `/api/v1/tablet/:deviceId/config`, `/api/v1/tablet/:deviceId/setup`
- Visitor flow: `/api/v1/tablet/:deviceId/visitor-sessions`, `/api/v1/tablet/visitor-sessions/*`
- Delivery flow: `/api/v1/tablet/:deviceId/delivery-sessions/*`
- Live events: `/api/v1/tablet/realtime/events`, `/api/v1/tablet/:deviceId/realtime/events`
- Live calls: `/api/v1/tablet/calls/*`, `/api/v1/tablet/:deviceId/calls/*`
- Recordings: `/api/v1/tablet/recordings/*`

## Recording storage
Default provider is local storage. For production S3 storage set:
- `STORAGE_PROVIDER=s3`
- `AWS_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

## Tests
```bash
npm run test:all
```

## Important tablet notes
- Tablet device-auth uses `x-device-id` and `x-device-secret`.
- WebRTC media does not go through the backend. The backend handles signaling, state sync, OTP display, and recording metadata.
- Delivery lookup now supports both `orderId` and `awbCode`.

## Postman
Import the Postman collections from the `postman/` directory.
