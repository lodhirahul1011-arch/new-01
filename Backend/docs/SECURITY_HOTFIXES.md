# Security and Production Hotfixes Applied

## Fixed
- Device provisioning now requires `x-internal-secret` and `DEVICE_PROVISION_SECRET`.
- OTP default length changed to 6 digits.
- `SMS_API_KEY` added to environment config.
- `requireAuth` now reads JWT secret from validated env config.
- Family invite token is only returned outside production.
- Upload directories are auto-created on startup.
- Only `uploads/avatars` and `uploads/wallpapers` are public; the full uploads tree is no longer exposed.
- Added home, security, notifications, and support routes for Figma parity.

## Added test scripts
- `npm run test:api-smoke`
- `npm run test:all`

## Added Postman
- `postman/dvaari-all-apis.postman_collection.json`
- `postman/dvaari-local.postman_environment.json`
