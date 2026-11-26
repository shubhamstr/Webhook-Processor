'use client';

import React, { useState, useEffect } from 'react';
import { WebhookEvent, RetryAttempt } from '../types/webhook';
import { StatusBadge } from './StatusBadge';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
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
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

export const WebhookTable: React.FC<WebhookTableProps> = ({
  events,
  onRetry,
  retryingIds,
  expandedId: controlledExpandedId,
  onToggleRow,
  onRowClick,
  defaultPageSize = 100,
  pageSizeOptions = [10, 25, 50, 100, 200, 500],
}) => {
  const [internalExpandedId, setInternalExpandedId] = useState<string | null>(null);
  const expandedId =
    controlledExpandedId !== undefined ? controlledExpandedId : internalExpandedId;

  // Table pagination state with default limit of 100
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));

  // Auto-clamp current page if total pages change (e.g. on filter, search, or page size change)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const handlePageChange = (newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, totalPages));
    setCurrentPage(validPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    const newTotalPages = Math.max(1, Math.ceil(events.length / newSize));
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  };

  const startIndex = events.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, events.length);
  const paginatedEvents = events.slice(startIndex, endIndex);
  const displayStart = events.length === 0 ? 0 : startIndex + 1;

  // Generate numbered pages with smart ellipsis for navigation
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('...');
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

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

  const renderPaginationBar = (position: 'top' | 'bottom') => {
    const isTop = position === 'top';

    return (
      <div
        className={`py-2 px-4 bg-gray-50/90 flex flex-wrap items-center justify-between gap-3 text-xs select-none ${
          isTop ? 'border-b border-gray-200' : 'border-t border-gray-200'
        }`}
      >
        {/* Left: Summary & status info */}
        <div className="flex items-center gap-2 text-gray-600">
          {events.length === 0 ? (
            <span className="font-medium text-gray-500">No events to display</span>
          ) : (
            <span className="font-medium text-gray-700">
              Showing <span className="font-semibold text-gray-900">{displayStart}</span>–<span className="font-semibold text-gray-900">{endIndex}</span> of{' '}
              <span className="font-semibold text-gray-900">{events.length}</span> {events.length === 1 ? 'event' : 'events'}
            </span>
          )}
          {isTop && (
            <span className="text-gray-400 text-[11px] hidden lg:inline">
              (Click any row to expand details, payload & processing history)
            </span>
          )}
          {!isTop && (
            <span className="text-gray-400 text-[11px] hidden sm:inline">
              • Expanded: {expandedId ? 1 : 0} of {paginatedEvents.length} on this page
            </span>
          )}
        </div>

        {/* Right: Page size selector and Pagination navigation buttons */}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* Page size dropdown */}
          <div className="flex items-center gap-1.5 text-gray-600">
            <label htmlFor={`page-size-${position}`} className="text-gray-500 whitespace-nowrap text-xs">
              Rows per page:
            </label>
            <select
              id={`page-size-${position}`}
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white border border-gray-300 text-gray-800 text-xs rounded px-2 py-1 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium shadow-2xs"
              aria-label="Select rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-gray-300 hidden sm:block" />

          {/* Pagination Navigation Buttons */}
          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1}
              title="First page"
              aria-label="First page"
              className="p-1.5 rounded text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>

            {/* Previous Page */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              title="Previous page"
              aria-label="Previous page"
              className="p-1.5 rounded text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Mobile Page Indicator */}
            <span className="sm:hidden text-xs font-medium text-gray-700 px-1 whitespace-nowrap">
              Page {currentPage} of {totalPages}
            </span>

            {/* Desktop Numbered Page Buttons */}
            <div className="hidden sm:flex items-center gap-0.5">
              {pageNumbers.map((p, idx) => {
                if (p === '...') {
                  return (
                    <span key={`ellipsis-${position}-${idx}`} className="px-1 text-gray-400 select-none">
                      ...
                    </span>
                  );
                }
                const pageNum = Number(p);
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={`page-${position}-${pageNum}`}
                    type="button"
                    onClick={() => handlePageChange(pageNum)}
                    className={`min-w-[26px] h-6 px-1.5 text-xs rounded transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                        : 'text-gray-700 hover:bg-gray-200 font-medium'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    title={`Page ${pageNum}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            {/* Next Page */}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              title="Next page"
              aria-label="Next page"
              className="p-1.5 rounded text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Last Page */}
            <button
              type="button"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages}
              title="Last page"
              aria-label="Last page"
              className="p-1.5 rounded text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
      {/* Table Top: Pagination & Page Size */}
      {renderPaginationBar('top')}

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
            {paginatedEvents.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-400 text-sm">
                  {events.length === 0 ? 'No webhook events recorded yet.' : 'No webhook events found on this page.'}
                </td>
              </tr>
            ) : (
              paginatedEvents.map((evt) => {
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
                          {(() => {
                            const history = getProcessingHistory(evt);
                            const attempts = history;
                            const error = errorMsg;

                            return (
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
                                        <span className="font-mono font-medium text-gray-800">{displayId}</span>
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
                                    <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                      <Database className="w-3 h-3 text-emerald-600" />
                                      <span>Live Polling (GET /events)</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Timestamp Ribbon (IST) */}
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                                    <span className="text-gray-500 font-medium">Received (IST):</span>
                                    <span className="font-mono text-gray-900 font-semibold">
                                      {formatDate(receivedTime)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 font-medium">Updated (IST):</span>
                                    <span className="font-mono text-gray-800">
                                      {formatDate(evt.updatedAt)}
                                    </span>
                                  </div>
                                  {evt.nextAttemptAt && (
                                    <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      <span className="font-medium">Next Attempt (IST):</span>
                                      <span className="font-mono font-semibold">
                                        {formatDate(evt.nextAttemptAt)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Error Banner if error exists */}
                                {error && (
                                  <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                    <div className="space-y-0.5 flex-1">
                                      <div className="font-bold text-red-900 uppercase tracking-wide text-[10px]">
                                        Error Message
                                      </div>
                                      <div className="font-mono text-xs">{error}</div>
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
                                        Raw JSON Payload:
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
                                          Attempt History ({attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'})
                                        </span>
                                      </h4>
                                    </div>

                                    {attempts.length === 0 ? (
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
                                        {attempts.map((attempt: RetryAttempt, idx: number) => {
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
                          })()}
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

      {/* Table Bottom: Pagination & Page Size */}
      {renderPaginationBar('bottom')}
    </div>
  );
};
