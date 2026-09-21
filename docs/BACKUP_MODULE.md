# Backup Person Module

Included endpoints:
- GET /api/v1/backup/overview
- POST /api/v1/backup/assign
- GET /api/v1/backup/assignments
- DELETE /api/v1/backup/assignments/:id

Compatibility aliases:
- /backup/*
- /api/v1/deliveries/backup/*
- /deliveries/backup/*

Screen mapping:
- Existing OTP shown from away-mode temporary code or linked delivery OTP
- Guest name assignment with default 24 hour validity
- Assigned backup persons list with active / expired / revoked / used state
- UI-ready labels: statusLabel, assignedDateLabel, timeLeftLabel

Notes:
- Same-home access control is enforced
- Duplicate active guest assignment in same context is prevented
- Expired assignments are lazily synchronized on read/write
- Revocation keeps audit history
