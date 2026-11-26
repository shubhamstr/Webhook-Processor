# Webhook Processor - API Testing with cURL

A comprehensive guide containing copy-pasteable **cURL** commands to test all API endpoints of the Webhook Processor server.

---

## Base URL & Configuration

- **Default Base URL:** `http://localhost:3001`
- **Content-Type Header:** `Content-Type: application/json`
- **Output formatting flag:** `-i` includes HTTP response headers.

> **Tip for Windows users:**
> - In **Git Bash** or **WSL**, standard bash cURL syntax works directly as shown.
> - In **PowerShell**, use `curl.exe` to call the native binary (since `curl` is an alias for `Invoke-WebRequest` in Windows PowerShell 5.1).
> - In **Windows CMD**, avoid unescaped multiline backslashes (`\`); single-line format or caret (`^`) continuation is supported. One-line alternatives are also provided where helpful.

---

## API Endpoints Quick Reference

| Method | Endpoint | Description | Expected Status |
|--------|----------|-------------|-----------------|
| `GET` | `/` | Root Hello / Ping | `200 OK` |
| `GET` | `/health` | System & Database Health Check | `200 OK` / `503 Service Unavailable` |
| `GET` | `/stats` | Aggregated Dashboard Statistics | `200 OK` |
| `POST` | `/webhooks` | Ingest Webhook Event (Async queue) | `202 Accepted` / `400 Bad Request` |
| `GET` | `/events` | List Events (with Filtering, Pagination & Sorting) | `200 OK` |
| `GET` | `/events/:id` | Get Single Event by `eventId` or UUID | `200 OK` / `404 Not Found` |
| `GET` | `/events/:id/attempts` | Get Processing Attempt History for Event | `200 OK` / `404 Not Found` |
| `POST` | `/events/:id/retry` | Manually Retry a Failed Event | `200 OK` / `400 Bad Request` / `404 Not Found` |

---

## 1. System & Health Endpoints

### 1.1 Root Hello / Ping (`GET /`)
Verify the API server is up and responsive.

```bash
curl -i -X GET http://localhost:3001/
```

**Expected Response (200 OK):**
```text
Hello World!
```

---

### 1.2 Health Check (`GET /health`)
Performs a deep check on application uptime, system status, and active PostgreSQL database connectivity.

```bash
curl -i -X GET http://localhost:3001/health
```

**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-11-26T22:45:00.000Z",
  "uptime": 142.58,
  "database": {
    "connected": true,
    "responseTimeMs": 4
  }
}
```

*Note: Returns `503 Service Unavailable` with `status: "error"` if the database is disconnected.*

---

### 1.3 Dashboard Aggregated Statistics (`GET /stats`)
Returns realtime aggregate counts across all webhook event lifecycle statuses.

```bash
curl -i -X GET http://localhost:3001/stats
```

**Expected Response (200 OK):**
```json
{
  "total": 45,
  "pending": 2,
  "processing": 1,
  "completed": 40,
  "failed": 2,
  "permanentlyFailed": 2,
  "completelyFailed": 2
}
```

---

## 2. Webhook Ingestion API (`POST /webhooks`)

The `/webhooks` endpoint accepts incoming payloads, persists them with `status: pending`, enforces idempotency, and immediately returns `202 Accepted`.

### 2.1 Standard Order Created Event
Ingest a standard `order.created` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_order_1001",
    "type": "order.created",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42",
      "amount": 199.99,
      "currency": "USD"
    }
  }'
```

**Expected Response (202 Accepted):**
```json
{
  "status": "accepted",
  "eventId": "evt_order_1001",
  "receivedAt": "2026-11-26T22:45:00.000Z"
}
```

---

### 2.2 Order Updated Event
Ingest an `order.updated` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_order_update_1001",
    "type": "order.updated",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42",
      "deliveryStatus": "in_transit",
      "notes": "Package dispatched from central warehouse"
    }
  }'
```

---

### 2.3 Order Cancelled Event
Ingest an `order.cancelled` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_order_cancel_1002",
    "type": "order.cancelled",
    "data": {
      "orderId": "ORD-1002",
      "customerId": "CUS-88",
      "notes": "Customer requested cancellation before shipment"
    }
  }'
```

---

### 2.4 Payment Completed Event
Ingest a `payment.completed` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_pay_completed_2001",
    "type": "payment.completed",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42",
      "amount": 199.99,
      "currency": "USD",
      "metadata": {
        "gateway": "stripe",
        "chargeId": "ch_3N123456789"
      }
    }
  }'
```

---

### 2.5 Payment Failed Event
Ingest a `payment.failed` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_pay_failed_2002",
    "type": "payment.failed",
    "data": {
      "orderId": "ORD-1003",
      "customerId": "CUS-99",
      "amount": 49.50,
      "currency": "USD",
      "notes": "Card declined: insufficient funds"
    }
  }'
```

---

### 2.6 Refund Processed Event
Ingest a `refund.processed` event.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_refund_3001",
    "type": "refund.processed",
    "data": {
      "orderId": "ORD-1002",
      "customerId": "CUS-88",
      "amount": 75.00,
      "currency": "USD",
      "notes": "Partial refund processed"
    }
  }'
```

---

### 2.7 Full Payload with Extended Fields & Metadata
Ingest a rich payload testing all optional schema fields (`itemsCount`, `customerEmail`, `deliveryStatus`, `metadata`, etc.).

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_rich_4001",
    "type": "order.created",
    "data": {
      "orderId": "ORD-9999",
      "customerId": "CUS-500",
      "amount": 849.00,
      "currency": "USD",
      "itemsCount": 3,
      "customerEmail": "alex.doe@example.com",
      "deliveryStatus": "processing",
      "notes": "Priority express delivery requested",
      "metadata": {
        "channel": "mobile_app",
        "ipAddress": "192.168.1.100",
        "tags": ["vip", "black_friday"]
      }
    }
  }'
```

---

### 2.8 Worker Simulation: Transient Failure & Retry (`simulate: "fail_then_succeed:2"`)
Fails for the first 2 worker processing attempts, triggers exponential backoff retries, and succeeds on attempt 3.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_sim_retry_5001",
    "type": "order.created",
    "data": {
      "orderId": "ORD-RETRY-01",
      "customerId": "CUS-42",
      "simulate": "fail_then_succeed:2"
    }
  }'
```

---

### 2.9 Worker Simulation: Permanent Failure (`simulate: "fail_permanently"`)
Fails continuously until exceeding `max_attempts` (default 5 attempts), marking the event status as `permanently failed` or `failed`.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_sim_fail_5002",
    "type": "order.created",
    "data": {
      "orderId": "ORD-FAIL-01",
      "customerId": "CUS-42",
      "simulate": "fail_permanently"
    }
  }'
```

---

### 2.10 Worker Simulation: Worker Crash & Lease Recovery (`simulate: "crash"`)
Simulates an abrupt unhandled worker crash during execution. The leased event will remain in `processing` until its lease expires (`lease_expires_at < NOW()`), after which another worker recovers and re-processes it.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_sim_crash_5003",
    "type": "order.created",
    "data": {
      "orderId": "ORD-CRASH-01",
      "customerId": "CUS-42",
      "simulate": "crash"
    }
  }'
```

---

### 2.11 Idempotency Test: Exact Duplicate Delivery
Send the identical `eventId` with the identical payload a second time. The server safely recognizes the duplicate and returns `202 Accepted` without creating duplicate records.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_order_1001",
    "type": "order.created",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42"
    }
  }'
```

**Expected Response (202 Accepted):**
```json
{
  "status": "accepted",
  "eventId": "evt_order_1001",
  "receivedAt": "2026-11-26T22:45:00.000Z",
  "message": "Event already processed or queued (idempotent)"
}
```

---

### 2.12 Deduplication Conflict Test: Same `eventId` with Different Payload
Re-sending an existing `eventId` with different or altered payload fields. The service preserves the initial payload and ignores subsequent changes.

```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_order_1001",
    "type": "order.updated",
    "data": {
      "orderId": "ORD-CONFLICT",
      "customerId": "CUS-ALTERED"
    }
  }'
```

**Expected Response (202 Accepted):**
```json
{
  "status": "accepted",
  "eventId": "evt_order_1001",
  "receivedAt": "2026-11-26T22:45:00.000Z",
  "message": "Event already processed or queued (idempotent)"
}
```

---

### 2.13 Schema Validation Errors (400 Bad Request)

#### A. Missing `eventId`
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order.created",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42"
    }
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "message": [
    "eventId should not be empty",
    "eventId must be a string"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

#### B. Missing `type`
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_missing_type",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42"
    }
  }'
```

#### C. Missing `data.orderId`
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_missing_order_id",
    "type": "order.created",
    "data": {
      "customerId": "CUS-42"
    }
  }'
```

#### D. Missing `data.customerId`
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_missing_customer_id",
    "type": "order.created",
    "data": {
      "orderId": "ORD-1001"
    }
  }'
```

#### E. Malformed JSON Body
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{"invalid_json": }'
```

---

## 3. Events Query API (`GET /events`)

Retrieve ingested webhook events with filtering, keyword search, pagination, and sorting.

### Supported Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based, min: 1) |
| `limit` | integer | `10` | Records per page (min: 1, max: 100) |
| `status` | string | - | Filter by status (`pending`, `processing`, `completed`, `failed`) |
| `type` / `eventType` | string | - | Filter by event type (`order.created`, `order.updated`, etc.) |
| `orderId` | string | - | Filter by order ID in payload or processed orders |
| `customerId` | string | - | Filter by customer ID in event payload |
| `search` | string | - | Text search matching `eventId`, `eventType`, or `lastError` |
| `startDate` / `from` | ISO date | - | Filter events received after this timestamp |
| `endDate` / `to` | ISO date | - | Filter events received before this timestamp |
| `sortBy` | string | `receivedAt` | Field: `receivedAt`, `updatedAt`, `status`, `eventType`, `totalAttempts`, `eventId` |
| `sortOrder` | string | `desc` | Direction: `asc` or `desc` |

---

### 3.1 Default Pagination (Page 1, 10 records)
```bash
curl -i -X GET http://localhost:3001/events
```

**Expected Response (200 OK):**
```json
{
  "data": [
    {
      "id": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
      "eventId": "evt_order_1001",
      "eventType": "order.created",
      "status": "completed",
      "payload": {
        "orderId": "ORD-1001",
        "customerId": "CUS-42"
      },
      "totalAttempts": 1,
      "receivedAt": "2026-11-26T22:45:00.000Z",
      "updatedAt": "2026-11-26T22:45:01.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### 3.2 Custom Pagination (`page` and `limit`)
```bash
curl -i -X GET "http://localhost:3001/events?page=2&limit=5"
```

---

### 3.3 Filter by Status

#### A. Pending Events:
```bash
curl -i -X GET "http://localhost:3001/events?status=pending"
```

#### B. Processing Events:
```bash
curl -i -X GET "http://localhost:3001/events?status=processing"
```

#### C. Completed Events:
```bash
curl -i -X GET "http://localhost:3001/events?status=completed"
```

#### D. Failed Events:
```bash
curl -i -X GET "http://localhost:3001/events?status=failed"
```

---

### 3.4 Filter by Event Type (`type` or `eventType`)
```bash
# Using 'type' parameter
curl -i -X GET "http://localhost:3001/events?type=order.created"

# Using 'eventType' parameter
curl -i -X GET "http://localhost:3001/events?eventType=payment.completed"
```

---

### 3.5 Filter by Order ID (`orderId`)
```bash
curl -i -X GET "http://localhost:3001/events?orderId=ORD-1001"
```

---

### 3.6 Filter by Customer ID (`customerId`)
```bash
curl -i -X GET "http://localhost:3001/events?customerId=CUS-42"
```

---

### 3.7 Keyword Text Search (`search`)
Searches across `eventId`, `eventType`, and `lastError`.

```bash
# Search by event ID substring or order ID
curl -i -X GET "http://localhost:3001/events?search=ORD-1001"

# Search by error keyword
curl -i -X GET "http://localhost:3001/events?search=timeout"
```

---

### 3.8 Filter by Date Range (`startDate` / `endDate` or `from` / `to`)
```bash
# Using startDate and endDate
curl -i -X GET "http://localhost:3001/events?startDate=2026-11-01T00:00:00.000Z&endDate=2026-11-30T23:59:59.999Z"

# Using from and to aliases
curl -i -X GET "http://localhost:3001/events?from=2026-11-26T00:00:00.000Z&to=2026-11-26T23:59:59.999Z"
```

---

### 3.9 Sorting Events (`sortBy` and `sortOrder`)

#### A. Sort by `receivedAt` (Ascending / Chronological order):
```bash
curl -i -X GET "http://localhost:3001/events?sortBy=receivedAt&sortOrder=asc"
```

#### B. Sort by `totalAttempts` (Descending - Most retried events first):
```bash
curl -i -X GET "http://localhost:3001/events?sortBy=totalAttempts&sortOrder=desc"
```

#### C. Sort by `status`:
```bash
curl -i -X GET "http://localhost:3001/events?sortBy=status&sortOrder=asc"
```

#### D. Sort by `eventType`:
```bash
curl -i -X GET "http://localhost:3001/events?sortBy=eventType&sortOrder=asc"
```

#### E. Sort by `eventId`:
```bash
curl -i -X GET "http://localhost:3001/events?sortBy=eventId&sortOrder=asc"
```

---

### 3.10 Combined Multi-Filter Query
Combines pagination, status filtering, event type filtering, order ID lookup, and sorting in a single request.

```bash
curl -i -X GET "http://localhost:3001/events?page=1&limit=5&status=completed&type=order.created&orderId=ORD-1001&sortBy=receivedAt&sortOrder=desc"
```

---

## 4. Single Event Details API (`GET /events/:id`)

Retrieve a single event including its full payload, `processedOrder` relation, and complete `processingAttempts` history.

### 4.1 Lookup by Business `eventId`
```bash
curl -i -X GET http://localhost:3001/events/evt_order_1001
```

**Expected Response (200 OK):**
```json
{
  "id": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
  "eventId": "evt_order_1001",
  "eventType": "order.created",
  "status": "completed",
  "payload": {
    "orderId": "ORD-1001",
    "customerId": "CUS-42",
    "amount": 199.99,
    "currency": "USD"
  },
  "totalAttempts": 1,
  "cycleAttempts": 1,
  "maxAttempts": 5,
  "leaseOwner": null,
  "leaseToken": null,
  "leaseExpiresAt": null,
  "nextAttemptAt": null,
  "lastError": null,
  "receivedAt": "2026-11-26T22:45:00.000Z",
  "updatedAt": "2026-11-26T22:45:01.000Z",
  "processingAttempts": [
    {
      "id": "a1b2c3d4-0000-0000-0000-000000000001",
      "eventId": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
      "attemptNumber": 1,
      "retryCycle": 1,
      "status": "success",
      "error": null,
      "durationMs": 42,
      "workerId": "worker-1",
      "startedAt": "2026-11-26T22:45:01.000Z",
      "completedAt": "2026-11-26T22:45:01.042Z"
    }
  ],
  "processedOrder": {
    "id": "e8a1d2c3-1111-2222-3333-444455556666",
    "orderId": "ORD-1001",
    "customerId": "CUS-42",
    "status": "processed",
    "createdAt": "2026-11-26T22:45:01.042Z"
  }
}
```

---

### 4.2 Lookup by Database UUID
```bash
curl -i -X GET http://localhost:3001/events/3b4f61f5-b3df-4993-9c8e-324df782bf6d
```

---

### 4.3 Non-Existent Event Lookup (404 Not Found)
```bash
curl -i -X GET http://localhost:3001/events/evt_non_existent_id
```

**Expected Response (404 Not Found):**
```json
{
  "message": "Event with ID 'evt_non_existent_id' not found",
  "error": "Not Found",
  "statusCode": 404
}
```

---

## 5. Event Attempts History API (`GET /events/:id/attempts`)

Retrieve only the processing attempt records for an event (including worker ID, attempt numbers, execution durations, and error details).

### 5.1 Fetch Attempts by `eventId`
```bash
curl -i -X GET http://localhost:3001/events/evt_sim_retry_5001/attempts
```

**Expected Response (200 OK):**
```json
[
  {
    "id": "8f2e1a3b-1111-4444-8888-abcdef123456",
    "eventId": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
    "attemptNumber": 1,
    "retryCycle": 1,
    "status": "failure",
    "error": "Simulated transient failure (attempt 1/2) for event evt_sim_retry_5001",
    "durationMs": 15,
    "workerId": "worker-1",
    "startedAt": "2026-11-26T22:45:01.000Z",
    "completedAt": "2026-11-26T22:45:01.015Z"
  },
  {
    "id": "9c3d2e4f-2222-5555-9999-bcdef1234567",
    "eventId": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
    "attemptNumber": 2,
    "retryCycle": 1,
    "status": "failure",
    "error": "Simulated transient failure (attempt 2/2) for event evt_sim_retry_5001",
    "durationMs": 12,
    "workerId": "worker-2",
    "startedAt": "2026-11-26T22:45:03.000Z",
    "completedAt": "2026-11-26T22:45:03.012Z"
  },
  {
    "id": "ad4e3f5a-3333-6666-aaaa-cdef12345678",
    "eventId": "3b4f61f5-b3df-4993-9c8e-324df782bf6d",
    "attemptNumber": 3,
    "retryCycle": 1,
    "status": "success",
    "error": null,
    "durationMs": 35,
    "workerId": "worker-1",
    "startedAt": "2026-11-26T22:45:07.000Z",
    "completedAt": "2026-11-26T22:45:07.035Z"
  }
]
```

---

### 5.2 Non-Existent Event Attempts (404 Not Found)
```bash
curl -i -X GET http://localhost:3001/events/non_existent_event/attempts
```

---

## 6. Manual Event Retry API (`POST /events/:id/retry`)

Allows manual intervention to reset a permanently failed event back to `pending`, resetting cycle counters and clearing the lease so workers can pick it up immediately.

### 6.1 Retry a Failed Event (200 OK)
```bash
curl -i -X POST http://localhost:3001/events/evt_sim_fail_5002/retry
```

**Expected Response (200 OK):**
```json
{
  "id": "7a8b9c0d-1234-5678-90ab-cdef12345678",
  "eventId": "evt_sim_fail_5002",
  "eventType": "order.created",
  "status": "pending",
  "cycleAttempts": 0,
  "nextAttemptAt": "2026-11-26T22:46:00.000Z",
  "leaseOwner": null,
  "leaseToken": null,
  "leaseExpiresAt": null,
  "lastError": null,
  "updatedAt": "2026-11-26T22:46:00.000Z"
}
```

---

### 6.2 Attempt Retry on Non-Failed Event (400 Bad Request)
If the event is already `completed`, `pending`, or `processing`, manual retry is rejected to maintain data integrity.

```bash
curl -i -X POST http://localhost:3001/events/evt_order_1001/retry
```

**Expected Response (400 Bad Request):**
```json
{
  "message": "Only permanently failed events can be retried (current status: 'completed')",
  "error": "Bad Request",
  "statusCode": 400
}
```

---

### 6.3 Retry Non-Existent Event (404 Not Found)
```bash
curl -i -X POST http://localhost:3001/events/evt_non_existent/retry
```

**Expected Response (404 Not Found):**
```json
{
  "message": "Event with ID 'evt_non_existent' not found",
  "error": "Not Found",
  "statusCode": 404
}
```

---

## 7. Windows Command Prompt (CMD) Single-Line Quick Reference

When running cURL in standard Windows `cmd.exe`, JSON double quotes must be escaped or passed as a single line:

### Ingest Webhook (CMD format):
```cmd
curl.exe -i -X POST http://localhost:3001/webhooks -H "Content-Type: application/json" -d "{\"eventId\":\"evt_cmd_101\",\"type\":\"order.created\",\"data\":{\"orderId\":\"ORD-CMD-101\",\"customerId\":\"CUS-1\"}}"
```

### Health Check (CMD format):
```cmd
curl.exe -i -X GET http://localhost:3001/health
```

### Dashboard Stats (CMD format):
```cmd
curl.exe -i -X GET http://localhost:3001/stats
```

### List Events (CMD format):
```cmd
curl.exe -i -X GET "http://localhost:3001/events?status=completed&limit=5"
```

### Single Event Details (CMD format):
```cmd
curl.exe -i -X GET http://localhost:3001/events/evt_cmd_101
```

### Retry Failed Event (CMD format):
```cmd
curl.exe -i -X POST http://localhost:3001/events/evt_cmd_101/retry
```
