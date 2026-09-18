# Authorization Module

Production-ready authorization APIs for the Delivery Access / Deliver to Dvaari Box flow.

## Supported base paths

The same route handler is mounted on multiple safe prefixes to reduce frontend breakage risk:

- `/api/v1/authorizations`
- `/api/authorizations`
- `/authorizations`
- `/api/v1/deliveries/authorizations`
- `/deliveries/authorizations`

## Primary endpoints

### Create authorization

`POST /api/v1/authorizations`

```json
{
  "name": "Amazon Delivery",
  "scheduleType": "TODAY",
  "startDate": "2026-02-19",
  "endDate": "2026-02-19",
  "startTime": "14:00",
  "endTime": "18:00",
  "company": "Amazon",
  "purpose": "delivery",
  "otpRequired": false
}
```

### List authorizations

`GET /api/v1/authorizations?status=ALL&page=1&limit=10&search=`

### Summary

`GET /api/v1/authorizations/summary`

### Activity log

`GET /api/v1/authorizations/activity-log?status=ALL&page=1&limit=10`

### Generate access code

`GET /api/v1/authorizations/generate-code`

### Get single authorization

`GET /api/v1/authorizations/:id`

### Mark as used

`PATCH /api/v1/authorizations/:id/use`

```json
{
  "otpVerified": true,
  "verificationMethod": "otp",
  "deliveryPersonName": "Amazon Delivery Partner"
}
```

### Revoke authorization

`PATCH /api/v1/authorizations/:id/revoke`

```json
{
  "reason": "revoked_by_user"
}
```

## Notes

- Access code generation uses `crypto.randomInt`.
- Active access codes are unique per home.
- Access is home-scoped and authenticated.
- Expired authorizations are lazily auto-expired on read/write operations.
- Schedule/time fields are stored in UTC-friendly ISO/date string compatible form.
- Existing delivery history APIs remain unchanged.
