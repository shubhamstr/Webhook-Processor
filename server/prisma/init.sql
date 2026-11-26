-- Enable pgcrypto / uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table 1: webhook_events
-- Main event storage and queue table (Timestamps maintained in IST: Asia/Kolkata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    total_attempts INTEGER NOT NULL DEFAULT 0,
    cycle_attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP,
    lease_owner VARCHAR(255),
    lease_token UUID,
    lease_expires_at TIMESTAMP,
    last_error TEXT,
    received_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')
);

-- Queue polling & worker lease indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_queue 
    ON webhook_events (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lease 
    ON webhook_events (lease_owner, lease_expires_at);

-- ============================================================================
-- Table 2: processing_attempts
-- Tracks every processing attempt across workers and retry cycles (Timestamps in IST)
-- ============================================================================
CREATE TABLE IF NOT EXISTS processing_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    retry_cycle INTEGER NOT NULL DEFAULT 1,
    worker_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    finished_at TIMESTAMP,
    result VARCHAR(50), -- success, failure, abandoned
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_processing_attempts_event_id 
    ON processing_attempts (event_id);

CREATE INDEX IF NOT EXISTS idx_processing_attempts_worker_id 
    ON processing_attempts (worker_id);

-- ============================================================================
-- Table 3: processed_orders
-- Assessment-specific idempotency & business operation verification table (Timestamps in IST)
-- ============================================================================
CREATE TABLE IF NOT EXISTS processed_orders (
    order_id VARCHAR(255) NOT NULL,
    event_id UUID NOT NULL UNIQUE REFERENCES webhook_events(id) ON DELETE CASCADE,
    processed_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    PRIMARY KEY (event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_orders_order_id 
    ON processed_orders (order_id);
