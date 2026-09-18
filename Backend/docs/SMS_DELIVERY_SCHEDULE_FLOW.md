# SMS Delivery Schedule System - Implementation Flow

## Overview
System to parse delivery SMS from multiple courier companies, store them in DB, detect delivery status, and maintain a live delivery schedule that updates as new messages arrive.

---

## Phase 1: SMS Parsing & Detection

### 1.1 Delivery Company Detection
**Input:** Raw SMS text  
**Process:**
- Pattern matching on delivery company keywords
- Extract company name as primary identifier

**Supported Companies & Patterns:**

| Company | Primary Keywords | Reference ID Pattern | Status Keywords |
|---------|------------------|----------------------|-----------------|
| **Blitz** | "Blitz" | Order ID in text | "Out for Delivery", "arrived via Blitz" |
| **Xpressbees (XB)** | "Xpressbees", "XB Rider" | AWB number (13-14 digits) | "waiting at", "OTP" |
| **Shadowfax** | "Shadowfax" | SF + tracking number (SF format) | "out for delivery", "successfully delivered", "OTP" |
| **Savana** | "Savana" | Reference ID (S########) | "Arriving Soon", "On The Way" |
| **Amazon** | "Amazon", "OTP-" pattern | Order ID (implicit) | "ACCEPT", "delivery" |

### 1.2 Information Extraction
**Extract from each SMS:**
```
Core Fields:
- delivery_company: string (Blitz | Xpressbees | Shadowfax | Savana | Amazon)
- reference_id: string (tracking/AWB/order ID)
- status: enum (Initiated, ArrivingSoon, OutForDelivery, UponArrival, Delivered, Failed)
- otp_code: string | null
- timestamp: datetime (from SMS timestamp)

Company-Specific Fields:
- rider_name: string | null
- rider_phone: string | null
- customer_name: string | null
- awb_number: string | null
- expected_delivery_date: date | null
- delivery_time_window: string | null (e.g., "before 9 PM", "10 AM - 2 PM")
- product_info: string | null (seller/brand name)
- receiver_address: string | null
- message_type: enum (OrderConfirmation, StatusUpdate, OTPNotification, DeliveryConfirmation)
```

---

## Phase 2: Database Schema Design

### 2.1 SMS Storage Collection

```javascript
Collection: sms_logs
{
  _id: ObjectId,
  
  // Raw Data
  raw_text: string,
  sender_phone: string,
  received_timestamp: ISODate,
  message_id: string, // unique per SMS
  
  // Detection & Parsing
  delivery_company: string,
  detected_at: ISODate,
  confidence_score: number (0-100), // how confident is the detection
  
  // Extraction Results
  reference_id: string, // primary grouping key
  reference_type: enum (AWB, TrackingID, OrderID),
  status: enum,
  
  // Extracted Data
  extracted_data: {
    rider_name: string,
    rider_phone: string,
    customer_name: string,
    awb_number: string,
    otp_code: string,
    expected_delivery_date: string,
    delivery_time_window: string,
    product_info: string,
    receiver_address: string,
    seller_name: string,
    message_type: string
  },
  
  // Metadata
  parsed: boolean,
  parsing_error: string | null,
  matched_pattern: string, // which regex/pattern matched
  
  // Tracking
  created_at: ISODate,
  updated_at: ISODate
}
```

### 2.2 Delivery Schedule Collection

```javascript
Collection: delivery_schedules
{
  _id: ObjectId,
  
  // Grouping (same delivery = same group_id)
  schedule_group_id: string, // hash(customer_name + reference_id + company)
  reference_id: string, // from first SMS
  delivery_company: string,
  
  // Status Evolution
  current_status: enum,
  status_history: [
    {
      status: string,
      updated_at: ISODate,
      sms_id: ObjectId, // which SMS triggered this update
      message_summary: string
    }
  ],
  
  // Customer & Delivery Info
  customer_name: string,
  receiver_address: string,
  phone_number: string,
  
  // Delivery Timeline
  expected_delivery_date: date,
  delivery_time_window: string,
  scheduled_at: ISODate, // when this schedule was created
  
  // Latest Info (from most recent SMS)
  latest_sms_id: ObjectId,
  rider_name: string,
  rider_phone: string,
  otp_code: string,
  awb_number: string,
  
  // Product Info
  seller_name: string,
  product_summary: string,
  
  // Delivery Details
  sms_count: number, // how many SMS for this delivery
  sms_ids: [ObjectId], // all SMS related to this delivery
  
  // Metadata
  created_at: ISODate,
  updated_at: ISODate,
  completed_at: ISODate | null,
  marked_delivered: boolean
}
```

### 2.3 Company Pattern Rules Collection (Config)

```javascript
Collection: delivery_company_patterns
{
  _id: ObjectId,
  company_name: string,
  
  // Detection
  company_keywords: [string],
  regex_patterns: [string],
  
  // Reference ID extraction
  reference_id_regex: string,
  reference_type: string,
  
  // Status mapping
  status_keywords: {
    initiated: [string],
    arriving_soon: [string],
    out_for_delivery: [string],
    upon_arrival: [string],
    delivered: [string],
    failed: [string]
  },
  
  // Field extraction patterns
  field_patterns: {
    rider_name: { regex: string, group: number },
    rider_phone: { regex: string, group: number },
    otp_code: { regex: string, group: number },
    awb_number: { regex: string, group: number },
    delivery_date: { regex: string, group: number },
    customer_name: { regex: string, group: number }
  },
  
  active: boolean,
  created_at: ISODate,
  updated_at: ISODate
}
```

---

## Phase 3: Processing Pipeline

### 3.1 SMS Input Workflow

```
┌─────────────────────┐
│   Raw SMS Text      │
│  (from WhatsApp or  │
│   other channel)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 1. COMPANY DETECTION LAYER          │
│ - Load company patterns from config  │
│ - Try keyword matching first        │
│ - Fallback to regex patterns        │
│ - Detection confidence scoring      │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 2. INFORMATION EXTRACTION LAYER     │
│ - Parse company-specific patterns   │
│ - Extract reference ID              │
│ - Extract status                    │
│ - Extract optional fields           │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 3. VALIDATION LAYER                 │
│ - Validate reference ID format      │
│ - Validate phone numbers if present │
│ - Check against existing records    │
│ - Detect duplicates                 │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 4. SMS STORAGE                      │
│ - Save raw SMS to sms_logs          │
│ - Mark as parsed = true             │
│ - Record extraction results         │
│ - Generate message ID               │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│ 5. DELIVERY SCHEDULE UPDATE LAYER           │
│ a) Check if schedule_group_id exists        │
│    - Hash: company + reference_id +         │
│      customer_name                          │
│ b) If NO existing schedule:                 │
│    - CREATE new delivery_schedule record    │
│    - Initialize with SMS data               │
│ c) If EXISTS:                               │
│    - UPSERT: Update status & latest info    │
│    - Add SMS ID to sms_ids array            │
│    - Update status_history                  │
│    - Increment sms_count                    │
│    - Update updated_at timestamp            │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 6. NOTIFICATION TRIGGER (Optional)   │
│ - Alert on status updates            │
│ - Send OTP to user if new           │
│ - Update UI in real-time             │
└──────────────────────────────────────┘
```

### 3.2 Schedule Grouping Logic

**Challenge:** Multiple SMS for same delivery, need to group them

**Solution: Composite Key (schedule_group_id)**

```javascript
// Pseudocode
function generateScheduleGroupId(sms) {
  const company = sms.delivery_company;
  const refId = sms.reference_id;
  const customerName = sms.extracted_data.customer_name || "unknown";
  
  // Create composite key
  const key = `${company}|${refId}|${customerName}`;
  const groupId = hash(key); // MD5 or SHA256
  
  return groupId;
}
```

**Matching Strategy:**
1. **Primary:** Same reference_id + same company = same delivery
2. **Secondary:** If reference_id unclear, use: company + order_date + customer_name
3. **Time window:** Only match if SMS within 7-day window (same delivery batch)

---

## Phase 4: Status Update Rules

### 4.1 Status Transition Flow

```
INITIATED (First SMS received)
    ↓
ARRIVING_SOON (Expected delivery date given)
    ↓
OUT_FOR_DELIVERY (Agent assigned, out for delivery)
    ↓
UPON_ARRIVAL (Rider at address, waiting for OTP)
    ↓
DELIVERED (Confirmation received)
```

### 4.2 Update Rules by Company

**Blitz:**
- Msg 1: "Out for Delivery" → Status = OUT_FOR_DELIVERY
- Msg 2: "order has arrived" → Status = UPON_ARRIVAL

**Xpressbees:**
- Msg 1: "delivery agent" intro → Status = OUT_FOR_DELIVERY
- Msg 2: "waiting at address" → Status = UPON_ARRIVAL
- Later: Delivery confirmation → Status = DELIVERED

**Shadowfax:**
- Msg 1: "Please provide OTP" → Status = OUT_FOR_DELIVERY
- Msg 2: "successfully delivered" → Status = DELIVERED

**Savana:**
- Msg 1: "Arriving Soon" → Status = ARRIVING_SOON, set expected delivery date
- Msg 2: "On The Way" → Status = OUT_FOR_DELIVERY
- Msg 3: (no confirmation seen) → Status = assumed DELIVERED after expected_date passes

**Amazon:**
- Single OTP msg → Status = UPON_ARRIVAL

---

## Phase 5: API Endpoints

### 5.1 SMS Webhook Endpoint
```
POST /api/sms/receive
Body: {
  sender_phone: string,
  message_text: string,
  timestamp: string,
  source: string // "whatsapp" | "sms" | etc
}

Response: {
  success: boolean,
  message_id: string,
  detected_company: string | null,
  schedule_id: string | null,
  status_updated: boolean
}
```

### 5.2 Delivery Schedule Endpoints
```
GET /api/deliveries/upcoming
Response: [delivery_schedule]

GET /api/deliveries/:scheduleId
Response: delivery_schedule with full history

GET /api/deliveries/search?reference_id=:id&company=:company
Response: [delivery_schedule]

GET /api/deliveries/:scheduleId/messages
Response: [sms_log] (all SMS for this delivery)
```

---

## Phase 6: Implementation Roadmap

### Sprint 1: Core SMS Parsing
- [ ] Create Company Pattern Matcher utility
- [ ] Implement Company Detection logic
- [ ] Create Information Extractor for each company
- [ ] Build regex patterns for all companies
- [ ] Unit tests for SMS parsing

### Sprint 2: Database Layer
- [ ] Create MongoDB schemas (sms_logs, delivery_schedules, patterns)
- [ ] Create DAO/Service layer for DB operations
- [ ] Create schedule grouping service
- [ ] Implement upsert logic for schedule updates

### Sprint 3: API & Workflow
- [ ] Build SMS webhook endpoint
- [ ] Implement complete processing pipeline
- [ ] Create schedule retrieval APIs
- [ ] Add error handling & logging

### Sprint 4: Frontend & Polish
- [ ] Display upcoming deliveries
- [ ] Live status updates
- [ ] SMS history view
- [ ] Company-specific UI elements

---

## Key Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Different reference ID formats** | Store reference_type (AWB/TrackingID/OrderID) + use company-specific extraction patterns |
| **Multiple SMS same delivery** | Composite schedule_group_id using company + ref_id + customer name |
| **Order confirmation vs delivery SMS** | Message type classification + status keywords validation |
| **Extracting customer name** | Pattern-based extraction, fallback to "Unknown" |
| **Handling partial/incomplete SMS** | confidence_score in sms_logs, allow schedule with minimal data |
| **Time zone issues** | Store extract timestamp from SMS + received_timestamp separately |
| **Platform-specific sellers vs delivery** | Differentiate: seller_name vs delivery_company |
| **Duplicate SMS detection** | Check sender_phone + message_text hash within 2-minute window |

---

## Data Flow Example

**SMS Received:** "XB Rider (8873141466) is waiting at your address to deliver your order from AJIO AWB: 1367062680046, OTP - 653070. XpressBees"

**Process:**
1. **Detection:** Keywords "XB Rider", "Xpressbees" → Company = Xpressbees
2. **Extraction:**
   - reference_id = "1367062680046"
   - reference_type = "AWB"
   - status = "UPON_ARRIVAL"
   - rider_phone = "8873141466"
   - otp_code = "653070"
   - seller_name = "AJIO"
3. **Schedule Grouping:**
   - schedule_group_id = hash("Xpressbees|1367062680046|Devika dawar")
4. **Database Update:**
   - If schedule exists with this group_id → update status & add to sms_ids
   - If new → create schedule with initial data
5. **Status History:**
   - status_history.push({status: "UPON_ARRIVAL", timestamp, sms_id})

---

## Next Steps

1. **Review this flow** - Confirm understanding with team
2. **Refine patterns** - May need to add more capturing groups as new companies arise
3. **Build Company Pattern Config** - Create extensible pattern matching system
4. **Develop SMS Parser Service** - Core extraction logic
5. **Implement Database Layer** - Schema creation & DAO classes
6. **Build Queue System** - If high SMS volume, implement message queue (Redis/RabbitMQ)
7. **Add Monitoring** - Track detection accuracy, extraction success rate
