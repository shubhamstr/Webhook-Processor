/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma';
import { Worker2Service } from '../src/workers/worker-2.service';
import { ClaimedWebhookEvent } from '../src/workers/worker.types';

describe('Worker2Service', () => {
  let service: Worker2Service;

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
      if (key === 'WORKER_2_ID') return 'custom-worker-2';
      if (key === 'WORKER_LEASE_DURATION_SECONDS') return 30;
      if (key === 'WORKER_POLL_INTERVAL_MS') return 10;
      if (key === 'WORKER_ERROR_BACKOFF_MS') return 10;
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Worker2Service,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<Worker2Service>(Worker2Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.stop();
  });

  it('should be defined and initialize with configured WORKER_2_ID', () => {
    expect(service).toBeDefined();
    expect(service.workerId).toBe('custom-worker-2');
    expect(service.workerName).toBe('Worker-2');

    const state = service.getState();
    expect(state.workerId).toBe('custom-worker-2');
    expect(state.status).toBe('idle');
    expect(state.processedCount).toBe(0);
  });

  it('should atomically claim a pending event for worker 2', async () => {
    const mockClaimedEvent: ClaimedWebhookEvent = {
      id: 'e3b0c442-98fc-1c14-9afb-4c7b8e1f0002',
      eventId: 'evt_w2_test',
      eventType: 'order.updated',
      payload: { orderId: 'ORD-W2' },
      status: 'processing',
      totalAttempts: 0,
      cycleAttempts: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      leaseOwner: 'custom-worker-2',
      leaseToken: 'token-uuid-2',
      leaseExpiresAt: new Date(Date.now() + 30000),
      lastError: null,
      receivedAt: new Date(),
      updatedAt: new Date(),
    };

    (mockPrismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
      mockClaimedEvent,
    ]);

    const result = await service.claimWebhookEvent();

    expect(result).toEqual(mockClaimedEvent);
    expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('should process event and record worker 2 in processingAttempt', async () => {
    const sampleEvent: ClaimedWebhookEvent = {
      id: 'e3b0c442-98fc-1c14-9afb-4c7b8e1f0002',
      eventId: 'evt_w2_process',
      eventType: 'order.updated',
      payload: { orderId: 'ORD-W2-200' },
      status: 'processing',
      totalAttempts: 0,
      cycleAttempts: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      leaseOwner: 'custom-worker-2',
      leaseToken: 'token-uuid-2',
      leaseExpiresAt: new Date(Date.now() + 30000),
      lastError: null,
      receivedAt: new Date(),
      updatedAt: new Date(),
    };

    (
      mockPrismaService.processingAttempt.create as jest.Mock
    ).mockResolvedValueOnce({
      id: 'att-2',
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

    await service.processEvent(sampleEvent);

    expect(mockPrismaService.processingAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: sampleEvent.id,
          workerId: 'custom-worker-2',
        }),
      }),
    );
  });

  it('should start and stop worker 2 loop independently', async () => {
    (mockPrismaService.$queryRaw as jest.Mock).mockResolvedValue([]);

    service.start();
    expect(service.getIsRunning()).toBe(true);

    service.stop();
    expect(service.getIsRunning()).toBe(false);
  });
});
