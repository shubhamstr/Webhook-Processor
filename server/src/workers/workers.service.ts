import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseWorkerService } from './base-worker.service';
import { Worker1Service } from './worker-1.service';
import { Worker2Service } from './worker-2.service';
import {
  ClaimedWebhookEvent,
  WorkersStatusResponse,
} from './worker.types';

@Injectable()
export class WorkersService implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkersService.name);

  readonly worker1Id: string;
  readonly worker2Id: string;
  private isRunning = false;
  private isStopped = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly worker1: Worker1Service,
    private readonly worker2: Worker2Service,
  ) {
    this.worker1Id = this.worker1.workerId;
    this.worker2Id = this.worker2.workerId;
  }

  onApplicationShutdown() {
    this.stopWorkers();
  }

  /**
   * Start both Worker 1 and Worker 2 concurrently
   */
  startWorkers(): void {
    if (this.isRunning) {
      this.logger.warn('Workers are already running.');
      return;
    }

    this.isStopped = false;
    this.isRunning = true;

    this.logger.log(
      `Starting 2 PostgreSQL-backed workers: '${this.worker1Id}' and '${this.worker2Id}'`,
    );

    void this.runWorkerLoop(this.worker1Id);
    void this.runWorkerLoop(this.worker2Id);
  }

  /**
   * Stop all workers gracefully
   */
  stopWorkers(): void {
    this.logger.log('Stopping all workers gracefully...');
    this.isStopped = true;
    this.isRunning = false;
    this.worker1.stop();
    this.worker2.stop();
  }

  /**
   * Resolve worker service instance by workerId
   */
  getWorker(workerId: string): BaseWorkerService {
    return workerId === this.worker2Id ? this.worker2 : this.worker1;
  }

  /**
   * Worker continuous execution loop (delegates to the dedicated worker instance)
   */
  async runWorkerLoop(workerId: string): Promise<void> {
    return this.getWorker(workerId).runWorkerLoop(workerId);
  }

  /**
   * Claim next eligible webhook event from PostgreSQL (delegates to the dedicated worker instance)
   */
  async claimWebhookEvent(
    workerId: string,
    leaseDurationSeconds?: number,
  ): Promise<ClaimedWebhookEvent | null> {
    return this.getWorker(workerId).claimWebhookEvent(workerId, leaseDurationSeconds);
  }

  /**
   * Process a claimed webhook event (delegates to the dedicated worker instance)
   */
  async processEvent(
    event: ClaimedWebhookEvent,
    workerId: string,
  ): Promise<void> {
    return this.getWorker(workerId).processEvent(event, workerId);
  }

  /**
   * Get current workers status
   */
  getWorkersStatus(): WorkersStatusResponse {
    return {
      isRunning:
        this.isRunning ||
        this.worker1.getIsRunning() ||
        this.worker2.getIsRunning(),
      workers: [this.worker1.getState(), this.worker2.getState()],
    };
  }
}
