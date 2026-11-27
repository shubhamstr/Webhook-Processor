/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma';
import {
  WorkersService,
  Worker1Service,
  Worker2Service,
  ClaimedWebhookEvent,
} from '../src/workers';

describe('Retries and Crash Recovery', () => {
  let workersService: WorkersService;

  const mockPrismaService = {
    $queryRaw: jest.fn<any>(),
    processingAttempt: {
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    processedOrder: {
      upsert: jest.fn<any>(),
    },
    webhookEvent: {
      update: jest.fn<any>(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'WORKER_1_ID') return 'worker-alpha';
      if (key === 'WORKER_2_ID') return 'worker-beta';
      if (key === 'WORKER_LEASE_DURATION_SECONDS') return 30;
      if (key === 'WORKER_POLL_INTERVAL_MS') return 10;
      if (key === 'WORKER_ERROR_BACKOFF_MS') return 10;
      if (key === 'WORKERS_ENABLED') return 'false';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        Worker1Service,
        Worker2Service,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    workersService = module.get<WorkersService>(WorkersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    workersService.stopWorkers();
  });

  describe('Retries with Exponential Backoff', () => {
    const baseEvent: ClaimedWebhookEvent = {
      id: 'uuid-retry-event',
      eventId: 'evt_retry_test_01',
      eventType: 'payment.failed',
      payload: { orderId: 'ORD-RETRY', simulate: 'fail' },
      status: 'processing',
      totalAttempts: 0,
      cycleAttempts: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      leaseOwner: 'worker-alpha',
      leaseToken: 'token-retry-123',
      leaseExpiresAt: new Date(Date.now() + 30000),
      lastError: null,
      receivedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should record failed attempt and reschedule event with exponential backoff', async () => {
      mockPrismaService.processingAttempt.create.mockResolvedValueOnce({
        id: 'attempt-id-retry-1',
        attemptNumber: 1,
      });
      mockPrismaService.processingAttempt.update.mockResolvedValueOnce({});
      mockPrismaService.webhookEvent.update.mockResolvedValueOnce({});

      await workersService.processEvent(baseEvent, 'worker-alpha');

      // 1. Failure attempt recorded
      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-id-retry-1' },
        data: expect.objectContaining({
          result: 'failure',
          error: expect.stringContaining('Simulated permanent failure'),
        }),
      });

      // 2. Event rescheduled with exponential backoff: nextAttemptAt scheduled and lease released
      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: baseEvent.id },
        data: expect.objectContaining({
          status: 'pending',
          totalAttempts: 1,
          cycleAttempts: 1,
          nextAttemptAt: expect.any(Date),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      });
    });

    it('should permanently transition event to failed when maxAttempts is reached', async () => {
      const exhaustedEvent: ClaimedWebhookEvent = {
        ...baseEvent,
        totalAttempts: 4,
        cycleAttempts: 4,
        maxAttempts: 5,
      };

      mockPrismaService.processingAttempt.create.mockResolvedValueOnce({
        id: 'attempt-id-retry-5',
        attemptNumber: 5,
      });
      mockPrismaService.processingAttempt.update.mockResolvedValueOnce({});
      mockPrismaService.webhookEvent.update.mockResolvedValueOnce({});

      await workersService.processEvent(exhaustedEvent, 'worker-alpha');

      // After 5 attempts, event is not rescheduled; status becomes 'failed'
      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: exhaustedEvent.id },
        data: expect.objectContaining({
          status: 'failed',
          totalAttempts: 5,
          cycleAttempts: 5,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: expect.any(String),
        }),
      });
    });

    it('should succeed after retry when transient error resolves (fail_then_succeed)', async () => {
      const transientEvent: ClaimedWebhookEvent = {
        ...baseEvent,
        totalAttempts: 1,
        cycleAttempts: 1,
        payload: { orderId: 'ORD-TRANSIENT', simulate: 'fail_then_succeed:1' },
      };

      // Prior attempt exists from cycle 1
      mockPrismaService.processingAttempt.findMany.mockResolvedValueOnce([]); // unfinalized
      mockPrismaService.processingAttempt.findMany.mockResolvedValueOnce([
        { attemptNumber: 1, retryCycle: 1 },
      ]); // existing

      mockPrismaService.processingAttempt.create.mockResolvedValueOnce({
        id: 'attempt-id-retry-2',
        attemptNumber: 2,
      });
      mockPrismaService.processedOrder.upsert.mockResolvedValueOnce({});
      mockPrismaService.processingAttempt.update.mockResolvedValueOnce({});
      mockPrismaService.webhookEvent.update.mockResolvedValueOnce({});

      await workersService.processEvent(transientEvent, 'worker-alpha');

      // Attempt 2 succeeds because fail_then_succeed:1 only fails for attempt <= 1
      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-id-retry-2' },
        data: expect.objectContaining({
          result: 'success',
        }),
      });

      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: transientEvent.id },
        data: expect.objectContaining({
          status: 'completed',
          totalAttempts: 2,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      });
    });
  });

  describe('Crash Recovery & Expired Lease Reclaiming', () => {
    it('should reclaim expired lease from crashed worker, finalize abandoned attempt, and complete processing', async () => {
      const recoveredEvent: ClaimedWebhookEvent = {
        id: 'uuid-crashed-event',
        eventId: 'evt_crashed_recovery_99',
        eventType: 'order.created',
        payload: { orderId: 'ORD-CRASH-RECOVER' },
        status: 'processing',
        totalAttempts: 1,
        cycleAttempts: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-beta', // Newly claimed by worker-beta
        leaseToken: 'token-beta-new',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(Date.now() - 60000),
        updatedAt: new Date(),
      };

      // Unfinalized attempt left behind by the crashed worker
      const abandonedAttempt = {
        id: 'attempt-crashed-worker-1',
        eventId: recoveredEvent.id,
        attemptNumber: 1,
        retryCycle: 1,
        workerId: 'worker-crashed-pid-1234',
        startedAt: new Date(Date.now() - 120000),
        finishedAt: null,
        result: null,
        error: null,
      };

      // Mock detection of unfinalized attempts, then query for max attempt numbers
      mockPrismaService.processingAttempt.findMany
        .mockResolvedValueOnce([abandonedAttempt]) // Check for abandoned attempts
        .mockResolvedValueOnce([abandonedAttempt]); // Check for max previous attempt

      mockPrismaService.processingAttempt.create.mockResolvedValueOnce({
        id: 'attempt-recovering-worker-2',
        attemptNumber: 2,
      });
      mockPrismaService.processedOrder.upsert.mockResolvedValueOnce({});
      mockPrismaService.processingAttempt.update.mockResolvedValue({});
      mockPrismaService.webhookEvent.update.mockResolvedValueOnce({});

      // Recovering worker (worker-beta) takes over
      await workersService.processEvent(recoveredEvent, 'worker-beta');

      // 1. Verify the crashed worker's abandoned attempt was cleaned up and marked as failure
      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt-crashed-worker-1' },
          data: expect.objectContaining({
            result: 'failure',
            error: expect.stringContaining('crashed or lease expired'),
          }),
        }),
      );

      // 2. Verify new attempt was started with properly incremented attemptNumber (2)
      expect(mockPrismaService.processingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: recoveredEvent.id,
            attemptNumber: 2,
            workerId: 'worker-beta',
          }),
        }),
      );

      // 3. Verify event is now completed successfully
      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: recoveredEvent.id },
          data: expect.objectContaining({
            status: 'completed',
            totalAttempts: 2,
            leaseOwner: null,
            leaseToken: null,
          }),
        }),
      );
    });
  });
});
