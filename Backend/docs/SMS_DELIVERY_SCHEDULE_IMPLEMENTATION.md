# SMS Delivery Schedule Feature - Implementation Guide

Complete implementation of the SMS delivery schedule system covering backend and frontend.

## Overview

This feature automatically detects delivery-related SMS messages from the mobile device, parses them, stores delivery schedules in the database, and displays upcoming and completed deliveries in the app.

---

## Backend Implementation

### 1. Database Models

Three new MongoDB models have been created:

#### **SmsLog** (`src/models/SmsLog.js`)
Stores all received SMS messages with parsed data.

```
- rawText: Original SMS text
- deliveryCompany: Detected company (blitz, xpressbees, shadowfax, savana, amazon)
- referenceId: Order/AWB/Tracking number
- status: Current delivery status
- extractedData: Parsed fields (OTP, rider name, phone, etc.)
- confidenceScore: Detection confidence (0-100)
```

#### **DeliverySchedule** (`src/models/DeliverySchedule.js`)
Groups multiple SMS messages for the same delivery into a schedule.

```
- scheduleGroupId: Composite key for grouping SMS (company + refId + customer)
- currentStatus: Latest delivery status
- statusHistory: List of all status updates with timestamps
- smsIds: All SMS messages related to this delivery
- riderInfo: Latest rider details (name, phone)
- otpCode: Verification code
- expectedDeliveryDate: When delivery is expected
```

#### **DeliveryCompanyPattern** (`src/models/DeliveryCompanyPattern.js`)
Configuration for parsing each delivery company's uniqueSMS format.

```
- companyName: blitz, xpressbees, shadowfax, savana, amazon
- companyKeywords: Keywords to detect company
- regexPatterns: Regex patterns for detection
- referenceIdRegex: Extract order/AWB/tracking number
- statusKeywords: Keywords for each delivery status
- fieldPatterns: Regex patterns to extract rider name, OTP, phone, etc.
```

### 2. SMS Parser Service

**File:** `src/services/smsParser.service.js`

Main service that handles SMS detection, parsing, and schedule management.

**Key Methods:**

```javascript
// Detect delivery company from SMS text
detectCompany(smsText) // => { company, confidence, pattern }

// Extract data from SMS based on company patterns
extractData(smsText, company) // => { referenceId, status, extractedData }

// Process SMS and update schedule
processSms(homeId, smsText, senderPhone, messageId) 
  // => { success, smsLog, scheduleUpdated, scheduleId }

// Retrieve upcoming deliveries
getUpcomingDeliveries(homeId, options) 
  // => { deliveries, total }

// Retrieve delivered/completed deliveries
getDeliveryHistory(homeId, options)
  // => { deliveries, total }
```

### 3. API Controllers & Routes

**Controller File:** `src/controllers/sms.controller.js`
**Routes File:** `src/routes/sms.routes.js`

**Endpoints:**

```
POST /api/v1/sms/receive
  - Receive SMS from mobile app
  - Body: { smsText, senderPhone, messageId }
  - Response: { smsId, company, status, scheduleUpdated, scheduleId }

GET /api/v1/sms/deliveries/upcoming
  - Get upcoming deliveries
  - Query: ?skip=0&limit=50
  - Response: { data: [DeliverySchedule], pagination }

GET /api/v1/sms/deliveries/history
  - Get completed deliveries
  - Query: ?skip=0&limit=50
  - Response: { data: [DeliverySchedule], pagination }

GET /api/v1/sms/deliveries/:scheduleId
  - Get single delivery with status history
  - Response: { data: DeliverySchedule }

GET /api/v1/sms/deliveries/:scheduleId/messages
  - Get all SMS for a delivery
  - Query: ?skip=0&limit=50
  - Response: { data: [SmsLog], pagination }

GET /api/v1/sms/deliveries/search?referenceId=XXX&company=blitz
  - Search deliveries
  - Response: { data: [DeliverySchedule], pagination }

PATCH /api/v1/sms/deliveries/:scheduleId/mark-delivered
  - Manually mark delivery as completed
  - Response: { data: DeliverySchedule }

GET /api/v1/sms/stats
  - Get SMS and delivery statistics
  - Response: { data: { totalSms, statistics, byCompany } }
```

### 4. Company Pattern Configuration

**File:** `src/utils/seedPatterns.js`

Pre-configured patterns for 5 delivery companies. Automatically seeded on server startup.

**Supported Companies:**
- **Blitz** - E-commerce delivery (Zara, etc.)
- **Xpressbees** - Multi-brand delivery with AMJ numbers
- **Shadowfax** - Majorly Myntra, with SF tracking IDs
- **Savana** - Premium delivery service
- **Amazon** - Amazon logistics

Each pattern includes:
- Keywords to detect company
- Regex patterns for reference ID extraction
- Status keywords mapping
- Field extraction patterns (OTP, rider name, phone, etc.)

### 5. Integration in App Startup

**File:** `server.js`

Pattern seeding is automatically triggered on server start:

```javascript
async function bootstrap() {
  await connectDB(env.MONGO_URI);
  
  // Seed company patterns for SMS parsing
  try {
    await seedCompanyPatterns();
  } catch (error) {
    console.error('Error seeding patterns:', error.message);
  }

  app.listen(env.PORT, ...);
}
```

---

## Frontend Implementation (dwar app)

### 1. API Service

**File:** `src/services/api/smsDeliveryService.ts`

TypeScript service for API communication.

```typescript
class SmsDeliveryService {
  receiveSms(smsText, senderPhone?, messageId?)
  getUpcomingDeliveries(skip?, limit?)
  getDeliveryHistory(skip?, limit?)
  getDeliveryDetails(scheduleId)
  getScheduleMessages(scheduleId, skip?, limit?)
  searchDeliveries(referenceId?, company?, skip?, limit?)
  getStats()
  markDelivered(scheduleId)
}
```

### 2. Redux Store Integration

**Slice File:** `src/store/slices/deliverySlice.ts`

Manages delivery schedule state in Redux:

```typescript
// State structure
{
  upcoming: {
    data: DeliverySchedule[],
    loading: boolean,
    error: string | null,
    total: number,
    skip: number,
    limit: number
  },
  history: { ... same structure ... },
  selected: DeliverySchedule | null,
  stats: { totalSms, upcoming, delivered, failed, byCompany },
  lastRefresh: number | null
}
```

Actions available:
- `upcomingLoadingStarted`, `upcomingLoaded`, `upcomingLoadingFailed`
- `historyLoadingStarted`, `historyLoaded`, `historyLoadingFailed`
- `deliverySelected`, `deliveryDeselected`
- `statsLoaded`
- `resetDeliveries`

### 3. Custom Hooks

#### **useApiClient**
Provides authenticated axios instance with auth headers.

```typescript
const apiClient = useApiClient();
```

#### **useDeliverySchedules**
Main hook for managing delivery data.

```typescript
const { 
  upcoming,           // { data, loading, error, total }
  loadUpcoming,       // () => Promise
  loadHistory,
  stats,              // Delivery statistics
  loadStats,
  refresh,            // Refresh all data
  lastRefresh
} = useDeliverySchedules();
```

Auto-refreshes every 30 seconds if there are upcoming deliveries.

#### **useDeliveryDetails**
Load details for a single delivery.

```typescript
const {
  delivery,    // DeliverySchedule
  loading,
  error,
  refresh
} = useDeliveryDetails(scheduleId);
```

#### **useSearchDeliveries**
Search deliveries by reference ID or company.

```typescript
const {
  results,     // DeliverySchedule[]
  loading,
  error,
  search       // (referenceId?, company?) => Promise
} = useSearchDeliveries();
```

#### **useSmsDeliverySync**
Automatically sends detected delivery SMS to backend.

```typescript
const {
  syncedCount,    // Number of SMS synced
  manualSync      // () => Promise (manual sync trigger)
} = useSmsDeliverySync();
```

Features:
- Auto-detects delivery-related SMS keywords
- Deduplicates SMS using composite key
- Syncs every 5 seconds
- Non-blocking - doesn't interfere with UI

### 4. UI Screens

#### **DeliveryUpcoming** (`src/features/delivery/screens/DeliveryUpcoming.tsx`)

Displays list of upcoming deliveries.

**Features:**
- Pull-to-refresh
- Pagination with infinite scroll
- Status badges with color coding
- Company badge
- Quick info: rider, OTP, reference, expected date, seller
- SMS message count
- Time window display

**Navigation:**
- Tap delivery card to view details

#### **DeliveryUpcomingDetails** (`src/features/delivery/screens/DeliveryUpcomingDetails.tsx`)

Detailed view of single delivery with full SMS history.

**Sections:**
1. **Status & Company** - Current status with color badge
2. **Reference Details** - Reference ID, AWB, copy to clipboard
3. **Rider Info** - Name, phone number (copyable)
4. **OTP/Verification Code** - Large, monospace display (copyable)
5. **Delivery Details** - Customer name, seller, address
6. **Timeline** - Expected delivery date and time window
7. **SMS History** - Chronological list of all SMS with statuses

**Interactions:**
- Copy to clipboard on tap (OTP, phone, reference ID)
- Toast notifications on copy
- SMS messages expandable

---

## Data Flow Diagram

```
┌─────────────────────────────────────┐
│  Mobile Device (Reading SMS)        │
│  useSMS hook tracks SMS             │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  useSmsDeliverySync (Hook)          │
│  - Detects delivery-related SMS     │
│  - Deduplicates (composite key)     │
│  - Sends to backend every 5 sec      │
└────────────────┬────────────────────┘
                 │
                 ▼ POST /api/v1/sms/receive
         ┌───────────────────┐
         │     Backend       │
         │   (Node.js)       │
         └───────────────────┘
                 │
         ┌───────┴─────────┐
         ▼                 ▼
  ┌──────────────┐  ┌──────────────┐
  │ detectCompany│  │ extractData  │
  │              │  │ (patterns)   │
  │ smsParser    │  │              │
  │ .service.js  │  │              │
  └──────┬───────┘  └──────┬───────┘
         │                 │
         └────────┬────────┘
                  ▼
         ┌──────────────────┐
         │  updateDelivery  │
         │  Schedule        │
         └─────────┬────────┘
                   ▼
        ┌────────────────────┐
        │     MongoDB        │
        │  - sms_logs        │
        │  - delivery        │
        │    _schedules      │
        │  - company_        │
        │    patterns        │
        └────────┬───────────┘
                 │
         ┌───────┴──────────┐
         ▼                  ▼
┌ ────────────────┐  ┌─────────────────┐
│ Redux Store     │  │ GET endpoints   │
│ - upcoming      │  │ - /deliveries/  │
│ - history       │  │   upcoming      │
│ - stats         │  │ - /deliveries/  │
└────────┬────────┘  │   history       │
         │           │ - /stats        │
         ▼           │ - /deliveries/:id
    ┌─────────────┐  │ - /messages     │
    │ Components  │  └────────┬────────┘
    │- Upcoming   │           │
    │- Details    │           │
    │- History    │    Frontend App
    └─────────────┘   (React Native)
```

---

## Usage Example

### Backend - Receiving SMS

```javascript
// POST /api/v1/sms/receive
{
  "smsText": "Hi SHEENA YADAV. Your order from ZARA with ID ITX32221219914700100... is Out for Delivery with Blitz and will reach you before 9 PM today.",
  "senderPhone": "+919999999999",
  "messageId": "unique-sms-id"
}

// Response
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

### Frontend - Using Hooks

```typescript
function DeliveryScreen() {
  // Auto-sync SMS to backend
  useSmsDeliverySync();
  
  // Get upcoming deliveries
  const { upcoming, loadUpcoming, refresh } = useDeliverySchedules();
  
  return (
    <FlatList
      data={upcoming.data}
      renderItem={({ item }) => (
        <DeliveryCard delivery={item} />
      )}
      onRefresh={refresh}
    />
  );
}
```

---

## Configuration

### Adding New Delivery Company

1. **Add to DeliveryCompanyPattern model:**

```javascript
const pattern = {
  companyName: 'mynewcompany',
  companyKeywords: ['MyCompany', 'My Company'],
  regexPatterns: ['pattern1', 'pattern2'],
  referenceIdRegex: 'ID\\s+([A-Z0-9]+)',
  referenceType: 'order_id',
  statusKeywords: {
    initiated: ['Your order', 'has been confirmed'],
    arriving_soon: [],
    out_for_delivery: ['is out for delivery'],
    upon_arrival: ['waiting at your address'],
    delivered: ['has been delivered'],
    failed: ['delivery failed'],
  },
  fieldPatterns: {
    riderName: { regex: 'Rider:\\s+([A-Za-z\\s]+)', group: 1 },
    riderPhone: { regex: '\\(([0-9]{10})\\)', group: 1 },
    // ... other fields
  },
};

await DeliveryCompanyPattern.create(pattern);
```

2. **Patterns are automatically loaded on startup via `seedPatterns.js`**

---

## Testing

### Manual SMS Testing

```bash
# Use Postman or curl to send test SMS
curl -X POST http://localhost:3000/api/v1/sms/receive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "smsText": "XB Rider (8873141466) is waiting at your address to deliver your order from AJIO AWB: 1367062680046, OTP - 653070",
    "senderPhone": "+919999999999",
    "messageId": "test_123"
  }'
```

### Check Detected Deliveries

```bash
# Get upcoming deliveries
curl http://localhost:3000/api/v1/sms/deliveries/upcoming \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get statistics
curl http://localhost:3000/api/v1/sms/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### SMS Not Being Detected
1. Verify SMS has keywords from `DELIVERY_SMS_KEYWORDS` in `useSmsDeliverySync.ts`
2. Check browser console for error logs
3. Check MongoDB for SMS logs: `SmsLog.find().limit(5)`

### Wrong Company Detected
1. Check `confidenceScore` in SmsLog - if low, pattern might not match well
2. Review `matchedPattern` field to see which pattern matched
3. Update `companyKeywords` or `regexPatterns` in DeliveryCompanyPattern

### SMS Not Syncing to Backend
1. Verify authentication token is valid
2. Check network connection
3. Review `useSmsDeliverySync` hook - check for deduplication
4. Look at backend logs for API errors

### Status Not Updating
1. Verify `statusKeywords` in company pattern
2. Check if multiple SMS for same delivery are being grouped correctly
3. Verify `scheduleGroupId` is consistent across SMS

---

## Performance Considerations

1. **SMS Sync Rate:** 5-second intervals to prevent server overload
2. **Auto-refresh:** 30 seconds only when deliveries exist
3. **Pagination:** 50 items per page by default
4. **Pattern Caching:** Patterns cached for 5 minutes
5. **Deduplication:** Uses composite key to prevent duplicate syncs

---

## Future Enhancements

1. **Notifications:** Alert when delivery status changes
2. **Rider Tracking:** Real-time location if available
3. **Analytics:** Delivery time trends, company reliability
4. **Custom Rules:** User-defined delivery instructions
5. **Failure Handling:** Retry delivery logic for failed attempts
6. **Multi-language:** Support for SMS in multiple languages
7. **Webhook Notifications:** Third-party service integrations

---

## Support

For issues or questions:
1. Check SMS logs in MongoDB
2. Review API response codes
3. Examine browser/server console logs
4. Verify authentication tokens
5. Check network connectivity
