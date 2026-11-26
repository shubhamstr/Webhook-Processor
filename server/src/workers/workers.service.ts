import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';

export interface ClaimedWebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  totalAttempts: number;
  cycleAttempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  receivedAt: Date;
  updatedAt: Date;
}

export interface WorkerState {
  workerId: string;
  status: 'idle' | 'running' | 'stopped';
  startedAt?: Date;
  lastActiveAt?: Date;
  processedCount: number;
  currentEventId: string | null;
}

@Injectable()
export class WorkersService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkersService.name);

  readonly worker1Id: string;
  readonly worker2Id: string;
  private readonly leaseDurationSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly errorBackoffMs: number;
  private readonly autoStart: boolean;

  private isStopped = false;
  private isRunning = false;
  private readonly workerStates = new Map<string, WorkerState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.worker1Id =
      this.configService.get<string>('WORKER_1_ID') || 'worker-1';
    this.worker2Id =
      this.configService.get<string>('WORKER_2_ID') || 'worker-2';
    this.leaseDurationSeconds = Number(
      this.configService.get<number>('WORKER_LEASE_DURATION_SECONDS') || 30,
    );
    this.pollIntervalMs = Number(
      this.configService.get<number>('WORKER_POLL_INTERVAL_MS') || 1000,
    );
    this.errorBackoffMs = Number(
      this.configService.get<number>('WORKER_ERROR_BACKOFF_MS') || 2000,
    );
    // Don't auto-start in test environment unless explicitly specified
    this.autoStart =
      this.configService.get<string>('NODE_ENV') !== 'test' &&
      this.configService.get<string>('WORKERS_ENABLED') !== 'false';

    this.workerStates.set(this.worker1Id, {
      workerId: this.worker1Id,
      status: 'idle',
      processedCount: 0,
      currentEventId: null,
    });
    this.workerStates.set(this.worker2Id, {
      workerId: this.worker2Id,
      status: 'idle',
      processedCount: 0,
      currentEventId: null,
    });
  }

  onApplicationBootstrap() {
    if (this.autoStart) {
      this.startWorkers();
    }
  }

  onApplicationShutdown() {
    this.stopWorkers();
  }

  /**
   * Start both Worker 1 and Worker 2 concurrently
   */
  startWorkers(): void {
    if (this.isRunning) {
      this.logger.warn('Workers are already running.');
      return;
    }

    this.isStopped = false;
    this.isRunning = true;

    this.logger.log(
      `Starting 2 PostgreSQL-backed workers: '${this.worker1Id}' and '${this.worker2Id}'`,
    );

    // Launch Worker 1 with unique ID
    void this.runWorkerLoop(this.worker1Id);

    // Launch Worker 2 with unique ID
    void this.runWorkerLoop(this.worker2Id);
  }

  /**
   * Stop workers gracefully
   */
  stopWorkers(): void {
    this.logger.log('Stopping all workers gracefully...');
    this.isStopped = true;
    this.isRunning = false;
  }

  /**
   * Worker continuous execution loop containing while (true)
   * Continuously polls and claims pending webhook events.
   */
  async runWorkerLoop(workerId: string): Promise<void> {
    this.logger.log(`[${workerId}] PostgreSQL worker loop started.`);
    const state = this.workerStates.get(workerId);
    if (state) {
      state.status = 'running';
      state.startedAt = new Date();
    }

    while (true) {
      if (this.isStopped) {
        this.logger.log(`[${workerId}] Stop signal detected, exiting loop.`);
        break;
      }

      try {
        const event = await this.claimWebhookEvent(workerId);

        if (event) {
          if (state) {
            state.currentEventId = event.eventId;
          }
          this.logger.log(
            `[${workerId}] Claimed event '${event.eventId}' (ID: ${event.id}, Status: ${event.status})`,
          );

          await this.processEvent(event, workerId);

          if (state) {
            state.processedCount++;
            state.currentEventId = null;
            state.lastActiveAt = new Date();
          }
        } else {
          // No pending/claimable event available, pause before polling again
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

    if (state) {
      state.status = 'stopped';
      state.currentEventId = null;
    }
    this.logger.log(`[${workerId}] PostgreSQL worker loop terminated.`);
  }

  /**
   * Claim next eligible webhook event from PostgreSQL:
   * 1. Status is 'pending' OR 'processing' with expired lease (lease_expires_at < NOW())
   * 2. next_attempt_at is NULL OR next_attempt_at <= NOW()
   * 3. Row locked with FOR UPDATE SKIP LOCKED to prevent duplicate claims
   * 4. Updates status to 'processing', sets lease_owner to workerId, lease_token, and lease_expires_at
   */
  async claimWebhookEvent(
    workerId: string,
    leaseDurationSeconds = this.leaseDurationSeconds,
  ): Promise<ClaimedWebhookEvent | null> {
    const leaseToken = randomUUID();

    const results = await this.prisma.$queryRaw<ClaimedWebhookEvent[]>`
      WITH candidate AS (
        SELECT id
        FROM webhook_events
        WHERE (
          status = 'pending'
          OR (status = 'processing' AND lease_expires_at < NOW())
        )
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY received_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE webhook_events w
      SET 
        status = 'processing',
        lease_owner = ${workerId},
        lease_token = ${leaseToken}::uuid,
        lease_expires_at = NOW() + (${leaseDurationSeconds} || ' seconds')::interval,
        updated_at = NOW()
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
    workerId: string,
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
        startedAt: new Date(),
      },
    });

    try {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const simulate = payload.simulate as string | undefined;

      // Handle test simulation flags
      if (simulate) {
        if (simulate === 'crash') {
          this.logger.warn(
            `[${workerId}] Simulating worker crash on event '${event.eventId}'. Lease will expire and be recovered.`,
          );
          // Worker crashes: do not complete event, leave lease to expire
          return;
        }

        if (simulate === 'fail_permanently' || simulate === 'fail') {
          throw new Error(
            `Simulated permanent failure for event ${event.eventId}`,
          );
        }

        if (simulate.startsWith('fail_then_succeed:')) {
          const failAttempts = parseInt(simulate.split(':')[1], 10) || 1;
          if (attemptNumber <= failAttempts) {
            throw new Error(
              `Simulated transient failure (attempt ${attemptNumber}/${failAttempts}) for event ${event.eventId}`,
            );
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
            processedAt: new Date(),
          },
          update: {},
        });
      }

      // Mark attempt as success
      await this.prisma.processingAttempt.update({
        where: { id: attempt.id },
        data: {
          result: 'success',
          finishedAt: new Date(),
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
          updatedAt: new Date(),
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
          finishedAt: new Date(),
        },
      });

      if (attemptNumber >= maxAttempts) {
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
            updatedAt: new Date(),
          },
        });
        this.logger.error(
          `[${workerId}] Event '${event.eventId}' reached max attempts (${maxAttempts}). Marked as failed.`,
        );
      } else {
        // Schedule next attempt with exponential backoff: base 2s * 2^(retryCycle - 1)
        const backoffSeconds = Math.min(300, Math.pow(2, retryCycle - 1) * 2);
        const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

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
            updatedAt: new Date(),
          },
        });

        this.logger.log(
          `[${workerId}] Event '${event.eventId}' rescheduled for retry at ${nextAttemptAt.toISOString()} (backoff: ${backoffSeconds}s)`,
        );
      }
    }
  }

  /**
   * Get current workers status
   */
  getWorkersStatus(): {
    isRunning: boolean;
    workers: WorkerState[];
  } {
    return {
      isRunning: this.isRunning,
      workers: Array.from(this.workerStates.values()),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
