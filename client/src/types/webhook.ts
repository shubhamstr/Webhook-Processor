export type WebhookStatus = 'processing' | 'completed' | 'permanently failed';

export type WebhookEventType =
  | 'order.created'
  | 'order.updated'
  | 'order.cancelled'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'customer.created'
  | 'inventory.low';

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: string;
  statusCode: number;
  durationMs: number;
  responseBody: string;
  errorMessage?: string;
  status: 'failed' | 'success';
}

export interface WebhookPayload {
  orderId: string;
  customerId: string;
  amount?: number;
  currency?: string;
  itemsCount?: number;
  customerEmail?: string;
  deliveryStatus?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  status: WebhookStatus;
  payload: WebhookPayload;
  endpointUrl: string;
  retries: RetryAttempt[];
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  lastErrorMessage?: string;
}

export interface WebhookStats {
  total: number;
  processing: number;
  completed: number;
  permanentlyFailed: number;
}
