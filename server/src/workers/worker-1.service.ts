import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { BaseWorkerService } from './base-worker.service';

/**
 * Dedicated service for Worker 1.
 * Responsible for polling, claiming, and executing webhook jobs under worker 1 ID.
 */
@Injectable()
export class Worker1Service extends BaseWorkerService {
  constructor(
    prisma: PrismaService,
    configService: ConfigService,
  ) {
    const workerId = configService.get<string>('WORKER_1_ID') || 'worker-1';
    super(prisma, configService, workerId, 'Worker-1');
  }
}
