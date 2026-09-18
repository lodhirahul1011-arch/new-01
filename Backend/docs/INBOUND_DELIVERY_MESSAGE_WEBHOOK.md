# Registered-Phone Inbound Delivery Message Webhook

This endpoint allows an SMS/WhatsApp provider to send a resident's message directly to the backend. The backend identifies the resident from `User.phone` and schedules/updates the delivery under that resident's `homeId`.

## Endpoint

```http
POST /api/v1/sms/inbound
```

This endpoint does **not** use the resident JWT. It is provider-facing and is protected by a webhook secret.

## Configuration

Add this to `.env`:

```env
INBOUND_MESSAGE_WEBHOOK_SECRET=use-a-long-random-secret-here
SMS_COUNTRY_CODE=91
```

In production, if the webhook secret is missing the endpoint returns `503` instead of accepting unauthenticated inbound messages.

## Authentication

Send either:

```http
X-Webhook-Secret: <INBOUND_MESSAGE_WEBHOOK_SECRET>
```

or:

```http
Authorization: Bearer <INBOUND_MESSAGE_WEBHOOK_SECRET>
```

## Accepted payloads

Generic JSON:

```json
{
  "from": "+919876543210",
  "message": "My package ORD-1045 will be delivered tomorrow by 4 PM",
  "messageId": "provider-message-123"
}
```

The following aliases are also supported:

- sender: `senderPhone`, `from`, `phone`, `msisdn`, `From`, `WaId`
- text: `smsText`, `message`, `text`, `body`, `Body`, `Message`
- provider message id: `messageId`, `message_id`, `id`, `MessageSid`, `SmsSid`, `SmsMessageSid`

This makes the endpoint compatible with generic JSON integrations and common Twilio-style form payloads.

## Processing flow

1. Validate the provider webhook secret.
2. Normalize the sender phone to E.164 using `SMS_COUNTRY_CODE`.
3. Find a non-deleted `User` whose `phone` matches the sender.
4. Resolve the user's `homeId` using the existing `primaryHomeId` fallback logic.
5. Reuse `smsParser.service.js` to detect/extract the delivery and create/update `DeliverySchedule`.
6. Attach the registered user's phone/name to the schedule when those fields are empty.
7. Reuse the existing upcoming-delivery push notification for newly-created schedules.
8. Deduplicate provider retries using the provider's `messageId` where available.

Unregistered sender numbers are ignored with HTTP 200 so SMS/WhatsApp providers do not repeatedly retry them.

## Example cURL

```bash
curl -X POST http://localhost:5000/api/v1/sms/inbound \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{
    "from": "+919876543210",
    "message": "Package order ORD-1045 will be delivered tomorrow by 4 PM",
    "messageId": "msg-001"
  }'
```

Successful response:

```json
{
  "success": true,
  "data": {
    "ignored": false,
    "userMatched": true,
    "scheduleUpdated": true,
    "scheduleId": "..."
  }
}
```

Unregistered sender:

```json
{
  "success": true,
  "data": {
    "ignored": true,
    "reason": "unregistered_sender",
    "scheduleUpdated": false,
    "scheduleId": null
  }
}
```
