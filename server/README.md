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
- **cURL / PowerShell:** API manual testing and simulation (see [CURL_TESTS.md](./CURL_TESTS.md))

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
│   │   ├── events.controller.ts     # GET /events & POST /events/:id/retry handlers
│   │   ├── events.service.ts        # Event filtering, pagination & retry logic
│   │   ├── events.module.ts         # Events feature module
│   │   ├── events.controller.spec.ts # Controller unit tests
│   │   └── events.service.spec.ts   # Service unit tests
│   ├── workers/
│   │   ├── base-worker.service.ts   # Base worker processing & retry logic
│   │   ├── worker-1.service.ts      # Dedicated Worker 1 service
│   │   ├── worker-2.service.ts      # Dedicated Worker 2 service
│   │   ├── worker-1-runner.ts       # Standalone Worker 1 runner (npm run worker:1)
│   │   ├── worker-2-runner.ts       # Standalone Worker 2 runner (npm run worker:2)
│   │   ├── workers.service.ts       # Worker management service
│   │   ├── workers.module.ts        # Workers feature module
│   │   └── index.ts
│   ├── app.controller.ts            # Root health check controller
│   ├── app.service.ts               # Root service
│   ├── app.module.ts                # Root application module
│   └── main.ts                      # App bootstrap, Pino logger, and global ValidationPipe
├── test/
│   ├── app.e2e-spec.ts              # Root e2e tests
│   ├── webhooks.e2e-spec.ts         # Webhook ingestion e2e tests (202, deduplication, 400 validation)
│   └── jest-e2e.json                # E2E Jest configuration
├── CURL_TESTS.md                    # Comprehensive cURL commands for all API endpoints
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

## API Testing & cURL Commands

All cURL commands and testing examples across every endpoint (Health Check, Dashboard Stats, Webhooks Ingestion, Simulations, Idempotency, Events Filtering, Pagination, Attempt History, and Manual Retries) have been organized into a dedicated testing reference:

👉 **[CURL_TESTS.md](./CURL_TESTS.md)**

---

## PostgreSQL-Backed Workers

Two concurrent background workers poll and process webhook events from PostgreSQL with distributed locking and crashed-worker recovery.

### Key Architecture Features

1. **Continuous `while (true)` loop**: Each worker runs an independent polling loop.
2. **Unique Worker Identifiers**: Default `worker-1` and `worker-2` (configurable via `WORKER_1_ID` and `WORKER_2_ID`).
3. **Atomic Claiming with Row Locking (`SKIP LOCKED`)**:
   - Uses PostgreSQL `FOR UPDATE SKIP LOCKED` so concurrent workers never lock or process the same event simultaneously.
   - Claims pending events where `next_attempt_at IS NULL OR next_attempt_at <= NOW()`.
4. **Lease Expiration & Worker Crash Recovery**:
   - When claimed, status changes to `processing`, `lease_owner` is assigned to the worker, `lease_token` is generated, and `lease_expires_at` is set (`NOW() + lease_duration`).
   - If a worker crashes or abandons an event, other workers automatically reclaim the event once `lease_expires_at < NOW()`.
5. **Exponential Backoff & Retries**:
   - Failed events are retried with exponential backoff delay up to `max_attempts`.
   - Each attempt is recorded in the `processing_attempts` table.

### Running Workers Separately with CMD

> **Note:** Workers do **not** auto-start when running the main API server (`npm run start:dev` or `npm run start`). The main server runs in pure API mode, allowing you to run workers manually.

Worker 1 and Worker 2 code have been separated into dedicated services (`worker-1.service.ts` and `worker-2.service.ts`) and standalone entry runners (`worker-1-runner.ts` and `worker-2-runner.ts`).

You can start each worker independently in its own CMD / terminal window:

#### Option 1: Using Windows CMD Scripts (Double-click or CMD)

**Worker 1 Window:**
```cmd
start-worker-1.cmd
```

**Worker 2 Window:**
```cmd
start-worker-2.cmd
```

#### Option 2: Using npm Scripts in CMD

**Terminal 1 (Worker 1):**
```bash
npm run worker:1
```

**Terminal 2 (Worker 2):**
```bash
npm run worker:2
```

#### Option 3: Production (compiled JavaScript)

```bash
# Build first
npm run build

# Terminal 1:
npm run worker:1:prod

# Terminal 2:
npm run worker:2:prod
```




