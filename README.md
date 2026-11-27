# Webhook Processor

A resilient, idempotent webhook ingestion and processing engine built with NestJS, Next.js, and PostgreSQL. It features non-blocking ingestion (`202 Accepted`), concurrent distributed background workers, database-backed atomic lease claiming, crash recovery, exponential backoff retries, and a real-time observability dashboard.

---

## Architecture

The system decouples fast ingestion from asynchronous background processing using PostgreSQL as the central coordination layer.

```
[ Client / Webhook Provider ]
              │  POST /webhooks
              ▼
   ┌──────────────────────┐
   │    NestJS API Server │ ──> Validates DTO & deduplicates event_id
   └──────────┬───────────┘
              │  Inserts event (status: 'pending')
              ▼
   ┌────────────────────────────────────────────────────────┐
   │                  PostgreSQL Database                   │
   │  - webhook_events (event status, leases, backoff)      │
   │  - processing_attempts (granular audit log)            │
   │  - processed_orders (idempotent business state)        │
   └───────────────┬────────────────────────┬───────────────┘
                   │                        │
       FOR UPDATE SKIP LOCKED    FOR UPDATE SKIP LOCKED
                   │                        │
                   ▼                        ▼
         ┌──────────────────┐     ┌──────────────────┐
         │ Worker 1 Process │     │ Worker 2 Process │
         └──────────────────┘     └──────────────────┘
```

### Event Lifecycle & Worker Coordination

1. **Ingestion**: The API server accepts incoming payloads via `POST /webhooks`, validates data structures with `class-validator`, persists the event to `webhook_events` with `status: 'pending'`, and immediately returns `202 Accepted`. Duplicate event IDs are rejected or deduplicated on ingestion.
2. **Worker Coordination (`FOR UPDATE SKIP LOCKED`)**: Independent background workers (`worker-1`, `worker-2`) poll PostgreSQL for eligible jobs (`status = 'pending'` or expired leases, where `next_attempt_at <= NOW()`). Using `FOR UPDATE SKIP LOCKED`, a worker locks and claims an eligible row without blocking other workers from claiming adjacent rows.
3. **Lease Mechanism**: Upon claiming, the worker atomically transitions the event to `processing`, sets `lease_owner` to its worker ID, assigns a unique `lease_token` (UUID), and sets `lease_expires_at` (default: 30 seconds).
4. **Execution & Audit**: The worker creates a `processing_attempts` entry, processes the payload idempotently, and records the outcome.
5. **Completion or Backoff**:
   - **Success**: Status transitions to `completed`, order record is saved, and the lease is cleared.
   - **Failure**: Failure details are logged in `processing_attempts`. If attempts remain under `max_attempts`, status resets to `pending` with exponential backoff (`next_attempt_at = NOW() + 2^attempt * baseDelay`). If retries are exhausted, status transitions to `failed`.
6. **Crash Recovery**: If a worker crashes mid-task, its lease expires. The next available worker claims the abandoned event, finalizes the abandoned attempt, and retries processing.

---

## Libraries

| Library / Tool                          | Role                              | Why Chosen                                                                                                                                                                         |
| :-------------------------------------- | :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NestJS 12**                           | Backend Framework                 | Provides modular TypeScript architecture, dependency injection, built-in validation pipelines, and clean lifecycle management for both HTTP servers and standalone worker runners. |
| **Prisma ORM 6**                        | Data Modeling & Migrations        | Offers compile-time type safety, automated migrations, and schema definitions while allowing raw SQL queries (`$queryRaw`) for PostgreSQL-specific locking primitives.             |
| **PostgreSQL 16**                       | Relational Database & Queue Store | Provides ACID transactions, row-level concurrency via `FOR UPDATE SKIP LOCKED`, and native `JSONB` support for flexible webhook payloads without external broker dependencies.     |
| **class-validator & class-transformer** | Payload Validation                | Enforces strict schema validation at the HTTP layer, rejecting malformed webhooks before database ingestion.                                                                       |
| **Pino & nestjs-pino**                  | Structured Logging                | Ultra-low-overhead JSON logger providing structured contextual logs across concurrent workers and API requests.                                                                    |
| **Next.js 15 & Tailwind CSS**           | Monitoring Frontend               | Fast server/client dashboard to visualize queue metrics, inspect attempt histories, and trigger manual retries.                                                                    |

---

## Correctness Guarantees

- **Idempotent Ingestion**: `event_id` is enforced by a unique constraint on `webhook_events`. Ingesting the same `event_id` multiple times will not create duplicate queue entries or trigger multiple processing workflows.
- **Mutual Exclusion without Double-Processing**: PostgreSQL's `FOR UPDATE SKIP LOCKED` guarantees that only one worker can lock and claim a specific pending row at any moment. Multiple workers running simultaneously will never claim or process the same event concurrently.
- **At-Least-Once Delivery with Crash Recovery**: If a worker dies, is terminated, or suffers network loss mid-execution, the event is not lost. Once `lease_expires_at` passes, the event becomes eligible for reclamation by another worker.
- **Accurate Attempt & Cycle History**: Every execution is recorded in `processing_attempts` with worker IDs, execution timestamps, retry cycles, and error messages. Attempt counts are monotonically calculated across crashes and manual retries.
- **Backoff Throttling**: Exponential backoff prevents transient downstream failures from overwhelming target systems or causing thundering herd problems.

---

## Known Limitations

- **Time Zone Hardcoding (Indian Standard Time)**: The database schema and application time utilities currently use `TIMESTAMP WITHOUT TIME ZONE` and explicitly shift timestamps by `+05:30` (`NOW() AT TIME ZONE 'Asia/Kolkata'`). If deployed in environments with servers or clients operating in other time zones, timestamp queries and lease evaluations can lead to time skew or misaligned scheduling.
- **Lease Timeout vs. Slow Task Overlap**: If processing an event takes longer than the configured lease timeout (`WORKER_LEASE_DURATION_SECONDS`, default 30s) without an active heartbeat extending the lease, a second worker will consider the event abandoned, claim it, and execute it concurrently with the first worker.
- **Database Polling Overhead**: Workers continuously poll PostgreSQL at configured intervals (`WORKER_POLL_INTERVAL_MS`). Under large queue volumes or idle states, polling adds continuous query overhead and connection pool usage compared to push-based message queues.
- **Table Bloat under High Concurrency**: High-frequency updates to `webhook_events` (status changes, lease updates, attempt increments) create PostgreSQL dead tuples (MVCC), requiring aggressive autovacuum tuning under sustained heavy load.

---

## Decisions

- **PostgreSQL-Backed Queue vs. Redis / BullMQ**: I intentionally chose PostgreSQL with `FOR UPDATE SKIP LOCKED` and database leases over Redis because I did not want to introduce a complex Redis setup for this task. It keeps data persistence, queue coordination, and audit history unified within a single ACID-compliant datastore. **If developing for production, I will definitely choose Redis** (e.g., BullMQ) to eliminate database polling and minimize lock contention.
- **Decoupled Worker Processes**: I decoupled workers into independent Node.js processes (`worker-1-runner.ts`, `worker-2-runner.ts`) rather than in-process timers inside the HTTP server. This mirrors distributed production architecture and validates multi-process database coordination.
- **Asynchronous 202 Ingestion**: Incoming webhooks are immediately persisted and acknowledged with `202 Accepted` rather than processed synchronously, protecting against upstream webhook provider timeouts.
- **Normalized Attempt History Table**: Instead of storing attempt counts solely as integers on the event row, I added a dedicated `processing_attempts` table to record every execution start, finish, worker ID, and error trace for full auditability.

---

## What I'd Do Next (Priorities in Order)

1. **Universal Time Zone Support (UTC Migration)**:
   - _Why first_: Make the system fully compatible and available across all timezones. Currently, it only supports Indian Standard Time (`+05:30`). I would migrate all database columns to `TIMESTAMP WITH TIME ZONE` (TIMESTAMPTZ) storing standard UTC, rendering local timezones dynamically in the client/dashboard.
2. **Transition Queue Layer to Redis (BullMQ / Redis Streams)**:
   - _Why second_: As noted in my design decisions, for a production environment I will definitely choose Redis. Migrating queue management to Redis offloads polling from PostgreSQL, provides sub-millisecond job distribution, built-in rate limiting, and native event pub/sub.
3. **Heartbeat / Dynamic Lease Extension**:
   - _Why third_: Implement an active background heartbeat timer during job execution that periodically renews `lease_expires_at` for long-running jobs, eliminating race conditions where slow jobs get reclaimed by another worker.
4. **Dead-Letter Queue (DLQ) Notification & Alerting**:
   - _Why fourth_: Add webhook callbacks or notifications (Slack/email) when events exhaust `max_attempts` and enter terminal `failed` status, facilitating alerting and operational triage.
5. **Database Partitioning & Archival**:
   - _Why fifth_: Partition `webhook_events` and `processing_attempts` by month/status to maintain high index efficiency and query performance as event counts grow into millions.

---

## Quick Start

### Run with Docker Compose

```bash
# Start all services (PostgreSQL, NestJS API, Worker 1, Worker 2, Next.js Dashboard)
npm run docker:up

# Start in detached mode
npm run docker:up:d

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Services & URLs

- **Web Dashboard**: `http://localhost:3000`
- **NestJS API Server**: `http://localhost:3001`
- **Health Check**: `GET http://localhost:3001/health`
- **Stats Endpoint**: `GET http://localhost:3001/stats`
- **Prisma Studio**: `http://localhost:5555`

---

## Load & Burst Testing

Built-in test suites benchmark throughput, verify `SKIP LOCKED` concurrency, and monitor queue drainage until all events reach a terminal state (`completed` or `failed`):

```bash
# Run 500-event concurrent burst test (from project root)
npm run test:burst

# Run slow simulation test (verifies worker concurrency and lease renewals)
npm run test:burst:slow
```

---

## Prisma Studio & Database Tools

Prisma Studio provides an interactive visual GUI to inspect and manipulate `webhook_events`, `processing_attempts`, and `processed_orders`:

### Via Docker Compose

```bash
# Start Prisma Studio container on port 5555
npm run docker:studio

# Stop Prisma Studio container
npm run docker:studio:down
```

Open **`http://localhost:5555`** in your browser.
