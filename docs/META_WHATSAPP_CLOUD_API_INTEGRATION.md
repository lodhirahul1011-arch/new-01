# Meta WhatsApp Cloud API integration

## Endpoint

Configure Meta's callback URL as:

`https://YOUR_DOMAIN/api/v1/whatsapp/webhook`

The same URL handles:
- `GET` verification (`hub.mode`, `hub.verify_token`, `hub.challenge`)
- `POST` inbound WhatsApp messages
- `POST` outbound message status callbacks (`sent`, `delivered`, `read`, `failed`)

## Environment variables

```env
WHATSAPP_VERIFY_TOKEN=choose-a-long-random-string
WHATSAPP_APP_SECRET=<Meta App Secret>
WHATSAPP_ACCESS_TOKEN=<Cloud API access token>
WHATSAPP_PHONE_NUMBER_ID=<WhatsApp Business phone number ID>
WHATSAPP_GRAPH_API_VERSION=v26.0
WHATSAPP_AUTO_REPLY=true
WHATSAPP_REPLY_ON_UNRECOGNIZED=false
WHATSAPP_REPLY_TO_UNREGISTERED=false
SMS_COUNTRY_CODE=91
```

Do not commit actual secrets to Git.

## Processing flow

1. Meta verifies the GET endpoint with `WHATSAPP_VERIFY_TOKEN`.
2. POST webhooks are authenticated using `X-Hub-Signature-256` and `WHATSAPP_APP_SECRET`.
3. Text/button/interactive replies are extracted from the WhatsApp webhook.
4. The WhatsApp sender (`messages[].from`) is normalized and matched against `User.phone`.
5. Unregistered numbers are ignored by default.
6. Registered users are resolved to their `homeId`.
7. The existing `smsParser.service.js` processes the message and creates/updates `DeliverySchedule`.
8. The incoming Meta message ID is passed into the SMS parser for idempotency, preventing duplicate schedules on webhook retries.
9. Existing push notifications are triggered for a newly created upcoming schedule.
10. If `WHATSAPP_AUTO_REPLY=true`, the backend replies to the WhatsApp user with a scheduling confirmation using Meta's `/PHONE_NUMBER_ID/messages` endpoint.
11. Outbound status webhooks update `WhatsAppMessage` records.

## Meta Dashboard setup

In Meta for Developers:

1. Create/select the Meta app with the WhatsApp product.
2. Under WhatsApp configuration, set the callback URL to the endpoint above.
3. Enter the same value used in `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe the WhatsApp Business Account to the `messages` webhook field.
5. Put the App Secret into `WHATSAPP_APP_SECRET`.
6. Put the WhatsApp Business phone number ID into `WHATSAPP_PHONE_NUMBER_ID`.
7. Use a suitable production access token in `WHATSAPP_ACCESS_TOKEN`.
8. Subscribe the app to the exact WhatsApp Business Account (WABA) that owns the phone number:

```bash
npm run whatsapp:subscribe --waba-id=YOUR_WABA_ID
```

You can find `YOUR_WABA_ID` in Meta's WhatsApp API setup page as the WhatsApp Business Account ID. This is different from the Meta App ID and different from `WHATSAPP_PHONE_NUMBER_ID`.

## Local testing with ngrok

Start the backend locally:

```bash
npm run dev
```

In a second terminal, expose the local backend:

```bash
npm run whatsapp:webhook-proxy
```

In a third terminal, expose only the webhook proxy:

```bash
npm run ngrok:whatsapp -- --target=http://localhost:5055 --port=5055
```

The proxy only forwards `GET` and `POST` requests for `/api/v1/whatsapp/webhook` to the backend. The ngrok helper reads `.env`, starts `ngrok http` for the requested target, and prints:

```text
whatsappWebhookUrl: https://YOUR_NGROK_URL/api/v1/whatsapp/webhook
```

Use that printed URL as the Meta callback URL, and use the same `WHATSAPP_VERIFY_TOKEN` from `.env` as the Meta verify token.

Optional local env values:

```env
WHATSAPP_WEBHOOK_PROXY_PORT=5055
WHATSAPP_WEBHOOK_BACKEND_URL=http://localhost:5000
NGROK_DOMAIN=your-static-domain.ngrok-free.app
NGROK_REGION=ap
NGROK_BIN=C:\path\to\ngrok.exe
```

If `NGROK_DOMAIN` is not set, ngrok will create a random URL each time. Update the Meta callback URL whenever that random URL changes.

## Supported incoming content

Scheduling is currently triggered from:
- WhatsApp text messages
- button replies
- interactive button/list selections (their returned title/id becomes the parser text)

Images, audio, documents, location, contacts, and stickers are logged but not passed to the delivery parser.

## Production notes

- HTTPS is required for the public callback URL.
- Keep `WHATSAPP_APP_SECRET` and `WHATSAPP_ACCESS_TOKEN` server-side only.
- `WHATSAPP_REPLY_TO_UNREGISTERED` defaults to false so the endpoint does not disclose registration state unless explicitly enabled.
- Free-form confirmation replies are intended for the active customer-service conversation created by the user's inbound WhatsApp message. For business-initiated messages outside the allowed service window, configure approved WhatsApp templates separately.
