'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebhookEvent, WebhookStatus, WebhookEventType, WebhookStats, RetryAttempt, EventDetailState } from '../types/webhook';
import { WebhookTable } from '../components/WebhookTable';
import { StatusCounts } from '../components/StatusCounts';
import { Filter, Search, Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function WebhookProcessorDashboard() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, EventDetailState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const expandedIdRef = useRef<string | null>(null);
  const eventsRef = useRef<WebhookEvent[]>(events);

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Fetch real events from the backend server
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/events?limit=100`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      const rawEvents = Array.isArray(json) ? json : json?.data || [];

      const mapped: WebhookEvent[] = rawEvents.map((item: WebhookEvent) => ({
        ...item,
        id: item.id,
        eventId: item.eventId || item.id,
        type: (item.eventType || item.type || 'order.created') as WebhookEventType,
        eventType: item.eventType || item.type,
        status: item.status as WebhookStatus,
        payload: item.payload || {},
        totalAttempts: item.totalAttempts ?? item.processingAttempts?.length ?? 0,
        maxAttempts: item.maxAttempts ?? 5,
        lastErrorMessage: item.lastError || item.lastErrorMessage,
        processingAttempts: item.processingAttempts || [],
        retries: (item.processingAttempts || []).map((att) => ({
          attemptNumber: att.attemptNumber,
          timestamp: att.startedAt || att.timestamp,
          startedAt: att.startedAt,
          finishedAt: att.finishedAt,
          durationMs: att.durationMs,
          statusCode:
            att.result === 'success'
              ? 200
              : att.result === 'failure' || att.result === 'abandoned'
                ? 500
                : undefined,
          errorMessage: att.error || att.errorMessage,
          responseBody: att.result ? JSON.stringify({ result: att.result }) : undefined,
          status:
            att.result === 'success'
              ? 'success'
              : att.result === 'failure' || att.result === 'abandoned'
                ? 'failed'
                : 'processing',
          workerId: att.workerId,
        })),
      }));

      setEvents((prev) => {
        const prevMap = new Map(prev.map((e) => [e.id, e]));
        return mapped.map((item) => {
          const existing = prevMap.get(item.id);
          if (
            existing &&
            existing.processingAttempts &&
            existing.processingAttempts.length > (item.processingAttempts?.length ?? 0)
          ) {
            return {
              ...item,
              processingAttempts: existing.processingAttempts,
              retries: existing.retries,
              totalAttempts: Math.max(item.totalAttempts || 0, existing.processingAttempts.length),
            };
          }
          return item;
        });
      });
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to connect to backend server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch dashboard statistics from the backend server
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/stats`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats({
        total: data.total ?? data.totalEvents ?? 0,
        pending: data.pending ?? data.pendingEvents ?? 0,
        processing: data.processing ?? data.processingEvents ?? 0,
        completed: data.completed ?? data.completedEvents ?? 0,
        permanentlyFailed:
          data.permanentlyFailed ?? data.failed ?? data.completelyFailed ?? 0,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Fetch event details (GET /events/:id) and attempt history (GET /events/:id/attempts)
  const fetchEventDetail = useCallback(
    async (id: string, eventId?: string, isPolling = false) => {
      const targetId = eventId || id;
      if (!targetId) return;

      if (!isPolling) {
        setExpandedDetails((prev) => ({
          ...prev,
          [id]: {
            loading: true,
            event: prev[id]?.event || null,
            attempts: prev[id]?.attempts || null,
            error: null,
          },
        }));
      }

      try {
        // Parallel API calls:
        // 1. GET /events/:id (get event data)
        // 2. GET /events/:id/attempts (attempt history)
        const [eventRes, attemptsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/events/${encodeURIComponent(targetId)}`),
          fetch(`${API_BASE_URL}/events/${encodeURIComponent(targetId)}/attempts`),
        ]);

        if (!eventRes.ok) {
          throw new Error(
            `GET /events/${targetId} failed with HTTP ${eventRes.status} (${eventRes.statusText})`,
          );
        }
        if (!attemptsRes.ok) {
          throw new Error(
            `GET /events/${targetId}/attempts failed with HTTP ${attemptsRes.status} (${attemptsRes.statusText})`,
          );
        }

        const eventData: WebhookEvent = await eventRes.json();
        const attemptsJson = await attemptsRes.json();
        const rawAttempts: RetryAttempt[] = Array.isArray(attemptsJson)
          ? attemptsJson
          : (attemptsJson as { data?: RetryAttempt[]; attempts?: RetryAttempt[] })?.data ||
            (attemptsJson as { data?: RetryAttempt[]; attempts?: RetryAttempt[] })?.attempts ||
            [];

        // Map attempts from GET /events/:id/attempts
        const attempts: RetryAttempt[] = rawAttempts.map((att) => {
          const started = att.startedAt || att.timestamp;
          const finished = att.finishedAt;
          const duration =
            att.durationMs ??
            (started && finished
              ? new Date(finished).getTime() - new Date(started).getTime()
              : undefined);

          return {
            id: att.id,
            attemptNumber: att.attemptNumber,
            retryCycle: att.retryCycle,
            workerId: att.workerId,
            startedAt: att.startedAt,
            finishedAt: att.finishedAt,
            timestamp: started,
            statusCode:
              att.statusCode ??
              (att.result === 'success'
                ? 200
                : att.result === 'failure' || att.result === 'abandoned'
                  ? 500
                  : undefined),
            durationMs: duration,
            errorMessage: att.error || att.errorMessage,
            error: att.error || att.errorMessage,
            result: att.result,
            status:
              att.result === 'success'
                ? 'success'
                : att.result === 'failure' || att.result === 'abandoned'
                  ? 'failed'
                  : 'processing',
            responseBody: att.responseBody,
          };
        });

        // Save strictly from both APIs into expandedDetails
        setExpandedDetails((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            event: eventData,
            attempts,
            error: null,
          },
        }));

        // Keep events table row summary in sync with fresh state
        setEvents((prevEvents) =>
          prevEvents.map((evt) => {
            if (evt.id !== id && evt.eventId !== targetId) {
              return evt;
            }

            return {
              ...evt,
              status: eventData.status || evt.status,
              totalAttempts:
                attempts.length > 0
                  ? attempts.length
                  : eventData.totalAttempts ?? evt.totalAttempts,
              lastError: eventData.lastError ?? evt.lastError,
              lastErrorMessage: eventData.lastError ?? evt.lastErrorMessage,
            };
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch event details';
        setExpandedDetails((prev) => {
          const current = prev[id];
          if (isPolling && current?.event) {
            // Keep existing data on background polling error
            return prev;
          }
          return {
            ...prev,
            [id]: {
              loading: false,
              event: current?.event || null,
              attempts: current?.attempts || null,
              error: msg,
            },
          };
        });
      }
    },
    [],
  );

  // Toggle row expansion (single row open at a time)
  const handleToggleRow = useCallback(
    (evt: WebhookEvent) => {
      setExpandedId((prev) => {
        if (prev === evt.id) {
          return null;
        }
        fetchEventDetail(evt.id, evt.eventId, false);
        return evt.id;
      });
    },
    [fetchEventDetail],
  );

  // Explicit manual refresh for opened row APIs
  const handleRefreshDetail = useCallback(
    (evt: WebhookEvent) => {
      fetchEventDetail(evt.id, evt.eventId, false);
    },
    [fetchEventDetail],
  );

  // Periodic polling: refreshes events, stats, and if a row is opened, also polls its APIs:
  // - GET /events
  // - GET /stats
  // - GET /events/:id
  // - GET /events/:id/attempts
  useEffect(() => {
    let isMounted = true;

    const pollAll = async () => {
      try {
        const promises: Promise<unknown>[] = [fetchEvents(), fetchStats()];

        const currentExpandedId = expandedIdRef.current;
        if (currentExpandedId) {
          const currentEvent = eventsRef.current.find(
            (e) => e.id === currentExpandedId || e.eventId === currentExpandedId,
          );
          const targetId = currentEvent?.eventId || currentExpandedId;
          promises.push(fetchEventDetail(currentExpandedId, targetId, true));
        }

        await Promise.allSettled(promises);
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollAll();

    const interval = setInterval(() => {
      if (isMounted) {
        pollAll();
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchEvents, fetchStats, fetchEventDetail]);

  // Handle Retry Trigger
  const handleRetry = async (eventId: string) => {
    const targetEvent = events.find((e) => e.id === eventId || e.eventId === eventId);
    if (!targetEvent) return;

    setRetryingIds((prev) => new Set(prev).add(eventId));

    try {
      const targetId = targetEvent.id || targetEvent.eventId || eventId;
      const res = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(targetId)}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Failed to retry event: ${res.statusText}`);
      }

      // Refetch updated events, stats, and opened row details
      const promises: Promise<unknown>[] = [fetchEvents(), fetchStats()];
      if (expandedIdRef.current) {
        const curId = expandedIdRef.current;
        const curEvent = eventsRef.current.find((e) => e.id === curId || e.eventId === curId);
        promises.push(fetchEventDetail(curId, curEvent?.eventId || curId, false));
      }
      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Failed to trigger retry:', err);
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  // Filter events based on status and search query
  const filteredEvents = events.filter((evt) => {
    const normStatus = (evt.status || '').toLowerCase().replace(/_/g, ' ');
    if (filterStatus === 'processing' && normStatus !== 'processing') return false;
    if (filterStatus === 'completed' && normStatus !== 'completed') return false;
    if (filterStatus === 'failed' && normStatus !== 'permanently failed' && normStatus !== 'failed') return false;
    if (filterStatus === 'pending' && normStatus !== 'pending') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = (evt.id || '').toLowerCase().includes(q) || (evt.eventId || '').toLowerCase().includes(q);
      const matchType = (evt.type || evt.eventType || '').toLowerCase().includes(q);
      const matchOrder = (evt.payload?.orderId || '').toLowerCase().includes(q);
      const matchCustomer = (evt.payload?.customerId || '').toLowerCase().includes(q);
      const matchError = (evt.lastError || evt.lastErrorMessage || '').toLowerCase().includes(q);
      return matchId || matchType || matchOrder || matchCustomer || matchError;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header without manual refresh button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900">Webhook Processor</h1>
              <span className="text-[11px] font-medium font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Timezone: IST (UTC+05:30)
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Received events, current state, attempt counts, processing history and error messages (All timestamps in Indian Standard Time).
            </p>
          </div>
        </div>

        {/* Server connection error alert if any */}
        {fetchError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center justify-between">
            <span>
              <strong>Note:</strong> Unable to reach API server at{' '}
              <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">{API_BASE_URL}</code> ({fetchError}).
              Ensure the server is running on port 3001.
            </span>
          </div>
        )}

        {/* Status Metrics Badges */}
        <StatusCounts
          events={events}
          stats={stats}
          activeFilter={filterStatus}
          onFilterChange={setFilterStatus}
        />

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Event ID, Order ID, Customer ID, error..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span>Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent font-medium text-gray-800 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All States</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Permanently Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Webhook Events Table with Click-to-Expand Row Details */}
        {isLoading && events.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
            <p className="text-sm font-medium">Loading webhook events...</p>
          </div>
        ) : (
          <WebhookTable
            events={filteredEvents}
            onRetry={handleRetry}
            retryingIds={retryingIds}
            expandedId={expandedId}
            onToggleRow={handleToggleRow}
            onRefreshDetail={handleRefreshDetail}
            expandedDetails={expandedDetails}
          />
        )}
      </div>
    </div>
  );
}
