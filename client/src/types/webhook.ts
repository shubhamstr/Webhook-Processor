export type WebhookStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'permanently failed'
  | 'failed';

export type WebhookEventType =
  | 'order.created'
  | 'order.updated'
  | 'order.cancelled'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'customer.created'
  | 'inventory.low'
  | string;

export interface RetryAttempt {
  attemptNumber: number;
  timestamp?: string;
  startedAt?: string;
  finishedAt?: string | null;
  statusCode?: number;
  durationMs?: number;
  responseBody?: string;
  errorMessage?: string;
  error?: string | null;
  status?: 'failed' | 'success' | string;
  result?: string | null;
  workerId?: string;
  retryCycle?: number;
}

export interface WebhookPayload {
  orderId?: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  itemsCount?: number;
  customerEmail?: string;
  deliveryStatus?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WebhookEvent {
  id: string;
  eventId?: string;
  type?: WebhookEventType;
  eventType?: string;
  status: WebhookStatus;
  payload: WebhookPayload;
  endpointUrl?: string;
  retries?: RetryAttempt[];
  processingAttempts?: RetryAttempt[];
  totalAttempts?: number;
  cycleAttempts?: number;
  maxAttempts?: number;
  maxRetries?: number;
  nextAttemptAt?: string | null;
  createdAt?: string;
  receivedAt?: string;
  updatedAt?: string;
  lastErrorMessage?: string;
  lastError?: string | null;
}

export interface WebhookStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  permanentlyFailed: number;
  failed?: number;
  completelyFailed?: number;
}
