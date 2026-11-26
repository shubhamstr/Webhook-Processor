import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { Worker1Service } from './worker-1.service';
import { Worker2Service } from './worker-2.service';
import { WorkersService } from './workers.service';

@Module({
  imports: [PrismaModule],
  providers: [Worker1Service, Worker2Service, WorkersService],
  exports: [Worker1Service, Worker2Service, WorkersService],
})
export class WorkersModule {}
