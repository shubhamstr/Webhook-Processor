import { Controller, Get, Post, Body } from '@nestjs/common';
import { WorkersService } from './workers.service';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get('status')
  getStatus() {
    return this.workersService.getWorkersStatus();
  }

  @Post('start')
  startWorkers() {
    this.workersService.startWorkers();
    return {
      message: 'Workers started',
      status: this.workersService.getWorkersStatus(),
    };
  }

  @Post('stop')
  stopWorkers() {
    this.workersService.stopWorkers();
    return {
      message: 'Workers stopped',
      status: this.workersService.getWorkersStatus(),
    };
  }

  @Post('claim')
  async claimManually(
    @Body('workerId') workerId?: string,
    @Body('leaseDurationSeconds') leaseDurationSeconds?: number,
  ) {
    const assignedWorkerId = workerId || this.workersService.worker1Id;
    const claimed = await this.workersService.claimWebhookEvent(
      assignedWorkerId,
      leaseDurationSeconds,
    );

    return {
      workerId: assignedWorkerId,
      claimed: claimed !== null,
      event: claimed,
    };
  }
}
