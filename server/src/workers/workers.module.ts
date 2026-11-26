import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { WorkersService } from './workers.service';

@Module({
  imports: [PrismaModule],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
