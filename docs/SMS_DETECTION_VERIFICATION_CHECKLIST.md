# SMS Detection Flow Analysis - Current Status

## ✅ Code Analysis Summary

### Frontend (dwar) - SMS Detection & Sync

**File: `useSmsDeliverySync.ts`**
- ✅ Detects SMS from device using `useSMS()` hook
- ✅ Filters by DELIVERY_SMS_KEYWORDS: 'Blitz', 'Xpressbees', 'Shadowfax', 'Savana', 'OTP', etc.
- ✅ Deduplicates using composite key: `{senderPhone}:{first50chars}`
- ✅ Calls `smsService.receiveSms(smsText, senderPhone, messageId)`
- ✅ Syncs every 5 seconds with retry logic
- ✅ Logs using console.log

**Flow:**
```
useSMS() → detectedSms array
    ↓
useSmsDeliverySync() → filters by keywords
    ↓
smsService.receiveSms() → POST /sms/receive
    ↓
Backend processes and saves
```

---

### Backend (Node.js) - SMS Reception & Storage

**File: `smsParser.service.js`**
- ✅ receiveSms endpoint accepts: smsText, senderPhone, messageId
- ✅ Calls processSms() which:
  - Detects company using loaded patterns
  - Extracts data (OTP, rider, reference ID, etc.)
  - Creates SmsLog document
  - **SAVES to DB**: `const savedSmsLog = await smsLog.save();`
  - Updates/creates DeliverySchedule
  - Returns: `{ success, smsLog, scheduleUpdated, scheduleId }`

**Database Models:**
- ✅ SmsLog - Stores raw SMS + parsed metadata
- ✅ DeliverySchedule - Groups SMS by reference ID
- ✅ DeliveryCompanyPattern - 5 companies configured

---

## 🔍 Potential Issues to Check

### 1. **Is useSmsDeliverySync() being called?**
**Status:** ❓ Need to check
**Location:** Main app screen/component
**Check:** Search for `useSmsDeliverySync` usage

**Question:** Where is this hook being used in your app?

### 2. **Is authentication working?**
**Status:** ✅ Looks OK
**Flow:** 
- useApiClient provides axios instance with Bearer token
- POST request includes auth header
- Backend's requireAuth middleware validates

**Check:** Verify token is being sent in header

### 3. **Is resolveHomeId() working?**
**Status:** ✅ Looks OK
**Location:** `src/utils/home.js`
**Purpose:** Gets homeId from authenticated user to save SMS

**Check:** Verify user is properly authenticated

### 4. **Are company patterns loaded?**
**Status:** ✅ YES
**Log message:** `[SeedPatterns] Patterns already exist, skipping seed`
**Companies:** blitz, xpressbees, shadowfax, savana, amazon

---

## 📊 Current Data Flow

```
┌─────────────────────────────────────┐
│  Device (Android/iOS)               │
│  Native SMS received                │
└────────────────┬────────────────────┘
                 │
                 ▼
         ┌───────────────────┐
         │  useSMS() Hook    │
         │  Reads all SMS    │
         └────────┬──────────┘
                  │
                  ▼
         ┌──────────────────────────┐
         │ useSmsDeliverySync()     │
         │ - Filters by keywords    │
         │ - Deduplicates          │
         │ - Calls API service     │
         └────────┬─────────────────┘
                  │
      ┌───────────┴──────────────┐
      │  smsService.receiveSms() │
      │  Parameters:             │
      │  - smsText               │
      │  - senderPhone           │
      │  - messageId             │
      └────────┬──────────────────┘
               │
        ┌──────┴──────────┐
        │  HTTP POST      │
        │ /api/v1/sms/    │
        │ receive         │
        └────────┬────────┘
                 │
        ┌────────▼────────────────┐
        │  Backend Node.js Server │
        │  sms.controller.js      │
        └────────┬────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │  smsParser.service.js         │
        │  processSms():                │
        │  1. Detect company            │
        │  2. Extract data              │
        │  3. Save SmsLog to DB ✅      │
        │  4. Update DeliverySchedule   │
        └────────┬─────────────────────┘
                 │
        ┌────────▼────────────────┐
        │  MongoDB                │
        │  Collections:           │
        │  - sms_logs ✅          │
        │  - delivery_schedules ✅│
        │  - company_patterns ✅  │
        └─────────────────────────┘
```

---

## ✅ What IS Working

1. **Backend API** - Listening on port 5000 ✅
2. **Company Detection** - 5 companies configured ✅
3. **SMS Storage Model** - SmsLog model created ✅
4. **Schedule Grouping** - DeliverySchedule model created ✅
5. **API Endpoints** - All routes defined ✅
6. **Frontend Service** - API client configured ✅
7. **Auto-sync Hook** - useSmsDeliverySync created ✅

---

## ❓ What Needs Verification

### 1. **Integration in App Component**
Verify that `useSmsDeliverySync()` hook is being called in your main app:

```typescript
// In your main app screen/component:
import { useSmsDeliverySync } from './hooks/useSmsDeliverySync';

export function App() {
  // ✅ This should be called
  useSmsDeliverySync();
  
  return (
    // Your app JSX
  );
}
```

### 2. **Check Database Records**
Connect to MongoDB and verify:

```javascript
// Check SmsLog collection
db.sms_logs.find().limit(5)

// Should return documents like:
{
  _id: ObjectId(...),
  homeId: ObjectId(...),
  rawText: "Your SMS text here...",
  deliveryCompany: "blitz",
  status: "out_for_delivery",
  referenceId: "ITX32221219914700100",
  extractedData: { ... },
  createdAt: 2026-04-02T...
}

// Check DeliverySchedule
db.delivery_schedules.find().limit(5)
```

### 3. **Check API Response**
Test endpoint manually:

```bash
curl -X POST http://localhost:5000/api/v1/sms/receive \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smsText": "Your order from ZARA with ID ITX32221219914700100 is Out for Delivery with Blitz",
    "senderPhone": "+919999999999",
    "messageId": "test_123"
  }'

# Expected Response:
{
  "success": true,
  "data": {
    "smsId": "60d87c5f...",
    "company": "blitz",
    "status": "out_for_delivery",
    "scheduleUpdated": true,
    "scheduleId": "60d87c6f...",
    "confidence": 95
  }
}
```

---

## 🚀 Next Steps to Verify

1. **Confirm hook usage** - Add useSmsDeliverySync() to main app component
2. **Check MongoDB** - Verify sms_logs collection has documents
3. **Check console logs** - Look for `[SmsSyncHook]` messages
4. **Test with Postman** - Send test SMS to verify end-to-end flow
5. **Check frontend network tab** - Verify POST requests are being sent

---

## Commands to Check Status

**Check Backend Logs:**
```powershell
# Terminal should show:
MongoDB connected
API listening on port 5000
# And when SMS is received:
[SmsParser] Loaded X company patterns
[SmsSyncHook] Successfully synced N SMS to backend
```

**Check if SMS is being sent:**
```
Browser → DevTools → Network tab → Filter "sms"
Should see POST requests to /api/v1/sms/receive
```

**Check MongoDB:**
```javascript
// MongoDB Compass or mongosh
use your_database_name
db.sms_logs.countDocuments()  // Should be > 0 if SMS saved
db.delivery_schedules.countDocuments()  // Should be > 0 if schedules created
```

---

## Summary

✅ **Code is correctly written** - All pieces in place
❓ **Need to verify integration** - Hook must be called in app
❓ **Need to verify data flow** - Check if SMS actually reaching backend
❓ **Need to verify DB storage** - Check MongoDB for documents

**Most likely issue:** `useSmsDeliverySync()` hook not being called in main app component.

**Quick fix:** Add to your main screen component that's always loaded.
