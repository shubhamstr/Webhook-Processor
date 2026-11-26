/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { CreateWebhookDto } from '../src/webhooks/dto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: PrismaService;

  const mockPrismaService = {
    webhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingestWebhook', () => {
    const sampleDto: CreateWebhookDto = {
      eventId: 'evt_123',
      type: 'order.created',
      data: {
        orderId: 'ORD-1001',
        customerId: 'CUS-42',
        simulate: 'fail_then_succeed:2',
      },
    };

    it('should persist a new event and return accepted status', async () => {
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({
        id: 'uuid-1',
        eventId: sampleDto.eventId,
        eventType: sampleDto.type,
        payload: sampleDto.data,
        status: 'pending',
      });

      const result = await service.ingestWebhook(sampleDto);

      expect(prisma.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: sampleDto.eventId },
      });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: sampleDto.eventId,
          eventType: sampleDto.type,
          payload: sampleDto.data,
          status: 'pending',
          receivedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      });
      expect(result).toEqual({
        status: 'accepted',
        eventId: sampleDto.eventId,
      });
    });

    it('should ignore duplicate delivery with same payload and keep the first one', async () => {
      const existingRecord = {
        id: 'uuid-1',
        eventId: sampleDto.eventId,
        eventType: sampleDto.type,
        payload: sampleDto.data,
        status: 'pending',
      };
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(
        existingRecord,
      );

      const result = await service.ingestWebhook(sampleDto);

      expect(prisma.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: sampleDto.eventId },
      });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'accepted',
        eventId: sampleDto.eventId,
      });
    });

    it('should keep the first event and ignore the later one when duplicate eventId has different payload', async () => {
      const originalPayload = {
        orderId: 'ORD-1001',
        customerId: 'CUS-42',
        simulate: 'fail_then_succeed:2',
      };
      const existingRecord = {
        id: 'uuid-1',
        eventId: 'evt_123',
        eventType: 'order.created',
        payload: originalPayload,
        status: 'pending',
      };
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(
        existingRecord,
      );

      const differentDto: CreateWebhookDto = {
        eventId: 'evt_123',
        type: 'order.updated',
        data: {
          orderId: 'ORD-9999',
          customerId: 'CUS-99',
        },
      };

      const result = await service.ingestWebhook(differentDto);

      expect(prisma.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: differentDto.eventId },
      });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'accepted',
        eventId: 'evt_123',
      });
    });

    it('should handle concurrent race condition duplicate (P2002 error)', async () => {
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`event_id`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );
      mockPrismaService.webhookEvent.create.mockRejectedValue(p2002Error);

      const result = await service.ingestWebhook(sampleDto);

      expect(result).toEqual({
        status: 'accepted',
        eventId: sampleDto.eventId,
      });
    });

    it('should rethrow unexpected errors', async () => {
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.ingestWebhook(sampleDto)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
