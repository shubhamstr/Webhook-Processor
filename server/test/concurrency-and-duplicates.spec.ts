/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { CreateWebhookDto } from '../src/webhooks/dto';
import {
  WorkersService,
  Worker1Service,
  Worker2Service,
  ClaimedWebhookEvent,
} from '../src/workers';

describe('Concurrency and Duplicate Processing', () => {
  let webhooksService: WebhooksService;
  let workersService: WorkersService;

  const mockPrismaService = {
    $queryRaw: jest.fn<any>(),
    webhookEvent: {
      findUnique: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
    },
    processingAttempt: {
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    processedOrder: {
      upsert: jest.fn<any>(),
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
        WebhooksService,
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

    webhooksService = module.get<WebhooksService>(WebhooksService);
    workersService = module.get<WorkersService>(WorkersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    workersService.stopWorkers();
  });

  describe('Duplicate Processing & Idempotency', () => {
    const duplicateDto: CreateWebhookDto = {
      eventId: 'evt_order_created_1001',
      type: 'order.created',
      data: {
        orderId: 'ORD-1001',
        amount: 250,
      },
    };

    it('should detect duplicate delivery, preserve existing event, and ignore new payload', async () => {
      const existingEvent = {
        id: 'uuid-existing-event',
        eventId: duplicateDto.eventId,
        eventType: duplicateDto.type,
        payload: { orderId: 'ORD-1001', amount: 200 },
        status: 'completed',
        totalAttempts: 1,
      };

      mockPrismaService.webhookEvent.findUnique.mockResolvedValueOnce(existingEvent);

      const response = await webhooksService.ingestWebhook(duplicateDto);

      // Verify idempotency pre-check
      expect(mockPrismaService.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: duplicateDto.eventId },
      });

      // Crucial: create should NOT be called since the event already exists
      expect(mockPrismaService.webhookEvent.create).not.toHaveBeenCalled();

      // Should return 202 accepted contract with matching eventId
      expect(response).toEqual({
        status: 'accepted',
        eventId: duplicateDto.eventId,
      });
    });

    it('should handle concurrent duplicate delivery race condition gracefully when unique constraint fails (P2002)', async () => {
      // Both requests pass the findUnique check concurrently
      mockPrismaService.webhookEvent.findUnique.mockResolvedValueOnce(null);

      // Prisma throws P2002 (Unique constraint failed on event_id) during race insert
      const prismaUniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`event_id`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );
      mockPrismaService.webhookEvent.create.mockRejectedValueOnce(prismaUniqueError);

      const response = await webhooksService.ingestWebhook(duplicateDto);

      expect(mockPrismaService.webhookEvent.create).toHaveBeenCalled();
      // Should handle P2002 gracefully without crashing and return accepted status
      expect(response).toEqual({
        status: 'accepted',
        eventId: duplicateDto.eventId,
      });
    });

    it('should ensure idempotent order processing at worker level via upsert', async () => {
      const claimedEvent: ClaimedWebhookEvent = {
        id: 'uuid-event-dup-1',
        eventId: 'evt_order_created_1001',
        eventType: 'order.created',
        payload: { orderId: 'ORD-1001', customerId: 'CUST-99' },
        status: 'processing',
        totalAttempts: 1,
        cycleAttempts: 1,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-alpha',
        leaseToken: 'token-uuid',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.processingAttempt.create.mockResolvedValueOnce({
        id: 'attempt-id-1',
        attemptNumber: 1,
      });
      mockPrismaService.processedOrder.upsert.mockResolvedValueOnce({
        eventId: claimedEvent.id,
        orderId: 'ORD-1001',
      });
      mockPrismaService.processingAttempt.update.mockResolvedValueOnce({});
      mockPrismaService.webhookEvent.update.mockResolvedValueOnce({});

      // Process event first time
      await workersService.processEvent(claimedEvent, 'worker-alpha');

      // Verify upsert was used with eventId as key to prevent duplicate orders
      expect(mockPrismaService.processedOrder.upsert).toHaveBeenCalledWith({
        where: { eventId: claimedEvent.id },
        create: expect.objectContaining({
          eventId: claimedEvent.id,
          orderId: 'ORD-1001',
        }),
        update: {},
      });
      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: claimedEvent.id },
          data: expect.objectContaining({
            status: 'completed',
          }),
        }),
      );
    });
  });

  describe('Concurrency & Non-Overlapping Worker Claims', () => {
    it('should atomically claim non-overlapping events across concurrent workers', async () => {
      const eventForWorker1: ClaimedWebhookEvent = {
        id: 'uuid-event-1',
        eventId: 'evt_concurrent_01',
        eventType: 'order.created',
        payload: { orderId: 'ORD-1' },
        status: 'processing',
        totalAttempts: 0,
        cycleAttempts: 0,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-alpha',
        leaseToken: 'token-alpha-123',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };

      const eventForWorker2: ClaimedWebhookEvent = {
        id: 'uuid-event-2',
        eventId: 'evt_concurrent_02',
        eventType: 'order.created',
        payload: { orderId: 'ORD-2' },
        status: 'processing',
        totalAttempts: 0,
        cycleAttempts: 0,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-beta',
        leaseToken: 'token-beta-456',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock atomic FOR UPDATE SKIP LOCKED behavior:
      // Worker 1 and Worker 2 poll concurrently, each getting a unique row
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([eventForWorker1])
        .mockResolvedValueOnce([eventForWorker2]);

      const [claim1, claim2] = await Promise.all([
        workersService.claimWebhookEvent('worker-alpha'),
        workersService.claimWebhookEvent('worker-beta'),
      ]);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);

      // Verify each worker received a distinct, non-overlapping event
      expect(claim1?.id).not.toBe(claim2?.id);
      expect(claim1?.eventId).toBe('evt_concurrent_01');
      expect(claim1?.leaseOwner).toBe('worker-alpha');
      expect(claim2?.eventId).toBe('evt_concurrent_02');
      expect(claim2?.leaseOwner).toBe('worker-beta');
    });

    it('should ensure that when only one event is available, only one worker claims it and the other receives null', async () => {
      const singleEvent: ClaimedWebhookEvent = {
        id: 'uuid-single-event',
        eventId: 'evt_contended_01',
        eventType: 'order.created',
        payload: { orderId: 'ORD-SOLO' },
        status: 'processing',
        totalAttempts: 0,
        cycleAttempts: 0,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-alpha',
        leaseToken: 'token-solo-789',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };

      // Worker 1 locks the row with FOR UPDATE; Worker 2 skips the locked row and gets []
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([singleEvent])
        .mockResolvedValueOnce([]);

      const [claim1, claim2] = await Promise.all([
        workersService.claimWebhookEvent('worker-alpha'),
        workersService.claimWebhookEvent('worker-beta'),
      ]);

      expect(claim1).toEqual(singleEvent);
      expect(claim2).toBeNull();
    });
  });
});
