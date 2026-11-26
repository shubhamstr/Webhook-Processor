/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma';
import { EventsService } from '../src/events/events.service';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    webhookEvent: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    processingAttempt: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should query events with default pagination and return paginated result', async () => {
      const mockEvents = [
        {
          id: 'uuid-1',
          eventId: 'evt_100',
          eventType: 'order.created',
          payload: { orderId: 'ORD-100', customerId: 'CUS-1' },
          status: 'pending',
          totalAttempts: 0,
          cycleAttempts: 0,
          maxAttempts: 5,
          nextAttemptAt: null,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
          receivedAt: new Date('2026-11-26T10:00:00Z'),
          updatedAt: new Date('2026-11-26T10:00:00Z'),
          processingAttempts: [],
          processedOrder: null,
        },
      ];

      mockPrismaService.webhookEvent.count.mockResolvedValue(1);
      mockPrismaService.webhookEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.findAll({});

      expect(prisma.webhookEvent.count).toHaveBeenCalledWith({ where: {} });
      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { receivedAt: 'desc' },
        include: {
          processingAttempts: {
            orderBy: { attemptNumber: 'asc' },
          },
          processedOrder: true,
        },
      });

      expect(result).toEqual({
        data: mockEvents,
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    });

    it('should apply filters for status, eventType, orderId, customerId, search, and date range', async () => {
      mockPrismaService.webhookEvent.count.mockResolvedValue(0);
      mockPrismaService.webhookEvent.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-11-20T00:00:00Z');
      const endDate = new Date('2026-11-26T00:00:00Z');

      await service.findAll({
        page: 2,
        limit: 5,
        status: 'completed',
        type: 'order.created',
        orderId: 'ORD-555',
        customerId: 'CUS-99',
        search: 'keyword',
        startDate,
        endDate,
        sortBy: 'status',
        sortOrder: 'asc',
      });

      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { status: { equals: 'completed', mode: 'insensitive' } },
            { eventType: { equals: 'order.created', mode: 'insensitive' } },
            {
              OR: [
                {
                  payload: {
                    path: ['orderId'],
                    string_contains: 'ORD-555',
                  },
                },
                {
                  processedOrder: {
                    orderId: {
                      contains: 'ORD-555',
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            },
            {
              payload: {
                path: ['customerId'],
                string_contains: 'CUS-99',
              },
            },
            {
              OR: [
                { eventId: { contains: 'keyword', mode: 'insensitive' } },
                { eventType: { contains: 'keyword', mode: 'insensitive' } },
                { lastError: { contains: 'keyword', mode: 'insensitive' } },
              ],
            },
            {
              receivedAt: {
                gte: startDate,
                lte: endDate,
              },
            },
          ],
        },
        skip: 5,
        take: 5,
        orderBy: { status: 'asc' },
        include: {
          processingAttempts: {
            orderBy: { attemptNumber: 'asc' },
          },
          processedOrder: true,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return event by eventId string', async () => {
      const mockEvent = {
        id: '992a54fb-5246-4ad1-a96c-b26a6dbbb0fa',
        eventId: 'evt_custom_1',
        eventType: 'order.created',
        status: 'pending',
      };

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockEvent);

      const result = await service.findOne('evt_custom_1');

      expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
        where: { eventId: 'evt_custom_1' },
        include: {
          processingAttempts: {
            orderBy: { attemptNumber: 'asc' },
          },
          processedOrder: true,
        },
      });
      expect(result).toEqual(mockEvent);
    });

    it('should return event by UUID string', async () => {
      const uuid = '992a54fb-5246-4ad1-a96c-b26a6dbbb0fa';
      const mockEvent = {
        id: uuid,
        eventId: 'evt_custom_1',
        eventType: 'order.created',
        status: 'pending',
      };

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockEvent);

      const result = await service.findOne(uuid);

      expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: uuid }, { eventId: uuid }],
        },
        include: {
          processingAttempts: {
            orderBy: { attemptNumber: 'asc' },
          },
          processedOrder: true,
        },
      });
      expect(result).toEqual(mockEvent);
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(null);

      await expect(service.findOne('evt_non_existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAttempts', () => {
    it('should return attempts for event by eventId string', async () => {
      const mockEvent = { id: '992a54fb-5246-4ad1-a96c-b26a6dbbb0fa' };
      const mockAttempts = [
        {
          id: 'attempt-1',
          eventId: mockEvent.id,
          attemptNumber: 1,
          retryCycle: 1,
          workerId: 'worker-1',
          startedAt: new Date('2026-11-26T10:00:00Z'),
          finishedAt: new Date('2026-11-26T10:00:01Z'),
          result: 'failure',
          error: 'Timeout error',
        },
        {
          id: 'attempt-2',
          eventId: mockEvent.id,
          attemptNumber: 2,
          retryCycle: 1,
          workerId: 'worker-2',
          startedAt: new Date('2026-11-26T10:01:00Z'),
          finishedAt: new Date('2026-11-26T10:01:01Z'),
          result: 'success',
          error: null,
        },
      ];

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrismaService.processingAttempt.findMany.mockResolvedValue(mockAttempts);

      const result = await service.findAttempts('evt_custom_1');

      expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
        where: { eventId: 'evt_custom_1' },
        select: expect.objectContaining({ id: true }),
      });
      expect(prisma.processingAttempt.findMany).toHaveBeenCalledWith({
        where: { eventId: mockEvent.id },
        orderBy: [{ attemptNumber: 'asc' }, { startedAt: 'asc' }],
      });
      expect(result).toEqual(mockAttempts);
    });

    it('should throw NotFoundException if event does not exist when fetching attempts', async () => {
      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(null);

      await expect(service.findAttempts('evt_non_existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return all recorded attempt history without discarding attempts', async () => {
      const mockEvent = { id: '992a54fb-5246-4ad1-a96c-b26a6dbbb0fa' };
      const mockAttempts = [
        {
          id: 'attempt-1',
          eventId: mockEvent.id,
          attemptNumber: 1,
          retryCycle: 1,
          workerId: 'worker-1',
          startedAt: new Date('2026-11-26T10:00:00Z'),
          finishedAt: new Date('2026-11-26T10:00:01Z'),
          result: 'failure',
          error: 'Worker crashed or lease expired before completion',
        },
        {
          id: 'attempt-2',
          eventId: mockEvent.id,
          attemptNumber: 2,
          retryCycle: 1,
          workerId: 'worker-2',
          startedAt: new Date('2026-11-26T10:01:00Z'),
          finishedAt: new Date('2026-11-26T10:01:01Z'),
          result: 'success',
          error: null,
        },
      ];

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrismaService.processingAttempt.findMany.mockResolvedValue(mockAttempts);

      const result = await service.findAttempts('evt_custom_1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('attempt-1');
      expect(result[1].id).toBe('attempt-2');
    });
  });

  describe('getStats', () => {
    it('should return aggregated counts for events', async () => {
      mockPrismaService.webhookEvent.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(15) // pending
        .mockResolvedValueOnce(5) // processing
        .mockResolvedValueOnce(25) // completed
        .mockResolvedValueOnce(5); // failed

      const result = await service.getStats();

      expect(result).toEqual({
        total: 50,
        pending: 15,
        processing: 5,
        completed: 25,
        failed: 5,
        permanentlyFailed: 5,
        completelyFailed: 5,
      });
    });
  });

  describe('retry', () => {
    it('should reset failed event to pending state and return it', async () => {
      const mockExisting = {
        id: 'uuid-1',
        eventId: 'evt_100',
        status: 'failed',
      };
      const mockUpdated = {
        id: 'uuid-1',
        eventId: 'evt_100',
        status: 'pending',
        cycleAttempts: 0,
        processingAttempts: [],
        processedOrder: null,
      };

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockExisting);
      mockPrismaService.webhookEvent.update.mockResolvedValue(mockUpdated);

      const result = await service.retry('evt_100');

      expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
        where: { eventId: 'evt_100' },
      });
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uuid-1' },
          data: expect.objectContaining({
            status: 'pending',
            cycleAttempts: 0,
            leaseOwner: null,
            leaseToken: null,
            leaseExpiresAt: null,
            lastError: null,
          }),
        }),
      );
      expect(result).toEqual(mockUpdated);
    });

    it('should throw NotFoundException if event to retry does not exist', async () => {
      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(null);

      await expect(service.retry('evt_missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if event is not permanently failed', async () => {
      const mockExisting = {
        id: 'uuid-1',
        eventId: 'evt_100',
        status: 'completed',
      };

      mockPrismaService.webhookEvent.findFirst.mockResolvedValue(mockExisting);

      await expect(service.retry('evt_100')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
