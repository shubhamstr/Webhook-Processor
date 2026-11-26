import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';
import { ClaimedWebhookEvent, WorkerState } from './worker.types';
import { getISTDate, getISTISOString } from '../common/time.utils';

export abstract class BaseWorkerService {
  protected readonly logger: Logger;
  readonly workerId: string;
  readonly workerName: string;

  protected readonly leaseDurationSeconds: number;
  protected readonly pollIntervalMs: number;
  protected readonly errorBackoffMs: number;

  protected isStopped = false;
  protected isRunning = false;
  protected readonly state: WorkerState;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    workerId: string,
    workerName: string,
  ) {
    this.workerId = workerId;
    this.workerName = workerName;
    this.logger = new Logger(workerName);

    this.leaseDurationSeconds = Number(
      this.configService.get<number>('WORKER_LEASE_DURATION_SECONDS') || 30,
    );
    this.pollIntervalMs = Number(
      this.configService.get<number>('WORKER_POLL_INTERVAL_MS') || 1000,
    );
    this.errorBackoffMs = Number(
      this.configService.get<number>('WORKER_ERROR_BACKOFF_MS') || 2000,
    );

    this.state = {
      workerId: this.workerId,
      status: 'idle',
      processedCount: 0,
      currentEventId: null,
    };
  }

  /**
   * Start this worker's processing loop
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn(`Worker '${this.workerId}' is already running.`);
      return;
    }

    this.isStopped = false;
    this.isRunning = true;
    this.logger.log(`Starting worker '${this.workerId}'...`);
    void this.runWorkerLoop(this.workerId);
  }

  /**
   * Stop this worker gracefully
   */
  stop(): void {
    this.logger.log(`Stopping worker '${this.workerId}' gracefully...`);
    this.isStopped = true;
    this.isRunning = false;
  }

  /**
   * Continuous execution loop: polls and processes pending events
   */
  async runWorkerLoop(workerId: string = this.workerId): Promise<void> {
    this.logger.log(`[${workerId}] Worker execution loop started.`);
    this.state.status = 'running';
    this.state.startedAt = new Date();

    while (true) {
      if (this.isStopped) {
        this.logger.log(`[${workerId}] Stop signal received, exiting loop.`);
        break;
      }

      try {
        const event = await this.claimWebhookEvent(workerId);

        if (event) {
          this.state.currentEventId = event.eventId;
          this.logger.log(
            `[${workerId}] Claimed event '${event.eventId}' (ID: ${event.id}, Status: ${event.status})`,
          );

          await this.processEvent(event, workerId);

          this.state.processedCount++;
          this.state.currentEventId = null;
          this.state.lastActiveAt = new Date();
        } else {
          await this.sleep(this.pollIntervalMs);
        }
      } catch (error) {
        this.logger.error(
          `[${workerId}] Unexpected error in worker loop: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        await this.sleep(this.errorBackoffMs);
      }
    }

    this.state.status = 'stopped';
    this.state.currentEventId = null;
    this.logger.log(`[${workerId}] Worker execution loop terminated.`);
  }

  /**
   * Claim next eligible webhook event from PostgreSQL:
   * 1. Status is 'pending' OR 'processing' with expired lease
   * 2. next_attempt_at is NULL OR next_attempt_at <= NOW()
   * 3. Row locked with FOR UPDATE SKIP LOCKED
   * 4. Updates status to 'processing' and sets lease owner & expiry
   */
  async claimWebhookEvent(
    workerId: string = this.workerId,
    leaseDurationSeconds = this.leaseDurationSeconds,
  ): Promise<ClaimedWebhookEvent | null> {
    const leaseToken = randomUUID();

    const results = await this.prisma.$queryRaw<ClaimedWebhookEvent[]>`
      WITH candidate AS (
        SELECT id
        FROM webhook_events
        WHERE (
          status = 'pending'
          OR (status = 'processing' AND lease_expires_at < (NOW() AT TIME ZONE 'Asia/Kolkata'))
        )
        AND (next_attempt_at IS NULL OR next_attempt_at <= (NOW() AT TIME ZONE 'Asia/Kolkata'))
        ORDER BY received_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE webhook_events w
      SET 
        status = 'processing',
        lease_owner = ${workerId},
        lease_token = ${leaseToken}::uuid,
        lease_expires_at = (NOW() AT TIME ZONE 'Asia/Kolkata') + (${leaseDurationSeconds} || ' seconds')::interval,
        updated_at = (NOW() AT TIME ZONE 'Asia/Kolkata')
      FROM candidate
      WHERE w.id = candidate.id
      RETURNING 
        w.id,
        w.event_id AS "eventId",
        w.event_type AS "eventType",
        w.payload,
        w.status,
        w.total_attempts AS "totalAttempts",
        w.cycle_attempts AS "cycleAttempts",
        w.max_attempts AS "maxAttempts",
        w.next_attempt_at AS "nextAttemptAt",
        w.lease_owner AS "leaseOwner",
        w.lease_token AS "leaseToken",
        w.lease_expires_at AS "leaseExpiresAt",
        w.last_error AS "lastError",
        w.received_at AS "receivedAt",
        w.updated_at AS "updatedAt";
    `;

    if (!results || results.length === 0) {
      return null;
    }

    const event = results[0];
    if (typeof event.payload === 'string') {
      try {
        event.payload = JSON.parse(event.payload) as Record<string, unknown>;
      } catch {
        // keep as is
      }
    }

    return event;
  }

  /**
   * Process a claimed webhook event:
   * - Records processing attempt in processing_attempts table
   * - Handles payload simulation logic (fail_then_succeed, fail_permanently, crash)
   * - Saves processed order for idempotency
   * - On success: sets status='completed', clears lease
   * - On failure: sets status='failed' or calculates exponential backoff next_attempt_at and resets to 'pending'
   */
  async processEvent(
    event: ClaimedWebhookEvent,
    workerId: string = this.workerId,
  ): Promise<void> {
    const attemptNumber = (event.totalAttempts ?? 0) + 1;
    const retryCycle = (event.cycleAttempts ?? 0) + 1;
    const maxAttempts = event.maxAttempts || 5;

    // Record processing attempt
    const attempt = await this.prisma.processingAttempt.create({
      data: {
        eventId: event.id,
        attemptNumber,
        retryCycle,
        workerId,
        startedAt: getISTDate(),
      },
    });

    try {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const simulate = (payload.simulate || payload.simulation) as
        | string
        | undefined;

      // Handle test simulation flags
      if (simulate && simulate !== 'ok') {
        if (simulate === 'crash') {
          this.logger.warn(
            `[${workerId}] Simulating worker crash on event '${event.eventId}'. Lease will expire and be recovered.`,
          );
          return;
        }

        if (
          simulate === 'always_fail' ||
          simulate === 'fail_permanently' ||
          simulate === 'fail'
        ) {
          throw new Error(
            `Simulated permanent failure for event ${event.eventId}`,
          );
        }

        if (
          simulate === 'fail_then_succeed' ||
          simulate.startsWith('fail_then_succeed:') ||
          simulate.startsWith('fail_then_succeed=') ||
          simulate.startsWith('fail_then_succeed_')
        ) {
          let failAttempts = 1;
          if (
            simulate.includes(':') ||
            simulate.includes('=') ||
            simulate.includes('_')
          ) {
            const part = simulate.split(/[:=_]/)[1];
            const parsed = parseInt(part, 10);
            if (!isNaN(parsed)) {
              failAttempts = Math.max(1, parsed);
            }
          }
          if (attemptNumber <= failAttempts) {
            throw new Error(
              `Simulated transient failure (attempt ${attemptNumber}/${failAttempts}) for event ${event.eventId}`,
            );
          }
        }

        if (
          simulate === 'slow' ||
          simulate.startsWith('slow:') ||
          simulate.startsWith('slow=') ||
          simulate.startsWith('slow_')
        ) {
          let seconds = 5;
          if (
            simulate.includes(':') ||
            simulate.includes('=') ||
            simulate.includes('_')
          ) {
            const part = simulate.split(/[:=_]/)[1];
            const parsed = parseInt(part, 10);
            if (!isNaN(parsed)) {
              seconds = Math.max(0, parsed);
            }
          }
          if (seconds > 0) {
            this.logger.log(
              `[${workerId}] Simulating slow execution (${seconds}s) for event '${event.eventId}'`,
            );
            // Ensure lease covers the slow simulation plus worker lease duration to prevent premature reclaim
            await this.prisma.webhookEvent.update({
              where: { id: event.id },
              data: {
                leaseExpiresAt: getISTDate(
                  new Date(Date.now() + (seconds + this.leaseDurationSeconds) * 1000),
                ),
              },
            });
            await this.sleep(seconds * 1000);
          }
        }
      }

      // Business logic: Idempotent order processing
      if (payload.orderId) {
        const orderIdStr =
          typeof payload.orderId === 'string'
            ? payload.orderId
            : JSON.stringify(payload.orderId);

        await this.prisma.processedOrder.upsert({
          where: { eventId: event.id },
          create: {
            eventId: event.id,
            orderId: orderIdStr,
            processedAt: getISTDate(),
          },
          update: {},
        });
      }

      // Mark attempt as success
      await this.prisma.processingAttempt.update({
        where: { id: attempt.id },
        data: {
          result: 'success',
          finishedAt: getISTDate(),
        },
      });

      // Complete the webhook event and release lease
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'completed',
          totalAttempts: attemptNumber,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: getISTDate(),
        },
      });

      this.logger.log(
        `[${workerId}] Successfully processed event '${event.eventId}'`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[${workerId}] Processing failed for event '${event.eventId}' (Attempt ${attemptNumber}/${maxAttempts}): ${errorMessage}`,
      );

      // Record failure attempt
      await this.prisma.processingAttempt.update({
        where: { id: attempt.id },
        data: {
          result: 'failure',
          error: errorMessage,
          finishedAt: getISTDate(),
        },
      });

      if (retryCycle >= maxAttempts) {
        // Exceeded max attempts: mark as permanently failed
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'failed',
            totalAttempts: attemptNumber,
            cycleAttempts: retryCycle,
            leaseOwner: null,
            leaseToken: null,
            leaseExpiresAt: null,
            lastError: errorMessage,
            updatedAt: getISTDate(),
          },
        });
        this.logger.error(
          `[${workerId}] Event '${event.eventId}' reached max attempts (${maxAttempts}). Marked as failed.`,
        );
      } else {
        // Schedule next attempt with exponential backoff: base 2s * 2^(retryCycle - 1)
        const backoffSeconds = Math.min(300, Math.pow(2, retryCycle - 1) * 2);
        const nextAttemptAt = getISTDate(
          new Date(Date.now() + backoffSeconds * 1000),
        );

        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'pending',
            totalAttempts: attemptNumber,
            cycleAttempts: retryCycle,
            nextAttemptAt,
            leaseOwner: null,
            leaseToken: null,
            leaseExpiresAt: null,
            lastError: errorMessage,
            updatedAt: getISTDate(),
          },
        });

        this.logger.log(
          `[${workerId}] Event '${event.eventId}' rescheduled for retry at ${getISTISOString(nextAttemptAt)} (backoff: ${backoffSeconds}s)`,
        );
      }
    }
  }

  getState(): WorkerState {
    return { ...this.state };
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
