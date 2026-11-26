export interface ClaimedWebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  totalAttempts: number;
  cycleAttempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  receivedAt: Date;
  updatedAt: Date;
}

export interface WorkerState {
  workerId: string;
  status: 'idle' | 'running' | 'stopped';
  startedAt?: Date;
  lastActiveAt?: Date;
  processedCount: number;
  currentEventId: string | null;
}

export interface WorkersStatusResponse {
  isRunning: boolean;
  workers: WorkerState[];
}
