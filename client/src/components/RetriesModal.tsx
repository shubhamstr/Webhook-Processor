'use client';

import React from 'react';
import { WebhookEvent } from '../types/webhook';
import { StatusBadge } from './StatusBadge';
import { X, RotateCw, AlertTriangle } from 'lucide-react';

interface RetriesModalProps {
  event: WebhookEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onRetry: (eventId: string) => void;
  isRetrying?: boolean;
}

export const RetriesModal: React.FC<RetriesModalProps> = ({
  event,
  isOpen,
  onClose,
  onRetry,
  isRetrying = false,
}) => {
  if (!isOpen || !event) return null;

  const retryCount = event.retries.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="relative w-full max-w-xl bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">
              Webhook Retries
            </h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              Event ID: {event.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Bar */}
        <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <StatusBadge status={event.status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Event Type:</span>
            <span className="font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
              {event.type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Retries:</span>
            <span className="font-semibold text-gray-800">
              {retryCount} / {event.maxRetries}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-3">
          {event.lastErrorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <div>
                <span className="font-semibold">Error: </span>
                <span>{event.lastErrorMessage}</span>
              </div>
            </div>
          )}

          {event.retries.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              <p className="font-medium text-gray-700 text-sm mb-1">No retry attempts yet</p>
              <p>
                {event.status === 'processing'
                  ? 'Request is currently being processed.'
                  : 'This event completed successfully on the first delivery attempt.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {event.retries.map((retry, idx) => {
                const isSuccess = retry.status === 'success' || retry.statusCode < 400;
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          Attempt #{retry.attemptNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isSuccess
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}
                        >
                          HTTP {retry.statusCode} {isSuccess ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <div className="text-gray-400 text-[11px]">
                        {retry.durationMs}ms • {new Date(retry.timestamp).toLocaleTimeString()}
                      </div>
                    </div>

                    {retry.errorMessage && (
                      <p className="text-red-700 bg-red-50 p-2 rounded border border-red-100 font-medium">
                        {retry.errorMessage}
                      </p>
                    )}

                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">Response Payload:</div>
                      <pre className="font-mono text-[11px] bg-white border border-gray-200 text-gray-800 p-2 rounded overflow-x-auto">
                        {retry.responseBody}
                      </pre>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-xs text-gray-500 truncate max-w-[260px]">
            Target: <span className="font-mono text-gray-700">{event.endpointUrl}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 rounded transition cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => onRetry(event.id)}
              disabled={isRetrying || event.status === 'processing'}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Retry Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
