# Test Matrix

## Auth
1. Register request OTP with new phone/email -> 201 + otpSessionId.
2. Register verify wrong OTP -> 400 OTP_INVALID, server stays up.
3. Register verify correct OTP -> 200 + tokens.
4. Register same verified user again -> 409 USER_EXISTS.
5. Login request OTP for missing user -> 404 USER_NOT_FOUND.
6. Login verify expired OTP -> 400 OTP_EXPIRED.
7. Login verify reused OTP -> 400 OTP_ALREADY_USED.
8. Login verify too many attempts -> 429 OTP_ATTEMPTS_EXCEEDED.
9. Refresh valid token -> 200 new access+refresh.
10. Refresh revoked token -> 401 TOKEN_REVOKED or TOKEN_REUSE_DETECTED.
11. Sessions list -> 200 current sessions.
12. Logout all -> 200 then refresh fails.

## Profile
1. Get me with token -> 200.
2. Patch me duplicate email -> 409 EMAIL_IN_USE.
3. Patch me duplicate phone -> 409 PHONE_IN_USE.
4. Put preferences -> 200.
5. Save FCM token -> 200.


## Delivery History
1. History summary with month filter -> 200 and correct totals.
2. History list with page pagination -> 200 and pagination object present.
3. History list with cursor pagination -> 200 and nextCursor present.
4. History detail for delivered item -> 200 with timeline, proof, recording, partner.
5. History detail for rejected item -> 200 with rejection payload.
6. Proof metadata -> 200 with downloadUrl.
7. Proof PDF download -> 200 application/pdf.
8. Recording metadata -> 200 with streamUrl when available.
9. Recording redirect -> 302 when `view=1` and recording exists.
10. Invalid delivery id -> 400 INVALID_DELIVERY_ID.
11. Cross-home access attempt -> 404 DELIVERY_NOT_FOUND.
12. Invalid month query -> 400 VALIDATION_ERROR.
13. Empty result month -> 200 with empty items and zero totals.
14. Missing recording -> 404 RECORDING_NOT_FOUND when calling `?view=1`.
15. Missing token -> 401 TOKEN_MISSING.
