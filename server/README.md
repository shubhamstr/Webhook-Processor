# Webhook Processor - Server

A high-performance, idempotent webhook ingestion and processing service built with NestJS 12, Prisma ORM 6, and PostgreSQL 16. Designed for resilient, distributed event processing with concurrent database-backed workers, atomic lease claiming, crash recovery, and exponential backoff retries.

---

## Features

- **High-Throughput Ingestion**: Non-blocking `POST /webhooks` endpoint returning immediate `202 Accepted` responses.
- **Strict Payload Validation**: Robust request validation and type safety using `class-validator` and `class-transformer`.
- **Deduplication & Idempotency**: Prevents duplicate execution using unique event IDs and atomic database upserts.
- **Distributed Worker Architecture**:
  - Independent concurrent workers polling PostgreSQL via `FOR UPDATE SKIP LOCKED`.
  - Lease-based claiming (`lease_owner`, `lease_token`, `lease_expires_at`) preventing duplicate processing.
  - Automatic crashed-worker recovery when leases expire.
  - Active lease renewal/heartbeat for long-running jobs.
- **Exponential Backoff & Dead-Lettering**: Configurable retry policies with exponential delays and permanent failure thresholds.
- **Audit & Attempt History**: Granular attempt tracking with timestamps, execution durations, HTTP status codes, and error traces.
- **Observability & Health Checks**:
  - Structured JSON logging with `pino` and `nestjs-pino`.
  - Real-time `GET /health` endpoint monitoring database connectivity.
  - Aggregate dashboard metrics via `GET /stats`.
- **Event Filtering & Manual Retries**:
  - Flexible event querying by status, type, customer ID, or order ID with sorting and pagination via `GET /events`.
  - Manual retry capability for failed events via `POST /events/:id/retry`.
- **Burst Load & Simulation Testing**: Built-in test suites verifying concurrency, throughput, and terminal state drainage under 500+ event bursts and slow-running workloads.

---

## Tech Stack

- **Framework**: [NestJS 12](https://nestjs.com/)
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (v20+ / v22+)
- **Database**: PostgreSQL 16 (relational storage with JSONB payload support)
- **ORM**: [Prisma ORM 6](https://www.prisma.io/)
- **Validation**: `class-validator`, `class-transformer`
- **Logging**: Pino (`nestjs-pino`, `pino-pretty`)
- **Testing**: Jest, Supertest, ts-jest
- **Linter & Formatter**: Oxlint, Prettier
- **Containerization**: Docker (multi-stage production build)

---

## Server Code Structure

```text
server/
├── prisma/
│   ├── init.sql                         # Raw schema and initial tables definition
│   └── schema.prisma                    # Prisma schema models (WebhookEvent, ProcessingAttempt, ProcessedOrder)
├── scripts/
│   ├── burst-test.js                    # 500-event concurrent burst test & latency percentiles
│   └── burst-slow-test.js               # Slow simulation burst test & worker lease extension
├── src/
│   ├── common/
│   │   └── time.utils.ts                # Shared time and sleep utility functions
│   ├── prisma/
│   │   ├── prisma.module.ts             # Global Prisma module
│   │   ├── prisma.service.ts            # Prisma client lifecycle management ($connect / $disconnect)
│   │   └── index.ts
│   ├── webhooks/
│   │   ├── dto/
│   │   │   ├── create-webhook.dto.ts    # Webhook ingestion DTO (eventId, type, data validation)
│   │   │   ├── webhook-data.dto.ts      # Inner event data DTO (orderId, customerId, simulate, etc.)
│   │   │   └── index.ts
│   │   ├── webhooks.controller.ts       # POST /webhooks endpoint handler (returns 202 Accepted)
│   │   ├── webhooks.service.ts          # Ingestion, deduplication, and database persistence
│   │   └── webhooks.module.ts           # Webhooks feature module
│   ├── events/
│   │   ├── dto/
│   │   │   ├── get-events-query.dto.ts  # Query params DTO (status, type, search, pagination, sort)
│   │   │   └── index.ts
│   │   ├── events.controller.ts         # GET /events and POST /events/:id/retry handlers
│   │   ├── events.service.ts            # Event querying, stats computation, and retry logic
│   │   └── events.module.ts             # Events feature module
│   ├── workers/
│   │   ├── base-worker.service.ts       # Core queue polling, SKIP LOCKED claiming, execution, and retries
│   │   ├── worker-1.service.ts          # Dedicated Worker 1 service implementation
│   │   ├── worker-2.service.ts          # Dedicated Worker 2 service implementation
│   │   ├── worker-1-runner.ts           # Standalone entry runner for Worker 1
│   │   ├── worker-2-runner.ts           # Standalone entry runner for Worker 2
│   │   ├── worker.types.ts              # Worker types and interfaces
│   │   ├── workers.service.ts           # Worker lifecycle coordination
│   │   ├── workers.module.ts            # Workers feature module
│   │   └── index.ts
│   ├── app.controller.ts                # Root endpoints (GET /, GET /health, GET /stats)
│   ├── app.service.ts                   # System health verification logic
│   ├── app.module.ts                    # Root application module
│   └── main.ts                          # Bootstrap, Pino logger, CORS, and global ValidationPipe
├── test/
│   ├── app.controller.spec.ts           # Root controller unit tests
│   ├── app.e2e-spec.ts                  # Root e2e test suite
│   ├── events.controller.spec.ts        # Events controller unit tests
│   ├── events.service.spec.ts           # Events service unit tests
│   ├── events.e2e-spec.ts               # Events query and retry e2e tests
│   ├── prisma.service.spec.ts           # Prisma service unit tests
│   ├── webhooks.controller.spec.ts      # Webhook controller unit tests
│   ├── webhooks.service.spec.ts         # Webhook service unit tests
│   ├── webhooks.e2e-spec.ts             # Webhook ingestion and idempotency e2e tests
│   ├── worker-1.service.spec.ts         # Worker 1 service unit tests
│   ├── worker-2.service.spec.ts         # Worker 2 service unit tests
│   ├── workers.service.spec.ts          # Worker orchestrator unit tests
│   └── jest-e2e.json                    # E2E test configuration
├── CURL_TESTS.md                        # Complete API cURL commands and testing reference
├── Dockerfile                           # Production Dockerfile
├── .dockerignore                        # Docker ignore rules
├── .env.example                         # Environment variables template
├── package.json                         # Scripts and dependencies
└── tsconfig.json                        # TypeScript configuration
```

---

## API Endpoints

| Method | Endpoint | Description | Status Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Basic welcome / service ping | `200 OK` |
| `GET` | `/health` | Health check verifying database connection | `200 OK` / `503 Unavailable` |
| `GET` | `/stats` | Aggregate dashboard counts by status | `200 OK` |
| `POST` | `/webhooks` | Ingest and persist webhook event for processing | `202 Accepted` |
| `GET` | `/events` | List events with filtering, search, pagination, and attempts | `200 OK` |
| `POST` | `/events/:id/retry` | Manually reset a failed event back to `pending` | `200 OK` |

> For comprehensive cURL request/response examples for every endpoint, see [CURL_TESTS.md](./CURL_TESTS.md).

---

## Environment Variables

Configure environment variables in a `.env` file in the `server/` directory:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/webhook-processor?schema=public` |
| `PORT` | HTTP server listening port | `3001` |
| `WORKER_1_ID` | Identifier tag for Worker 1 | `worker-1` |
| `WORKER_2_ID` | Identifier tag for Worker 2 | `worker-2` |
| `NODE_ENV` | Application environment (`development` / `production` / `test`) | `development` |

---

## Getting Started

### 1. Prerequisites

- **Node.js**: v20+ or v22+
- **PostgreSQL**: Running instance on port `5432` (or via Docker)
- **npm** (or yarn / pnpm)

### 2. Installation

```bash
# Navigate to the server folder
cd server

# Install dependencies
npm install
```

### 3. Database Setup

```bash
# Generate Prisma Client
npm run prisma:generate

# Run schema migrations against the database
npm run prisma:migrate
```

### 4. Running the API Server

```bash
# Development mode with hot-reload
npm run start:dev

# Production build and start
npm run build
npm run start:prod
```

The API server will listen on `http://localhost:3001`.

---

## Running Background Workers

The background workers process queued events from the database. They run independently from the main API server to allow decoupled horizontal scaling.

### Worker Architecture Highlights

1. **Atomic Claiming (`FOR UPDATE SKIP LOCKED`)**:
   - Workers query pending events where `next_attempt_at <= NOW()`.
   - Rows are locked without blocking other workers, preventing duplicate claims.
2. **Lease Management & Crash Recovery**:
   - On claim, status transitions to `processing` with a time-limited lease (`lease_expires_at`).
   - If a worker crashes or stalls, its lease expires, and another worker reclaims the event automatically.
3. **Exponential Backoff**:
   - Failed events transition to `pending` with an incremented attempt count and backoff delay.
   - Events exceeding `max_attempts` transition to terminal `failed` status.

### Running Workers Locally

Run each worker in its own terminal window:

#### Worker 1:
```bash
# Development mode
npm run worker:1

# Watch mode (auto-reload on code changes)
npm run worker:1:watch

# Production mode (compiled dist)
npm run worker:1:prod
```

#### Worker 2:
```bash
# Development mode
npm run worker:2

# Watch mode (auto-reload on code changes)
npm run worker:2:watch

# Production mode (compiled dist)
npm run worker:2:prod
```

---

## Testing & Quality Assurance

### Unit & E2E Testing

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run unit tests with code coverage
npm run test:cov

# Run end-to-end (E2E) tests
npm run test:e2e
```

### Linting & Formatting

```bash
# Run Oxlint type-aware linting
npm run lint

# Format code with Prettier
npm run format
```

---

## Load & Simulation Testing

The server includes automated scripts to stress-test ingestion, queue concurrency, and terminal state transitions:

### 1. 500-Event Burst Load Test
Simulates a burst of 500 webhook events, monitoring API responsiveness (`GET /health`), throughput, and waiting until all events reach a terminal state (`completed` or `failed`):

```bash
# Default 500-event burst
npm run test:burst

# Custom event count and concurrency
node scripts/burst-test.js --count 500 --concurrency 50
```

### 2. Slow Simulation Workload Test
Dispatches events configured with artificial processing delays (`simulate: "slow"`) to verify worker concurrency, lease renewals, and queue drainage during long tasks:

```bash
# Default slow simulation
npm run test:burst:slow

# Custom count and delay
node scripts/burst-slow-test.js --count 10 --delay 3
```

---

## Prisma Database Management

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create and apply migrations in development
npm run prisma:migrate

# Push schema directly to database (prototype without migrations)
npx prisma db push

# Open visual database browser GUI on http://localhost:5555
npm run prisma:studio
```

---

## Docker & Containerization

### Standalone Server Docker Container

Build and run the server independently:

```bash
# Build the Docker image
docker build -t webhook-processor-server -f Dockerfile .

# Run container mapping port 3001
docker run -p 3001:3001 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/webhook-processor?schema=public" \
  webhook-processor-server
```

### Multi-Container Stack (Root Docker Compose)

The entire system (PostgreSQL, NestJS API Server, Worker 1, Worker 2, Next.js Client, and Prisma Studio) can be launched simultaneously from the root directory:

```bash
# From project root:
npm run docker:up        # Build and start all services in foreground
npm run docker:up:d      # Start all services in background (detached)
npm run docker:logs      # Follow logs across all containers
npm run docker:down      # Stop all containers
npm run docker:studio    # Start Prisma Studio GUI on port 5555
```
