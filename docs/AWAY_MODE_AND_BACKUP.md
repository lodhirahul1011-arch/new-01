# Away Mode and Backup

## Added routes

Away Mode
- `GET /api/v1/away-mode/overview`
- `PATCH /api/v1/away-mode/toggle`
- `PUT /api/v1/away-mode/schedule`
- `POST /api/v1/away-mode/temporary-code`
- `PUT /api/v1/away-mode/safe-drop`
- `PUT /api/v1/away-mode/video-recording`
- `GET /api/v1/away-mode/presets`

Backup
- `GET /api/v1/backup/overview`
- `POST /api/v1/backup/assign`
- `GET /api/v1/backup/assignments`
- `DELETE /api/v1/backup/assignments/:id`

Compatibility aliases
- `GET /api/v1/deliveries/backup/overview`
- `POST /api/v1/deliveries/backup/assign`
- `GET /api/v1/deliveries/backup/assignments`
- `DELETE /api/v1/deliveries/backup/assignments/:id`

## Notes

- Current stack preserved: Node + Express + MongoDB + Mongoose + existing JWT middleware.
- Home-scoped authorization is enforced through shared `homeAccess.service.js`.
- Away mode keeps one document per `homeId`.
- Temporary codes are generated with `crypto.randomInt` and hashed with SHA-256.
- Backup assignments auto-expire after `BACKUP_ACCESS_VALIDITY_HOURS` (default `24`).
- Backup overview will reuse a delivery OTP when available; otherwise it falls back to the active Away Mode temporary code.
- Route mounting is placed before `/api/v1/deliveries/:id` paths to avoid route collisions.

## Validation

Executed locally:
- `npm run test:delivery-history`
- `npm run test:authorization`
- `npm run test:away-backup`
