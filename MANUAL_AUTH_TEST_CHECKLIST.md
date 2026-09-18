# Manual auth test checklist

Run these after adding your own `.env`, service account/configuration, and installing packages.

## 1. Existing phone user — SMS login
1. Open Login.
2. Enter an existing phone number.
3. Confirm the existing SMS provider sends the OTP.
4. Enter OTP.
5. Confirm the existing user is logged in and is not sent through signup again.
6. Logout and confirm refresh/session cleanup still works.

## 2. New phone user — unified signup
1. Enter a phone number that is not in the database.
2. Confirm it still receives OTP on the same SMS service (no USER_NOT_FOUND detour).
3. Verify OTP.
4. Confirm the app asks for the missing email.
5. Verify email OTP.
6. Confirm Personal Information opens.
7. Select Male, Female, and Prefer not to say in separate tests; save successfully.
8. Confirm DOB saves as YYYY-MM-DD in the backend.

## 3. Email-first signup
1. Continue with Email using an unknown email.
2. Verify email OTP.
3. Confirm Enter Phone Number opens.
4. Verify phone by SMS.
5. Confirm Personal Information opens and completes onboarding.

## 4. WhatsApp OTP
1. Start a phone OTP flow.
2. On OTP screen tap Try more options.
3. Tap Send OTP on WhatsApp.
4. Confirm the backend sends through WhatsApp Cloud API.
5. Wait for resend timer and tap Resend OTP.
6. Confirm resend stays on WhatsApp rather than falling back to SMS.
7. Confirm the same code verification endpoint accepts the WhatsApp-issued OTP.

## 5. Google sign-in — new user
1. Tap Google sign-in.
2. Select a Google account not yet linked in Dvaari.
3. Confirm backend Google token verification succeeds.
4. Confirm Enter Phone Number opens.
5. Verify phone using the existing SMS provider.
6. Confirm Personal Information opens with Google name/photo prefilled when available.
7. Finish onboarding.

## 6. Google sign-in — existing completed user
1. Use the same Google account again after logout.
2. Confirm it signs in and does not repeat phone verification/personal details when already complete.

## 7. Gender validation regression
Test all three supported values:
- Male
- Female
- Prefer not to say

Also confirm no empty/unrecognised gender value is sent.

## 8. Relaunch/session restore
1. Login successfully.
2. Force close the app.
3. Relaunch.
4. Confirm `/auth/me` restores the correct phone/email verification state and does not loop back to verification unnecessarily.
