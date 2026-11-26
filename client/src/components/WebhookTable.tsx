'use client';

import React, { useState } from 'react';
import { WebhookEvent, RetryAttempt, EventDetailState } from '../types/webhook';
import { StatusBadge } from './StatusBadge';
import {
  ChevronDown,
  ChevronRight,
  RotateCw,
  AlertCircle,
  Clock,
  Server,
  Layers,
  Loader2,
  Database,
} from 'lucide-react';

interface WebhookTableProps {
  events: WebhookEvent[];
  onRetry: (eventId: string) => void;
  retryingIds: Set<string>;
  expandedId?: string | null;
  onToggleRow?: (event: WebhookEvent) => void;
  onRefreshDetail?: (event: WebhookEvent) => void;
  onRowClick?: (event: WebhookEvent) => void;
  expandedDetails?: Record<string, EventDetailState>;
}

export const WebhookTable: React.FC<WebhookTableProps> = ({
  events,
  onRetry,
  retryingIds,
  expandedId: controlledExpandedId,
  onToggleRow,
  onRefreshDetail,
  onRowClick,
  expandedDetails = {},
}) => {
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(null);
  const expandedId =
    controlledExpandedId !== undefined ? controlledExpandedId : internalExpandedId;

  const handleRowClick = (evt: WebhookEvent) => {
    if (onToggleRow) {
      onToggleRow(evt);
    } else {
      const isCurrentlyExpanded = internalExpandedId === evt.id;
      setInternalExpandedId(isCurrentlyExpanded ? null : evt.id);
      if (!isCurrentlyExpanded && onRowClick) {
        onRowClick(evt);
      }
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;

      // Database and API maintain all timestamps in Indian Standard Time (IST, UTC+05:30).
      // Formatting with timeZone: 'UTC' preserves the exact stored IST date and time
      // components consistently across any client browser locale or SSR.
      const formatted = d.toLocaleString('en-IN', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      return `${formatted} IST`;
    } catch {
      return isoString;
    }
  };

  const getProcessingHistory = (evt: WebhookEvent): RetryAttempt[] => {
    return evt.processingAttempts && evt.processingAttempts.length > 0
      ? evt.processingAttempts
      : evt.retries || [];
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
        <span className="text-gray-400 text-[11px] hidden sm:inline">
          Click any row to expand details, payload & processing history
        </span>
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
              <th className="py-3 px-4">Received At (IST)</th>
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
                const isExpanded = expandedId === evt.id;
                const isRetrying = retryingIds.has(evt.id) || evt.status === 'processing';
                const attemptCount = getAttemptCount(evt);
                const maxAttempts = getMaxAttempts(evt);
                const errorMsg = getErrorMessage(evt);
                const displayId = evt.eventId || evt.id;
                const displayType = evt.eventType || evt.type || 'unknown';
                const receivedTime = evt.receivedAt || evt.createdAt;
                const normalizedStatus = (evt.status || '').toLowerCase().replace(/_/g, ' ').trim();
                const isPermanentlyFailed =
                  normalizedStatus === 'permanently failed' || normalizedStatus === 'failed';
                const showRetryButton = isPermanentlyFailed || retryingIds.has(evt.id);
                const detail = expandedDetails[evt.id];

                return (
                  <React.Fragment key={evt.id}>
                    {/* Main Row */}
                    <tr
                      onClick={() => handleRowClick(evt)}
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
                          {!detail || (detail.loading && !detail.event) ? (
                            <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-xs text-center space-y-3">
                              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-gray-900">Loading Event Details & Attempt History...</h4>
                                <p className="text-xs text-gray-500 font-mono">
                                  Fetching live data from <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[11px]">GET /events/{displayId}</code> and <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[11px]">GET /events/{displayId}/attempts</code>
                                </p>
                              </div>
                            </div>
                          ) : detail.error && !detail.event ? (
                            <div className="bg-white border border-red-200 rounded-lg p-6 shadow-xs space-y-3">
                              <div className="flex items-center gap-2 text-red-700">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span className="font-semibold text-sm">Failed to load event data from API</span>
                              </div>
                              <p className="text-xs text-red-600 font-mono bg-red-50 p-2.5 rounded border border-red-200">
                                {detail.error}
                              </p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onRefreshDetail) {
                                    onRefreshDetail(evt);
                                  } else {
                                    onRowClick?.(evt);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition cursor-pointer"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>Retry API Request</span>
                              </button>
                            </div>
                          ) : (
                            (() => {
                              const apiEvent = detail.event!;
                              const apiAttempts = detail.attempts || [];
                              const apiError = apiEvent.lastError || apiEvent.lastErrorMessage;
                              const apiDisplayId = apiEvent.eventId || apiEvent.id;
                              const apiAttemptCount = apiAttempts.length > 0 ? apiAttempts.length : (apiEvent.totalAttempts ?? 0);
                              const apiMaxAttempts = apiEvent.maxAttempts || 5;

                              return (
                                <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-5">
                                  {/* Summary Ribbon */}
                                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 text-xs">
                                    <div className="flex flex-wrap items-center gap-4">
                                      <div>
                                        <span className="text-gray-400 font-medium mr-1.5">ID:</span>
                                        <span className="font-mono font-bold text-gray-900">{apiEvent.id}</span>
                                      </div>
                                      {apiEvent.eventId && apiEvent.eventId !== apiEvent.id && (
                                        <div>
                                          <span className="text-gray-400 font-medium mr-1.5">Event Key:</span>
                                          <span className="font-mono font-medium text-gray-800">{apiDisplayId}</span>
                                        </div>
                                      )}
                                      <div>
                                        <span className="text-gray-400 font-medium mr-1.5">State:</span>
                                        <StatusBadge status={apiEvent.status} />
                                      </div>
                                      <div>
                                        <span className="text-gray-400 font-medium mr-1.5">Attempts:</span>
                                        <span className="font-semibold text-gray-900">
                                          {apiAttemptCount} / {apiMaxAttempts}
                                        </span>
                                      </div>
                                      <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <Database className="w-3 h-3 text-emerald-600" />
                                        <span>Live Polling (/events/:id & /events/:id/attempts)</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {detail.loading && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                          <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                          <span>Refreshing APIs...</span>
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (onRefreshDetail) {
                                            onRefreshDetail(evt);
                                          } else {
                                            onRowClick?.(evt);
                                          }
                                        }}
                                        disabled={detail.loading}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition border border-gray-200 cursor-pointer disabled:opacity-50"
                                        title="Fetch latest event data and attempt history from server"
                                      >
                                        <RotateCw className={`w-3 h-3 ${detail.loading ? 'animate-spin text-blue-600' : ''}`} />
                                        <span>Refresh APIs</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Timestamp Ribbon (IST) */}
                                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                                      <span className="text-gray-500 font-medium">Received (IST):</span>
                                      <span className="font-mono text-gray-900 font-semibold">
                                        {formatDate(apiEvent.receivedAt || apiEvent.createdAt)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-500 font-medium">Updated (IST):</span>
                                      <span className="font-mono text-gray-800">
                                        {formatDate(apiEvent.updatedAt)}
                                      </span>
                                    </div>
                                    {apiEvent.nextAttemptAt && (
                                      <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                        <span className="font-medium">Next Attempt (IST):</span>
                                        <span className="font-mono font-semibold">
                                          {formatDate(apiEvent.nextAttemptAt)}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Error Banner if error exists */}
                                  {apiError && (
                                    <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5 flex-1">
                                        <div className="font-bold text-red-900 uppercase tracking-wide text-[10px]">
                                          Error Message
                                        </div>
                                        <div className="font-mono text-xs">{apiError}</div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Main Grid: Payload & Processing History */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    {/* Left Column: Received Event Payload (from GET /events/:id) */}
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                                          <span>Received Event Payload (GET /events/:id)</span>
                                        </h4>
                                      </div>

                                      {/* Key fields quick summary */}
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                          <div className="text-[10px] text-gray-400 font-semibold uppercase">Order ID</div>
                                          <div className="font-mono font-bold text-gray-900 truncate">
                                            {apiEvent.payload?.orderId || '-'}
                                          </div>
                                        </div>
                                        <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                          <div className="text-[10px] text-gray-400 font-semibold uppercase">Customer ID</div>
                                          <div className="font-mono font-bold text-gray-900 truncate">
                                            {apiEvent.payload?.customerId || '-'}
                                          </div>
                                        </div>
                                        {apiEvent.payload?.amount !== undefined && (
                                          <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                            <div className="text-[10px] text-gray-400 font-semibold uppercase">Amount</div>
                                            <div className="font-mono font-bold text-gray-900">
                                              {apiEvent.payload.amount} {apiEvent.payload.currency || 'USD'}
                                            </div>
                                          </div>
                                        )}
                                        {apiEvent.payload?.customerEmail && (
                                          <div className="p-2.5 rounded border border-gray-200 bg-gray-50/50">
                                            <div className="text-[10px] text-gray-400 font-semibold uppercase">Email</div>
                                            <div className="font-mono text-gray-900 truncate">
                                              {apiEvent.payload.customerEmail}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Raw JSON Payload block */}
                                      <div>
                                        <div className="text-[11px] text-gray-500 font-medium mb-1">
                                          Raw JSON Payload:
                                        </div>
                                        <pre className="text-xs font-mono bg-gray-900 text-emerald-400 p-3 rounded-lg overflow-x-auto max-h-64">
                                          {JSON.stringify(apiEvent.payload, null, 2)}
                                        </pre>
                                      </div>
                                    </div>

                                    {/* Right Column: Processing History & Attempts (from GET /events/:id/attempts) */}
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                          <span>
                                            Attempt History ({apiAttempts.length} {apiAttempts.length === 1 ? 'attempt' : 'attempts'} from GET /events/:id/attempts)
                                          </span>
                                        </h4>
                                      </div>

                                      {apiAttempts.length === 0 ? (
                                        <div className="text-center py-10 px-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500 space-y-1">
                                          <Server className="w-6 h-6 mx-auto text-gray-400" />
                                          <p className="font-medium text-gray-700">No attempts logged yet</p>
                                          <p className="text-[11px]">
                                            {apiEvent.status === 'processing'
                                              ? 'Event is currently in the worker queue.'
                                              : 'Awaiting retry or initial processing trigger.'}
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                                          {apiAttempts.map((attempt: RetryAttempt, idx: number) => {
                                            const isRunning =
                                              !attempt.result &&
                                              !attempt.finishedAt &&
                                              (attempt.status === 'processing' || !attempt.status);

                                            const isSuccess =
                                              !isRunning &&
                                              (attempt.status === 'success' ||
                                                attempt.result === 'success' ||
                                                (attempt.statusCode && attempt.statusCode < 400));

                                            const attemptTime =
                                              attempt.timestamp || attempt.startedAt || attempt.finishedAt;

                                            const attemptError = attempt.errorMessage || attempt.error;

                                            return (
                                              <div
                                                key={attempt.id || idx}
                                                className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                                                  isRunning
                                                    ? 'border-amber-200 bg-amber-50/40'
                                                    : isSuccess
                                                      ? 'border-emerald-200 bg-emerald-50/40'
                                                      : 'border-red-200 bg-red-50/40'
                                                }`}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">
                                                      Attempt #{attempt.attemptNumber}
                                                    </span>
                                                    {isRunning ? (
                                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                                        <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                                                        In Progress
                                                      </span>
                                                    ) : (
                                                      <span
                                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                          isSuccess
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : 'bg-red-100 text-red-800 border border-red-200'
                                                        }`}
                                                      >
                                                        {attempt.statusCode ? `HTTP ${attempt.statusCode} ` : ''}
                                                        {isSuccess
                                                          ? 'Success'
                                                          : attempt.result === 'abandoned'
                                                            ? 'Abandoned'
                                                            : 'Failed'}
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div className="text-gray-500 text-[11px]">
                                                    {isRunning
                                                      ? 'Executing... • '
                                                      : attempt.durationMs
                                                        ? `${attempt.durationMs}ms • `
                                                        : ''}
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
                              );
                            })()
                          )}
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
        <span>Expanded: {expandedId ? 1 : 0} of {events.length} rows</span>
      </div>
    </div>
  );
};
