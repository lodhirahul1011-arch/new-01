# Dvaari merged onboarding/auth build

This package merges the `dvaarilightmode` onboarding/auth UI into the current mobile frontend while preserving the rest of the current application and the existing SMS provider/login/logout infrastructure.

## Implemented

- Light-mode onboarding/auth screens integrated without replacing unrelated app modules.
- Unified **Log in or sign up** OTP flow:
  - known phone/email -> OTP -> normal login
  - unknown phone/email -> same OTP -> minimal account -> collect second identifier -> Personal Details
- Existing SMS delivery service is still used for phone OTPs.
- Google sign-in:
  - mobile gets Google ID token
  - backend verifies JWT signature/audience/issuer/expiry using Google's rotating public keys
  - existing Google-linked users sign in normally
  - new/incomplete Google users verify their mobile number through the existing SMS OTP/link flow
- WhatsApp OTP from **Try more options** for phone OTP screens.
  - switching to WhatsApp keeps resend on WhatsApp
  - email OTP screens do not show an unusable WhatsApp option
- Gender/date-of-birth profile validation fixed and accepted by the backend.
- Existing logout/refresh-token flow was not replaced.
- Existing non-auth modules remain in the frontend/backend.

## Files intentionally NOT included

- Backend `.env`
- Firebase service-account JSON
- installed `node_modules`
- runtime logs
- production signing secrets

Create `Backend/.env` from `Backend/.env.example` and install packages yourself.

## Required configuration for manual testing

### Backend

At minimum configure your existing database/JWT/SMS values, plus:

- `GOOGLE_WEB_CLIENT_ID` — must match `Frontend/src/config/env.ts`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_OTP_TEMPLATE_NAME`
- `WHATSAPP_OTP_TEMPLATE_LANGUAGE` (default `en`)

For production WhatsApp OTP, configure an approved Meta template whose parameters match the template used by your account.

### Frontend

`Frontend/android/app/google-services.json` is included because the uploaded file was malformed and the JSON syntax was repaired. Its Android package matches `com.dvaari.dvari`.

Install packages from `Frontend/package.json` / `package-lock.json` before building.

## Validation performed before packaging

- 150 frontend `.ts`/`.tsx` files: syntax parse passed
- 768 frontend relative imports: all resolved
- 162 backend `.js` files: `node --check` passed
- all JSON files: parse passed
- 405 backend relative `require(...)` references: all resolved

A complete Android Gradle build and live SMS/Google/WhatsApp provider test still require your local dependencies, credentials, network, Firebase/Google configuration, database, and provider accounts.
