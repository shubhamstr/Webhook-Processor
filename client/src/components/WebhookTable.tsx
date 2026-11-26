'use client';

import React, { useState } from 'react';
import { WebhookEvent, RetryAttempt } from '../types/webhook';
import { StatusBadge } from './StatusBadge';
import {
  ChevronDown,
  ChevronRight,
  RotateCw,
  AlertCircle,
  Clock,
  Server,
  Layers,
  ChevronUp
} from 'lucide-react';

interface WebhookTableProps {
  events: WebhookEvent[];
  onRetry: (eventId: string) => void;
  retryingIds: Set<string>;
}

export const WebhookTable: React.FC<WebhookTableProps> = ({
  events,
  onRetry,
  retryingIds,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedIds.size === events.length) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(events.map((e) => e.id)));
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getProcessingHistory = (evt: WebhookEvent): RetryAttempt[] => {
    if (evt.processingAttempts && evt.processingAttempts.length > 0) {
      return evt.processingAttempts;
    }
    if (evt.retries && evt.retries.length > 0) {
      return evt.retries;
    }
    return [];
  };

  const getAttemptCount = (evt: WebhookEvent): number => {
    if (typeof evt.totalAttempts === 'number') return evt.totalAttempts;
    const history = getProcessingHistory(evt);
    return history.length;
  };

  const getMaxAttempts = (evt: WebhookEvent): number => {
    return evt.maxAttempts ?? evt.maxRetries ?? 5;
  };

  const getErrorMessage = (evt: WebhookEvent): string | undefined => {
    return evt.lastError || evt.lastErrorMessage || undefined;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
      {/* Table Toolbar */}
      <div className="py-2.5 px-4 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-gray-600 font-medium">
          Showing {events.length} received {events.length === 1 ? 'event' : 'events'}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-[11px] hidden sm:inline">
            Click any row to expand details, payload & processing history
          </span>
          <button
            onClick={toggleAll}
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 transition cursor-pointer"
          >
            {expandedIds.size === events.length && events.length > 0 ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Collapse All</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expand All</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider select-none">
              <th className="py-3 px-4 w-10"></th>
              <th className="py-3 px-4">Event ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Current State</th>
              <th className="py-3 px-4">Attempt Count</th>
              <th className="py-3 px-4">Received At</th>
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Customer ID</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-700">
            {events.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-400 text-sm">
                  No webhook events recorded yet.
                </td>
              </tr>
            ) : (
              events.map((evt) => {
                const isExpanded = expandedIds.has(evt.id);
                const isRetrying = retryingIds.has(evt.id) || evt.status === 'processing';
                const attemptCount = getAttemptCount(evt);
                const maxAttempts = getMaxAttempts(evt);
                const errorMsg = getErrorMessage(evt);
                const history = getProcessingHistory(evt);
                const displayId = evt.eventId || evt.id;
                const displayType = evt.eventType || evt.type || 'unknown';
                const receivedTime = evt.receivedAt || evt.createdAt;
                const normalizedStatus = (evt.status || '').toLowerCase().replace(/_/g, ' ').trim();
                const isPermanentlyFailed =
                  normalizedStatus === 'permanently failed' || normalizedStatus === 'failed';
                const showRetryButton = isPermanentlyFailed || retryingIds.has(evt.id);

                return (
                  <React.Fragment key={evt.id}>
                    {/* Main Row */}
                    <tr
                      onClick={() => toggleRow(evt.id)}
                      className={`cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-blue-50/50 hover:bg-blue-50/70 border-b-0'
                          : 'hover:bg-gray-50/80'
                      }`}
                      title="Click to view payload, processing history and details directly below"
                    >
                      {/* Expand / Collapse Chevron */}
                      <td className="py-3.5 px-3 text-center text-gray-400">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-600 inline-block transition-transform" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 inline-block transition-transform hover:text-gray-600" />
                        )}
                      </td>

                      {/* Event ID */}
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-gray-900">
                        <span className="hover:underline">{displayId}</span>
                        {errorMsg && (
                          <span
                            className="ml-2 inline-flex items-center text-red-500"
                            title={`Error: ${errorMsg}`}
                          >
                            <AlertCircle className="w-3.5 h-3.5 inline" />
                          </span>
                        )}
                      </td>

                      {/* Event Type */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium whitespace-nowrap">
                          {displayType}
                        </span>
                      </td>

                      {/* Current State / Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={evt.status} />
                      </td>

                      {/* Attempt Count */}
                      <td className="py-3.5 px-4 text-xs font-medium text-gray-800">
                        <span className="font-semibold">{attemptCount}</span>
                        <span className="text-gray-400 font-normal"> / {maxAttempts}</span>
                      </td>

                      {/* Received At */}
                      <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(receivedTime)}
                      </td>

                      {/* Order ID */}
                      <td className="py-3.5 px-4 font-mono text-xs text-gray-900 font-medium">
                        {evt.payload?.orderId || '-'}
                      </td>

                      {/* Customer ID */}
                      <td className="py-3.5 px-4 font-mono text-xs text-gray-600">
                        {evt.payload?.customerId || '-'}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        {showRetryButton ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRetry(evt.id);
                            }}
                            disabled={isRetrying}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Retry permanently failed event"
                          >
                            <RotateCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                            <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
                          </button>
                        ) : (
                          <span className="text-gray-300 select-none">-</span>
                        )}
                      </td>
                    </tr>

                    {/* Directly Below: Accordion Content Row */}
                    {isExpanded && (
                      <tr className="bg-gray-50/70 border-b border-gray-200">
                        <td colSpan={9} className="p-4 md:p-6">
                          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-5">
                            {/* Summary Ribbon */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 text-xs">
                              <div className="flex flex-wrap items-center gap-4">
                                <div>
                                  <span className="text-gray-400 font-medium mr-1.5">ID:</span>
                                  <span className="font-mono font-bold text-gray-900">{evt.id}</span>
                                </div>
                                {evt.eventId && evt.eventId !== evt.id && (
                                  <div>
                                    <span className="text-gray-400 font-medium mr-1.5">Event Key:</span>
                                    <span className="font-mono font-medium text-gray-800">{evt.eventId}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-gray-400 font-medium mr-1.5">State:</span>
                                  <StatusBadge status={evt.status} />
                                </div>
                                <div>
                                  <span className="text-gray-400 font-medium mr-1.5">Attempts:</span>
                                  <span className="font-semibold text-gray-900">
                                    {attemptCount} / {maxAttempts}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Error Banner if error exists */}
                            {errorMsg && (
                              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5 flex-1">
                                  <div className="font-bold text-red-900 uppercase tracking-wide text-[10px]">
                                    Error Message
                                  </div>
                                  <div className="font-mono text-xs">{errorMsg}</div>
                                </div>
                              </div>
                            )}

                            {/* Main Grid: Payload & Processing History */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                              {/* Left Column: Received Event Payload */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Received Event Payload</span>
                                  </h4>
                                </div>

                                {/* Key fields quick summary */}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                    <div className="text-[10px] text-gray-400 font-semibold uppercase">Order ID</div>
                                    <div className="font-mono font-bold text-gray-900 truncate">
                                      {evt.payload?.orderId || '-'}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                    <div className="text-[10px] text-gray-400 font-semibold uppercase">Customer ID</div>
                                    <div className="font-mono font-bold text-gray-900 truncate">
                                      {evt.payload?.customerId || '-'}
                                    </div>
                                  </div>
                                  {evt.payload?.amount !== undefined && (
                                    <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                      <div className="text-[10px] text-gray-400 font-semibold uppercase">Amount</div>
                                      <div className="font-mono font-bold text-gray-900">
                                        {evt.payload.amount} {evt.payload.currency || 'USD'}
                                      </div>
                                    </div>
                                  )}
                                  {evt.payload?.customerEmail && (
                                    <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                      <div className="text-[10px] text-gray-400 font-semibold uppercase">Email</div>
                                      <div className="font-mono text-gray-900 truncate">
                                        {evt.payload.customerEmail}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Raw JSON Payload block */}
                                <div>
                                  <div className="text-[11px] text-gray-500 font-medium mb-1">
                                    Raw JSON Data:
                                  </div>
                                  <pre className="text-xs font-mono bg-gray-900 text-emerald-400 p-3 rounded-lg overflow-x-auto max-h-64">
                                    {JSON.stringify(evt.payload, null, 2)}
                                  </pre>
                                </div>
                              </div>

                              {/* Right Column: Processing History & Attempts */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>
                                      Processing History ({history.length} {history.length === 1 ? 'attempt' : 'attempts'})
                                    </span>
                                  </h4>
                                </div>

                                {history.length === 0 ? (
                                  <div className="text-center py-10 px-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500 space-y-1">
                                    <Server className="w-6 h-6 mx-auto text-gray-400" />
                                    <p className="font-medium text-gray-700">No attempts logged yet</p>
                                    <p className="text-[11px]">
                                      {evt.status === 'processing'
                                        ? 'Event is currently in the worker queue.'
                                        : 'Awaiting retry or initial processing trigger.'}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                                    {history.map((attempt, idx) => {
                                      const isSuccess =
                                        attempt.status === 'success' ||
                                        attempt.result === 'success' ||
                                        (attempt.statusCode && attempt.statusCode < 400);

                                      const attemptTime =
                                        attempt.timestamp || attempt.startedAt || attempt.finishedAt;

                                      const attemptError = attempt.errorMessage || attempt.error;

                                      return (
                                        <div
                                          key={idx}
                                          className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                                            isSuccess
                                              ? 'border-emerald-200 bg-emerald-50/40'
                                              : 'border-red-200 bg-red-50/40'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-gray-900">
                                                Attempt #{attempt.attemptNumber}
                                              </span>
                                              <span
                                                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                  isSuccess
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : 'bg-red-100 text-red-800 border border-red-200'
                                                }`}
                                              >
                                                {attempt.statusCode ? `HTTP ${attempt.statusCode} ` : ''}
                                                {isSuccess ? 'Success' : 'Failed'}
                                              </span>
                                            </div>

                                            <div className="text-gray-500 text-[11px]">
                                              {attempt.durationMs ? `${attempt.durationMs}ms • ` : ''}
                                              {formatDate(attemptTime)}
                                            </div>
                                          </div>

                                          {/* Worker ID if available */}
                                          {attempt.workerId && (
                                            <div className="text-[11px] text-gray-500 font-mono">
                                              Worker: {attempt.workerId}
                                            </div>
                                          )}

                                          {/* Attempt error if available */}
                                          {attemptError && (
                                            <p className="text-red-700 bg-red-100/70 p-2 rounded border border-red-200 font-mono text-[11px]">
                                              {attemptError}
                                            </p>
                                          )}

                                          {/* Response body if available */}
                                          {attempt.responseBody && (
                                            <div>
                                              <div className="text-[10px] text-gray-400 font-medium">Response:</div>
                                              <pre className="font-mono text-[11px] bg-white border border-gray-200 text-gray-800 p-2 rounded overflow-x-auto">
                                                {attempt.responseBody}
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="py-2.5 px-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap justify-between items-center gap-2">
        <span>Total: {events.length} events recorded</span>
        <span>Expanded: {expandedIds.size} of {events.length} rows</span>
      </div>
    </div>
  );
};
