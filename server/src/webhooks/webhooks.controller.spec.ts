/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    ingestWebhook: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: mockWebhooksService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should ingest a webhook and return accepted response', async () => {
    const dto: CreateWebhookDto = {
      eventId: 'evt_123',
      type: 'order.created',
      data: {
        orderId: 'ORD-1001',
        customerId: 'CUS-42',
        simulate: 'fail_then_succeed:2',
      },
    };

    const expectedResult = {
      status: 'accepted',
      eventId: 'evt_123',
    };

    mockWebhooksService.ingestWebhook.mockResolvedValue(expectedResult);

    const result = await controller.ingestWebhook(dto);

    expect(service.ingestWebhook).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });
});
