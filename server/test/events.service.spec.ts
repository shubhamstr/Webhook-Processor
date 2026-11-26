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
