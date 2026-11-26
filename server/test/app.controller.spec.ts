/* eslint-disable @typescript-eslint/unbound-method */
import { jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma';

describe('AppController', () => {
  let appController: AppController;
  let eventsService: {
    getStats: jest.Mock;
  };
  let prismaService: {
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
    };
    eventsService = {
      getStats: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: EventsService,
          useValue: eventsService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should return "Server is running!"', () => {
      expect(appController.getHello()).toBe('Server is running!');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status when database is reachable', async () => {
      prismaService.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const mockRes = {
        status: jest.fn(),
      } as unknown as Response;

      const result = await appController.getHealth(mockRes);

      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
      expect(typeof result.database.latencyMs).toBe('number');
      expect(typeof result.uptime).toBe('number');
      expect(typeof result.timestamp).toBe('string');
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return error status and 503 when database is unreachable', async () => {
      prismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Connection timeout'),
      );
      const mockRes = {
        status: jest.fn(),
      } as unknown as Response;

      const result = await appController.getHealth(mockRes);

      expect(result.status).toBe('error');
      expect(result.database.status).toBe('down');
      expect(result.database.error).toBe('Connection timeout');
      expect(mockRes.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });
  });

  describe('GET /stats', () => {
    it('should return event statistics from eventsService', async () => {
      const stats = {
        total: 10,
        pending: 3,
        processing: 2,
        completed: 4,
        failed: 1,
        permanentlyFailed: 1,
        completelyFailed: 1,
      };
      eventsService.getStats.mockResolvedValueOnce(stats);

      const result = await appController.getStats();

      expect(eventsService.getStats).toHaveBeenCalled();
      expect(result).toEqual(stats);
    });
  });
});
