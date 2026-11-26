import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { BaseWorkerService } from './base-worker.service';

/**
 * Dedicated service for Worker 2.
 * Responsible for polling, claiming, and executing webhook jobs under worker 2 ID.
 */
@Injectable()
export class Worker2Service extends BaseWorkerService {
  constructor(
    prisma: PrismaService,
    configService: ConfigService,
  ) {
    const workerId = configService.get<string>('WORKER_2_ID') || 'worker-2';
    super(prisma, configService, workerId, 'Worker-2');
  }
}
