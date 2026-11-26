/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GetEventsQueryDto } from '../src/events/dto';
import { EventsController } from '../src/events/events.controller';
import { EventsService } from '../src/events/events.service';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  const mockEventsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated events list', async () => {
      const query: GetEventsQueryDto = {
        page: 1,
        limit: 10,
        status: 'pending',
      };

      const expectedResponse = {
        data: [
          {
            id: 'uuid-1',
            eventId: 'evt_1',
            eventType: 'order.created',
            status: 'pending',
            payload: { orderId: 'ORD-1' },
            processingAttempts: [],
            processedOrder: null,
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      mockEventsService.findAll.mockResolvedValue(expectedResponse);

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('findOne', () => {
    it('should return a single event', async () => {
      const eventId = 'evt_123';
      const expectedEvent = {
        id: 'uuid-1',
        eventId: 'evt_123',
        eventType: 'order.created',
        status: 'completed',
        processingAttempts: [],
        processedOrder: null,
      };

      mockEventsService.findOne.mockResolvedValue(expectedEvent);

      const result = await controller.findOne(eventId);

      expect(service.findOne).toHaveBeenCalledWith(eventId);
      expect(result).toEqual(expectedEvent);
    });
  });
});
