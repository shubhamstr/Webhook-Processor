'use client';

import React from 'react';
import { WebhookEvent } from '../types/webhook';
import { StatusBadge } from './StatusBadge';
import { RotateCw } from 'lucide-react';

interface WebhookTableProps {
  events: WebhookEvent[];
  onRetry: (eventId: string) => void;
  onOpenRetries: (event: WebhookEvent) => void;
  onOpenPayload: (event: WebhookEvent) => void;
  retryingIds: Set<string>;
}

export const WebhookTable: React.FC<WebhookTableProps> = ({
  events,
  onRetry,
  onOpenRetries,
  onOpenPayload,
  retryingIds,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <th className="py-3 px-4">Event ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Customer ID</th>
              <th className="py-3 px-4">Payload</th>
              <th className="py-3 px-4">Retries</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-700">
            {events.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  No webhook events recorded yet.
                </td>
              </tr>
            ) : (
              events.map((evt) => {
                const isRetrying = retryingIds.has(evt.id) || evt.status === 'processing';
                const retryCount = evt.retries.length;

                return (
                  <tr key={evt.id} className="hover:bg-gray-50/80 transition-colors">
                    {/* Event ID */}
                    <td className="py-3 px-4 font-mono text-xs font-medium text-gray-900">
                      {evt.id}
                    </td>

                    {/* Event Type */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                        {evt.type}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <StatusBadge status={evt.status} />
                    </td>

                    {/* Order ID */}
                    <td className="py-3 px-4 font-mono text-xs text-gray-900 font-medium">
                      {evt.payload.orderId || '-'}
                    </td>

                    {/* Customer ID */}
                    <td className="py-3 px-4 font-mono text-xs text-gray-600">
                      {evt.payload.customerId || '-'}
                    </td>

                    {/* Payload link */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onOpenPayload(evt)}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
                      >
                        View JSON
                      </button>
                    </td>

                    {/* Retries Popup Modal trigger */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onOpenRetries(evt)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                        title="Click to view retry attempts in modal"
                      >
                        <span>
                          {retryCount} {retryCount === 1 ? 'attempt' : 'attempts'}
                        </span>
                        <span className="text-gray-400 text-[11px]">(view)</span>
                      </button>
                    </td>

                    {/* Retry button */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onRetry(evt.id)}
                        disabled={isRetrying}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium cursor-pointer transition ${
                          evt.status === 'permanently failed'
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <RotateCw
                          className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`}
                        />
                        <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="py-2.5 px-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between items-center">
        <span>Showing {events.length} total events</span>
        <span>Click on any retry count to open details modal</span>
      </div>
    </div>
  );
};
