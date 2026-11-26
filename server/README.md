# Webhook Processor - Server

A high-performance, idempotent webhook ingestion and processing service built with NestJS, Prisma, and PostgreSQL.

---

## Tech Stack

- **Runtime & Language:** Node.js (v20+ / v22+), TypeScript
- **Framework:** NestJS 12
- **Database & ORM:** PostgreSQL, Prisma ORM 6
- **Validation & Serialization:** `class-validator`, `class-transformer`
- **Logging & Observability:** Pino (`nestjs-pino`, `pino-pretty`)
- **Testing:** Jest, ts-jest, Supertest
- **Linting & Formatting:** Oxlint, Prettier

---

## Tools

- **Prisma CLI & Prisma Studio:** Database migrations, introspection, and visual data management
- **PostgreSQL:** Relational database with JSONB support
- **Oxlint:** Fast Rust-based linter for TypeScript
- **cURL / PowerShell:** API manual testing and simulation

---

## Server Code Structure

```text
server/
├── prisma/
│   ├── init.sql                     # Database initialization and raw schema
│   └── schema.prisma                # Prisma schema models (WebhookEvent, ProcessingAttempt, ProcessedOrder)
├── src/
│   ├── prisma/
│   │   ├── prisma.module.ts         # Prisma global module
│   │   ├── prisma.service.ts        # Prisma client lifecycle management ($connect / $disconnect)
│   │   └── index.ts
│   ├── webhooks/
│   │   ├── dto/
│   │   │   ├── create-webhook.dto.ts # Top-level webhook schema validation (eventId, type, data)
│   │   │   ├── webhook-data.dto.ts   # Inner event data schema validation (orderId, customerId, simulate, etc.)
│   │   │   └── index.ts
│   │   ├── webhooks.controller.ts   # POST /webhooks endpoint handler (returns 202 Accepted)
│   │   ├── webhooks.service.ts      # Webhook persistence, deduplication & idempotency logic
│   │   ├── webhooks.module.ts       # Webhooks feature module
│   │   ├── webhooks.controller.spec.ts # Controller unit tests
│   │   └── webhooks.service.spec.ts    # Service unit tests
│   ├── events/
│   │   ├── dto/
│   │   │   ├── get-events-query.dto.ts # Query params validation (status, type, orderId, pagination, sorting)
│   │   │   └── index.ts
│   │   ├── events.controller.ts     # GET /events & GET /events/:id handlers
│   │   ├── events.service.ts        # Event filtering, pagination & single event lookup
│   │   ├── events.module.ts         # Events feature module
│   │   ├── events.controller.spec.ts # Controller unit tests
│   │   └── events.service.spec.ts   # Service unit tests
│   ├── app.controller.ts            # Root health check controller
│   ├── app.service.ts               # Root service
│   ├── app.module.ts                # Root application module
│   └── main.ts                      # App bootstrap, Pino logger, and global ValidationPipe
├── test/
│   ├── app.e2e-spec.ts              # Root e2e tests
│   ├── webhooks.e2e-spec.ts         # Webhook ingestion e2e tests (202, deduplication, 400 validation)
│   └── jest-e2e.json                # E2E Jest configuration
├── .env.example                     # Environment variables template
├── .env                             # Local environment variables
├── package.json                     # Scripts and dependencies
└── tsconfig.json                    # TypeScript compiler options
```

---

## How to Start Guide

### 1. Prerequisites
- Node.js (v20+ or v22+)
- PostgreSQL instance running

### 2. Environment Setup
Create a `.env` file in the `server` directory (or configure based on `.env.example`):

```env
DATABASE_URL="postgresql://postgres:1234@localhost:5432/webhook-processor?schema=public"
PORT=3001
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Setup Database
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply schema migrations
npm run prisma:migrate
```

### 5. Run the Application
```bash
# Development mode (watch)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```
The server will start on `http://localhost:3001`.

---

## Testing Commands

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run tests with coverage
npm run test:cov

# Run linter
npm run lint
```

---

## Prisma Commands

```bash
# Generate Prisma Client
npm run prisma:generate
# or: npx prisma generate

# Create and apply migrations in development
npm run prisma:migrate
# or: npx prisma migrate dev

# Push schema directly to database (prototype/sync)
npx prisma db push

# Introspect database into schema.prisma
npx prisma db pull

# Open visual database browser GUI (http://localhost:5555)
npm run prisma:studio
# or: npx prisma studio
```

### Query Ingested Webhooks (SQL)

```sql
SELECT event_id, event_type, status, payload, received_at 
FROM webhook_events 
ORDER BY received_at DESC;
```

---

## Webhook Testing Commands

Test `POST /webhooks` manually using **cURL** or **PowerShell**:

### 1. Ingest Valid Webhook Event (202 Accepted)

**cURL:**
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_123",
    "type": "order.created",
    "data": {
      "orderId": "ORD-1001",
      "customerId": "CUS-42",
      "simulate": "fail_then_succeed:2"
    }
  }'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/webhooks" -Method Post -ContentType "application/json" -Body '{
  "eventId": "evt_123",
  "type": "order.created",
  "data": {
    "orderId": "ORD-1001",
    "customerId": "CUS-42",
    "simulate": "fail_then_succeed:2"
  }
}'
```

**Expected Response:**
```json
HTTP/1.1 202 Accepted
{
  "status": "accepted",
  "eventId": "evt_123"
}
```

---

### 2. Duplicate Delivery with Different Payload (Idempotency - 202 Accepted)

Delivering the same `eventId` with a different payload preserves the original event in the database and ignores the later payload:

**cURL:**
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_123",
    "type": "order.updated",
    "data": {
      "orderId": "ORD-DIFFERENT",
      "customerId": "CUS-DIFFERENT"
    }
  }'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/webhooks" -Method Post -ContentType "application/json" -Body '{
  "eventId": "evt_123",
  "type": "order.updated",
  "data": {
    "orderId": "ORD-DIFFERENT",
    "customerId": "CUS-DIFFERENT"
  }
}'
```

**Expected Response:**
```json
HTTP/1.1 202 Accepted
{
  "status": "accepted",
  "eventId": "evt_123"
}
```

---

### 3. Schema Validation Error (400 Bad Request)

Sending a payload missing required fields (e.g. missing `eventId` or `orderId`):

**cURL:**
```bash
curl -i -X POST http://localhost:3001/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order.created",
    "data": {
      "customerId": "CUS-42"
    }
  }'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/webhooks" -Method Post -ContentType "application/json" -Body '{
  "type": "order.created",
  "data": {
    "customerId": "CUS-42"
  }
}'
```

**Expected Response:**
```json
HTTP/1.1 400 Bad Request
{
  "message": [
    "eventId must be a string",
    "eventId should not be empty",
    "data.orderId must be a string",
    "data.orderId should not be empty"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

---

## Events API Testing Commands

The `GET /events` API retrieves ingested webhook events with comprehensive filtering and pagination support.

### Supported Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | Integer | `1` | Page number (1-based, min: 1) |
| `limit` | Integer | `10` | Records per page (min: 1, max: 100) |
| `status` | String | - | Filter by status (`pending`, `processing`, `completed`, `failed`) |
| `type` / `eventType` | String | - | Filter by event type (`order.created`, `order.updated`, etc.) |
| `orderId` | String | - | Filter by order ID in event payload or processed orders |
| `customerId` | String | - | Filter by customer ID in event payload |
| `search` | String | - | Keyword search matching `eventId`, `eventType`, or `lastError` |
| `startDate` / `from` | ISO Date | - | Filter events received after this timestamp |
| `endDate` / `to` | ISO Date | - | Filter events received before this timestamp |
| `sortBy` | String | `receivedAt` | Sort field (`receivedAt`, `updatedAt`, `status`, `eventType`, `totalAttempts`, `eventId`) |
| `sortOrder` | String | `desc` | Sort direction (`asc` or `desc`) |

---

### 1. List Events with Default Pagination

**cURL:**
```bash
curl -i -X GET http://localhost:3001/events
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/events" -Method Get
```

**Expected Response (200 OK):**
```json
{
  "data": [
    {
      "id": "e3b0c442-98fc-1c14-9afb-4c7b8e1f0001",
      "eventId": "evt_123",
      "eventType": "order.created",
      "payload": {
        "orderId": "ORD-1001",
        "customerId": "CUS-42",
        "simulate": "fail_then_succeed:2"
      },
      "status": "pending",
      "totalAttempts": 0,
      "cycleAttempts": 0,
      "maxAttempts": 5,
      "nextAttemptAt": null,
      "leaseOwner": null,
      "leaseToken": null,
      "leaseExpiresAt": null,
      "lastError": null,
      "receivedAt": "2026-11-26T13:00:00.000Z",
      "updatedAt": "2026-11-26T13:00:00.000Z",
      "processingAttempts": [],
      "processedOrder": null
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

---

### 2. List Events with Filters & Pagination

**cURL:**
```bash
curl -i -X GET "http://localhost:3001/events?page=1&limit=5&status=completed&type=order.created&orderId=ORD-1001"
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/events?page=1&limit=5&status=completed&type=order.created&orderId=ORD-1001" -Method Get
```

---

### 3. Get Single Event by ID

**cURL:**
```bash
curl -i -X GET http://localhost:3001/events/evt_123
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/events/evt_123" -Method Get
```

---

## Health Check API

The `GET /health` endpoint performs a system and database connectivity health check.

### Health Check (200 OK / 503 Service Unavailable)

**cURL:**
```bash
curl -i -X GET http://localhost:3001/health
```

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get
```

**Expected Response (200 OK when healthy):**
```json
{
  "status": "ok",
  "timestamp": "2026-11-26T13:54:00.000Z",
  "uptime": 12.34,
  "database": {
    "status": "up",
    "latencyMs": 2
  }
}
```

**Expected Response (503 Service Unavailable when database unreachable):**
```json
{
  "status": "error",
  "timestamp": "2026-11-26T13:54:00.000Z",
  "uptime": 12.34,
  "database": {
    "status": "down",
    "error": "Database connection failed"
  }
}
```


