# Profile Photo Delete API

Added endpoint:
- `DELETE /api/v1/users/me/photo`

Behavior:
- requires auth
- clears avatar metadata from user profile
- removes local avatar file from `uploads/avatars` when present
- writes audit log with action `delete_photo`

Response:
```json
{
  "ok": true,
  "data": {
    "id": "...",
    "name": "...",
    "email": "...",
    "phone": "...",
    "address": "...",
    "avatar": {
      "url": "",
      "filename": "",
      "mime": "",
      "size": 0,
      "updatedAt": "..."
    },
    "isVerified": true,
    "preferences": {}
  }
}
```
