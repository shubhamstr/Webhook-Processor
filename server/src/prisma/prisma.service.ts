import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    try {
      // Ensure PostgreSQL connection session uses Indian Standard Time (IST)
      await this.$executeRawUnsafe("SET timezone = 'Asia/Calcutta';");
    } catch {
      // Ignore if database does not permit setting session timezone
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
