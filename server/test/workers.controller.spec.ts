/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkersController } from '../src/workers/workers.controller';
import { WorkersService } from '../src/workers/workers.service';

describe('WorkersController', () => {
  let controller: WorkersController;
  let service: WorkersService;

  const mockWorkersService = {
    worker1Id: 'worker-1',
    worker2Id: 'worker-2',
    getWorkersStatus: jest.fn().mockReturnValue({
      isRunning: true,
      workers: [
        { workerId: 'worker-1', status: 'running', processedCount: 5 },
        { workerId: 'worker-2', status: 'running', processedCount: 3 },
      ],
    }),
    startWorkers: jest.fn(),
    stopWorkers: jest.fn(),
    claimWebhookEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkersController],
      providers: [
        {
          provide: WorkersService,
          useValue: mockWorkersService,
        },
      ],
    }).compile();

    controller = module.get<WorkersController>(WorkersController);
    service = module.get<WorkersService>(WorkersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /workers/status should return workers status', () => {
    const status = controller.getStatus();
    expect(status).toHaveProperty('isRunning', true);
    expect(status.workers).toHaveLength(2);
  });

  it('POST /workers/start should trigger startWorkers', () => {
    const res = controller.startWorkers();
    expect(service.startWorkers).toHaveBeenCalledTimes(1);
    expect(res).toHaveProperty('message', 'Workers started');
  });

  it('POST /workers/stop should trigger stopWorkers', () => {
    const res = controller.stopWorkers();
    expect(service.stopWorkers).toHaveBeenCalledTimes(1);
    expect(res).toHaveProperty('message', 'Workers stopped');
  });

  it('POST /workers/claim should trigger claimWebhookEvent with specified worker', async () => {
    (mockWorkersService.claimWebhookEvent as jest.Mock).mockResolvedValueOnce({
      id: 'event-uuid',
      eventId: 'evt_1',
      status: 'processing',
    });

    const res = await controller.claimManually('worker-2', 45);

    expect(service.claimWebhookEvent).toHaveBeenCalledWith('worker-2', 45);
    expect(res).toEqual({
      workerId: 'worker-2',
      claimed: true,
      event: {
        id: 'event-uuid',
        eventId: 'evt_1',
        status: 'processing',
      },
    });
  });
});
