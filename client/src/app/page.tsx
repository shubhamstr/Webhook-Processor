'use client';

import React, { useState, useEffect } from 'react';
import { WebhookEvent, WebhookStatus, WebhookEventType, RetryAttempt } from '../types/webhook';
import { INITIAL_WEBHOOK_EVENTS } from '../data/mockWebhooks';
import { WebhookTable } from '../components/WebhookTable';
import { RetriesModal } from '../components/RetriesModal';
import { PayloadModal } from '../components/PayloadModal';
import { SimulateWebhookModal } from '../components/SimulateWebhookModal';
import { Plus } from 'lucide-react';

export default function WebhookProcessorDashboard() {
  const [events, setEvents] = useState<WebhookEvent[]>(INITIAL_WEBHOOK_EVENTS);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [activeRetriesEvent, setActiveRetriesEvent] = useState<WebhookEvent | null>(null);
  const [activePayloadEvent, setActivePayloadEvent] = useState<WebhookEvent | null>(null);
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);

  // Sync activeRetriesEvent when event state updates
  useEffect(() => {
    if (activeRetriesEvent) {
      const updated = events.find((e) => e.id === activeRetriesEvent.id);
      if (updated) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveRetriesEvent(updated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Handle Retry Trigger
  const handleRetry = (eventId: string) => {
    const targetEvent = events.find((e) => e.id === eventId);
    if (!targetEvent) return;

    setRetryingIds((prev) => new Set(prev).add(eventId));

    // Update status to processing immediately
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? {
            ...e,
            status: 'processing' as WebhookStatus,
            updatedAt: new Date().toISOString(),
          }
          : e
      )
    );

    // Simulate network delivery
    setTimeout(() => {
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;

          const currentAttempts = e.retries.length;
          const nextAttemptNumber = currentAttempts + 1;
          const isMaxRetries = nextAttemptNumber >= e.maxRetries;
          const willSucceed = Math.random() > 0.35 || !isMaxRetries;

          if (willSucceed) {
            const newRetry: RetryAttempt = {
              attemptNumber: nextAttemptNumber,
              timestamp: new Date().toISOString(),
              statusCode: 200,
              durationMs: Math.floor(Math.random() * 180 + 70),
              responseBody: JSON.stringify({
                status: 'delivered',
                acknowledged: true,
                orderId: e.payload.orderId,
                customerId: e.payload.customerId,
              }),
              status: 'success',
            };

            return {
              ...e,
              status: 'completed' as WebhookStatus,
              retries: [...e.retries, newRetry],
              lastErrorMessage: undefined,
              updatedAt: new Date().toISOString(),
            };
          } else {
            const statusCode = [500, 502, 504][Math.floor(Math.random() * 3)];
            const newRetry: RetryAttempt = {
              attemptNumber: nextAttemptNumber,
              timestamp: new Date().toISOString(),
              statusCode,
              durationMs: Math.floor(Math.random() * 450 + 200),
              responseBody: JSON.stringify({
                error: 'Service Unavailable',
                attempt: nextAttemptNumber,
              }),
              errorMessage: `HTTP ${statusCode} Endpoint failed to respond`,
              status: 'failed',
            };

            const newStatus: WebhookStatus = isMaxRetries ? 'permanently failed' : 'processing';

            return {
              ...e,
              status: newStatus,
              retries: [...e.retries, newRetry],
              lastErrorMessage: `Attempt #${nextAttemptNumber} failed with HTTP ${statusCode}`,
              updatedAt: new Date().toISOString(),
            };
          }
        })
      );

      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }, 1200);
  };

  // Handle Simulate Webhook
  const handleSimulate = (config: {
    type: WebhookEventType;
    orderId: string;
    customerId: string;
    initialStatus: WebhookStatus;
    simulateFailure: boolean;
    amount?: number;
    currency?: string;
  }) => {
    const randomHex = Math.random().toString(16).substring(2, 14);
    const newEventId = `evt_${randomHex}`;

    let initialRetries: RetryAttempt[] = [];
    let status: WebhookStatus = config.initialStatus;

    if (config.simulateFailure) {
      status = 'permanently failed';
      initialRetries = [
        {
          attemptNumber: 1,
          timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
          statusCode: 504,
          durationMs: 3000,
          responseBody: '{"error": "Gateway Timeout"}',
          errorMessage: 'Server timeout connecting to destination host',
          status: 'failed',
        },
        {
          attemptNumber: 2,
          timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
          statusCode: 500,
          durationMs: 420,
          responseBody: '{"error": "Internal Server Error"}',
          errorMessage: 'Internal downstream database deadlock',
          status: 'failed',
        },
        {
          attemptNumber: 3,
          timestamp: new Date(Date.now() - 1000 * 30).toISOString(),
          statusCode: 503,
          durationMs: 220,
          responseBody: '{"error": "Service Unavailable"}',
          errorMessage: 'Retry budget exhausted (3/3). Marked as permanently failed.',
          status: 'failed',
        },
      ];
    } else if (config.initialStatus === 'completed') {
      initialRetries = [
        {
          attemptNumber: 1,
          timestamp: new Date().toISOString(),
          statusCode: 200,
          durationMs: 115,
          responseBody: '{"success": true, "code": "OK"}',
          status: 'success',
        },
      ];
    }

    const newEvent: WebhookEvent = {
      id: newEventId,
      type: config.type,
      status,
      endpointUrl: 'https://api.merchant.com/v1/webhooks/orders',
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastErrorMessage: config.simulateFailure
        ? 'Maximum retry limit (3/3) reached. Webhook permanently failed.'
        : undefined,
      payload: {
        orderId: config.orderId,
        customerId: config.customerId,
        amount: config.amount || 149.99,
        currency: config.currency || 'USD',
        itemsCount: 2,
        customerEmail: `user_${config.customerId.toLowerCase()}@example.com`,
      },
      retries: initialRetries,
    };

    setEvents((prev) => [newEvent, ...prev]);

    // If initialStatus is processing and not simulated failure, auto-complete after 2.5s
    if (config.initialStatus === 'processing' && !config.simulateFailure) {
      setTimeout(() => {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === newEventId
              ? {
                ...e,
                status: 'completed',
                retries: [
                  {
                    attemptNumber: 1,
                    timestamp: new Date().toISOString(),
                    statusCode: 200,
                    durationMs: 130,
                    responseBody: '{"received": true, "processed": true}',
                    status: 'success',
                  },
                ],
              }
              : e
          )
        );
      }, 2500);
    }
  };

  const processingCount = events.filter((e) => e.status === 'processing').length;
  const completedCount = events.filter((e) => e.status === 'completed').length;
  const failedCount = events.filter((e) => e.status === 'permanently failed').length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webhook Events</h1>
            <p className="text-sm text-gray-500 mt-1">
              Monitor incoming webhook events, payload details, and retry history.
            </p>
          </div>

          <div>
            <button
              onClick={() => setIsSimulateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Simulate Webhook</span>
            </button>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="px-3.5 py-2 bg-white border border-gray-200 rounded-lg shadow-xs">
            <span className="text-gray-500">Total Events:</span>{' '}
            <span className="font-bold text-gray-900 ml-1">{events.length}</span>
          </div>
          <div className="px-3.5 py-2 bg-white border border-gray-200 rounded-lg shadow-xs">
            <span className="text-amber-600 font-medium">Processing:</span>{' '}
            <span className="font-bold text-gray-900 ml-1">{processingCount}</span>
          </div>
          <div className="px-3.5 py-2 bg-white border border-gray-200 rounded-lg shadow-xs">
            <span className="text-emerald-600 font-medium">Completed:</span>{' '}
            <span className="font-bold text-gray-900 ml-1">{completedCount}</span>
          </div>
          <div className="px-3.5 py-2 bg-white border border-gray-200 rounded-lg shadow-xs">
            <span className="text-red-600 font-medium">Permanently Failed:</span>{' '}
            <span className="font-bold text-gray-900 ml-1">{failedCount}</span>
          </div>
        </div>

        {/* Simple Webhook Table */}
        <WebhookTable
          events={events}
          onRetry={handleRetry}
          onOpenRetries={(evt) => setActiveRetriesEvent(evt)}
          onOpenPayload={(evt) => setActivePayloadEvent(evt)}
          retryingIds={retryingIds}
        />
      </div>

      {/* Retries Modal */}
      <RetriesModal
        event={activeRetriesEvent}
        isOpen={!!activeRetriesEvent}
        onClose={() => setActiveRetriesEvent(null)}
        onRetry={(id) => handleRetry(id)}
        isRetrying={activeRetriesEvent ? retryingIds.has(activeRetriesEvent.id) : false}
      />

      {/* Payload Modal */}
      <PayloadModal
        event={activePayloadEvent}
        isOpen={!!activePayloadEvent}
        onClose={() => setActivePayloadEvent(null)}
      />

      {/* Simulate Modal */}
      <SimulateWebhookModal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        onSimulate={handleSimulate}
      />
    </div>
  );
}
