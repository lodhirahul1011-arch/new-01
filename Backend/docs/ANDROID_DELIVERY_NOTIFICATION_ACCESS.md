# Android Delivery Notification Access

Android delivery detection uses `NotificationListenerService` in the mobile app.
It does not require `READ_SMS`, `RECEIVE_SMS`, or Accessibility permissions.

The mobile app processes notification title/body text in memory only, and only
for allowlisted SMS app packages. The backend receives structured fields:
hashed notification id, source package, posted timestamp, merchant/courier name,
order or tracking id, delivery date, delivery time window, status, confidence,
timezone, reminder lead time, and matched keywords.

The complete notification text is not stored by this backend. Duplicate delivery
events are prevented by a per-home unique hashed notification id. If the same
hash is retried with identical payload data, the original schedule response is
returned. If the same hash is reused with different payload data, the API
returns `409 Conflict`.

If date or time is missing, uncertain, or the notification says delivered, the
schedule is saved with `confirmationRequired: true`. The schedule is not marked
delivered automatically; delivery completion still requires user or backend
confirmation through existing delivery flows.

Notification capture is not guaranteed when Android notification access is
disabled, notification previews are hidden, grouped notifications suppress
content, the SMS app hides text, or the device restarts before Android delivers
the notification listener event.
