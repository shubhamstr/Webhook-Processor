import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: {
    status: 'up' | 'down';
    latencyMs?: number;
    error?: string;
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Server is running!';
  }

  async getHealth(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    let dbStatus: 'up' | 'down' = 'up';
    let dbError: string | undefined;
    let latencyMs: number | undefined;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      latencyMs = Date.now() - startTime;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      dbStatus = 'down';
      dbError =
        error instanceof Error ? error.message : 'Unknown database error';
    }

    const isHealthy = dbStatus === 'up';

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        ...(latencyMs !== undefined ? { latencyMs } : {}),
        ...(dbError ? { error: dbError } : {}),
      },
    };
  }
}
