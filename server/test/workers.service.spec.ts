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

describe('WorkersService', () => {
  let service: WorkersService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    processingAttempt: {
      create: jest.fn(),
      update: jest.fn(),
    },
    processedOrder: {
      upsert: jest.fn(),
    },
    webhookEvent: {
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'WORKER_1_ID') return 'worker-alpha';
      if (key === 'WORKER_2_ID') return 'worker-beta';
      if (key === 'WORKER_LEASE_DURATION_SECONDS') return 30;
      if (key === 'WORKER_POLL_INTERVAL_MS') return 10;
      if (key === 'WORKER_ERROR_BACKOFF_MS') return 10;
      if (key === 'WORKERS_ENABLED') return 'false'; // disable autostart in tests
      if (key === 'NODE_ENV') return 'test';
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

    service = module.get<WorkersService>(WorkersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.stopWorkers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize 2 workers with unique IDs', () => {
    expect(service.worker1Id).toBe('worker-alpha');
    expect(service.worker2Id).toBe('worker-beta');
    expect(service.worker1Id).not.toBe(service.worker2Id);

    const status = service.getWorkersStatus();
    expect(status.workers).toHaveLength(2);
    expect(status.workers[0].workerId).toBe('worker-alpha');
    expect(status.workers[1].workerId).toBe('worker-beta');
  });

  describe('claimWebhookEvent', () => {
    const mockClaimedEvent: ClaimedWebhookEvent = {
      id: 'e3b0c442-98fc-1c14-9afb-4c7b8e1f0001',
      eventId: 'evt_pending_1',
      eventType: 'order.created',
      payload: { orderId: 'ORD-100', customerId: 'CUS-1' },
      status: 'processing',
      totalAttempts: 0,
      cycleAttempts: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      leaseOwner: 'worker-alpha',
      leaseToken: 'b0a8a8fc-6e54-4458-9a2f-eec711d99999',
      leaseExpiresAt: new Date(Date.now() + 30000),
      lastError: null,
      receivedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should atomically claim a pending event and lock it with a lease', async () => {
      (mockPrismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        mockClaimedEvent,
      ]);

      const result = await service.claimWebhookEvent('worker-alpha');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockClaimedEvent);
      expect(result?.leaseOwner).toBe('worker-alpha');
      expect(result?.status).toBe('processing');
    });

    it('should return null when no pending or expired events are available', async () => {
      (mockPrismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.claimWebhookEvent('worker-alpha');

      expect(result).toBeNull();
    });

    it('should parse JSON string payload if returned by driver as string', async () => {
      const rawStringEvent = {
        ...mockClaimedEvent,
        payload: JSON.stringify({ orderId: 'ORD-STRING' }),
      };
      (mockPrismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        rawStringEvent,
      ]);

      const result = await service.claimWebhookEvent('worker-alpha');

      expect(result?.payload).toEqual({ orderId: 'ORD-STRING' });
    });
  });

  describe('processEvent', () => {
    const sampleEvent: ClaimedWebhookEvent = {
      id: 'e3b0c442-98fc-1c14-9afb-4c7b8e1f0001',
      eventId: 'evt_123',
      eventType: 'order.created',
      payload: { orderId: 'ORD-999' },
      status: 'processing',
      totalAttempts: 0,
      cycleAttempts: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      leaseOwner: 'worker-alpha',
      leaseToken: 'b0a8a8fc-6e54-4458-9a2f-eec711d99999',
      leaseExpiresAt: new Date(Date.now() + 30000),
      lastError: null,
      receivedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully process event, insert processedOrder, and complete event', async () => {
      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-1',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processedOrder.upsert as jest.Mock
      ).mockResolvedValueOnce({
        eventId: sampleEvent.id,
        orderId: 'ORD-999',
      });
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      await service.processEvent(sampleEvent, 'worker-alpha');

      expect(mockPrismaService.processingAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: sampleEvent.id,
            attemptNumber: 1,
            workerId: 'worker-alpha',
          }),
        }),
      );

      expect(mockPrismaService.processedOrder.upsert).toHaveBeenCalledWith({
        where: { eventId: sampleEvent.id },
        create: expect.objectContaining({
          eventId: sampleEvent.id,
          orderId: 'ORD-999',
        }),
        update: {},
      });

      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-1' },
        data: expect.objectContaining({
          result: 'success',
        }),
      });

      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: sampleEvent.id },
        data: expect.objectContaining({
          status: 'completed',
          totalAttempts: 1,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      });
    });

    it('should handle failure and reschedule with exponential backoff if below maxAttempts', async () => {
      const failingEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        payload: { orderId: 'ORD-FAIL', simulate: 'fail' },
      };

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-2',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      await service.processEvent(failingEvent, 'worker-alpha');

      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-2' },
        data: expect.objectContaining({
          result: 'failure',
        }),
      });

      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: sampleEvent.id },
        data: expect.objectContaining({
          status: 'pending',
          totalAttempts: 1,
          cycleAttempts: 1,
          nextAttemptAt: expect.any(Date),
          leaseOwner: null,
          leaseToken: null,
        }),
      });
    });

    it('should mark event as permanently failed if reaching maxAttempts', async () => {
      const maxedEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        totalAttempts: 4,
        cycleAttempts: 4,
        maxAttempts: 5,
        payload: { orderId: 'ORD-FAIL-MAX', simulate: 'fail' },
      };

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-3',
        attemptNumber: 5,
      });
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      await service.processEvent(maxedEvent, 'worker-alpha');

      expect(mockPrismaService.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: sampleEvent.id },
        data: expect.objectContaining({
          status: 'failed',
          totalAttempts: 5,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      });
    });

    it('should simulate crash and leave lease intact for lease expiry recovery', async () => {
      const crashEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        payload: { orderId: 'ORD-CRASH', simulate: 'crash' },
      };

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-4',
        attemptNumber: 1,
      });

      await service.processEvent(crashEvent, 'worker-alpha');

      // The attempt should be created, but neither completed nor failed update should happen to the event
      expect(mockPrismaService.webhookEvent.update).not.toHaveBeenCalled();
    });

    it('should handle simulate=always_fail by throwing and marking attempt as failure', async () => {
      const alwaysFailEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        payload: { orderId: 'ORD-ALWAYS-FAIL', simulate: 'always_fail' },
      };

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-5',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      await service.processEvent(alwaysFailEvent, 'worker-alpha');

      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-5' },
        data: expect.objectContaining({
          result: 'failure',
          error: expect.stringContaining('Simulated permanent failure'),
        }),
      });
    });

    it('should handle simulate=slow:N and succeed after delay', async () => {
      const slowEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        payload: { orderId: 'ORD-SLOW', simulate: 'slow:0' },
      };

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-6',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processedOrder.upsert as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      await service.processEvent(slowEvent, 'worker-alpha');

      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-6' },
        data: expect.objectContaining({
          result: 'success',
        }),
      });
    });

    it('should handle simulate=slow without number and default to 5s delay', async () => {
      const slowEvent: ClaimedWebhookEvent = {
        ...sampleEvent,
        payload: { orderId: 'ORD-SLOW-DEFAULT', simulate: 'slow' },
      };

      // Mock sleep on the underlying worker to avoid 5 second test stall
      const worker = service.getWorker('worker-alpha');
      jest.spyOn(worker as any, 'sleep').mockResolvedValueOnce(undefined);

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'attempt-uuid-slow-default',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processedOrder.upsert as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValue({
        id: sampleEvent.id,
      });

      await service.processEvent(slowEvent, 'worker-alpha');

      expect(mockPrismaService.processingAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-slow-default' },
        data: expect.objectContaining({
          result: 'success',
        }),
      });
    });
  });

  describe('worker loop execution', () => {
    it('should run while(true) loop, claim events, and exit on stop', async () => {
      const mockEvent: ClaimedWebhookEvent = {
        id: 'e3b0c442-98fc-1c14-9afb-4c7b8e1f0001',
        eventId: 'evt_loop_1',
        eventType: 'order.created',
        payload: { orderId: 'ORD-LOOP' },
        status: 'processing',
        totalAttempts: 0,
        cycleAttempts: 0,
        maxAttempts: 5,
        nextAttemptAt: null,
        leaseOwner: 'worker-alpha',
        leaseToken: 'token-uuid',
        leaseExpiresAt: new Date(Date.now() + 30000),
        lastError: null,
        receivedAt: new Date(),
        updatedAt: new Date(),
      };

      // First call claims an event, second call returns null
      (mockPrismaService.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([mockEvent])
        .mockResolvedValueOnce([]);

      (
        mockPrismaService.processingAttempt.create as jest.Mock
      ).mockResolvedValueOnce({
        id: 'att-1',
        attemptNumber: 1,
      });
      (
        mockPrismaService.processedOrder.upsert as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.processingAttempt.update as jest.Mock
      ).mockResolvedValueOnce({});
      (
        mockPrismaService.webhookEvent.update as jest.Mock
      ).mockResolvedValueOnce({});

      // Start worker loop in background
      const loopPromise = service.runWorkerLoop('worker-alpha');

      // Let it execute a cycle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Stop workers
      service.stopWorkers();
      await loopPromise;

      const status = service.getWorkersStatus();
      const workerState = status.workers.find(
        (w) => w.workerId === 'worker-alpha',
      );
      expect(workerState?.processedCount).toBeGreaterThanOrEqual(1);
      expect(workerState?.status).toBe('stopped');
    });

    it('should start both workers with startWorkers() and update isRunning state', () => {
      jest.spyOn(service, 'runWorkerLoop').mockImplementation(async () => {});

      service.startWorkers();
      const status = service.getWorkersStatus();

      expect(status.isRunning).toBe(true);
      expect(service.runWorkerLoop).toHaveBeenCalledWith('worker-alpha');
      expect(service.runWorkerLoop).toHaveBeenCalledWith('worker-beta');
    });
  });
});
