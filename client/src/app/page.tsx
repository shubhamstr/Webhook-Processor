'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WebhookEvent, WebhookStatus, WebhookEventType, WebhookStats } from '../types/webhook';
import { WebhookTable } from '../components/WebhookTable';
import { StatusCounts } from '../components/StatusCounts';
import { Filter, Search, Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function WebhookProcessorDashboard() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
          statusCode: att.result === 'success' ? 200 : 500,
          errorMessage: att.error || att.errorMessage,
          responseBody: att.result ? JSON.stringify({ result: att.result }) : undefined,
          status: att.result === 'success' ? 'success' : 'failed',
          workerId: att.workerId,
        })),
      }));

      setEvents(mapped);
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

  // Simple periodic polling to refresh events and statistics every 2.5 seconds
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
    fetchStats();

    const interval = setInterval(() => {
      fetchEvents();
      fetchStats();
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchEvents, fetchStats]);

  // Handle Retry Trigger
  const handleRetry = async (eventId: string) => {
    const targetEvent = events.find((e) => e.id === eventId);
    if (!targetEvent) return;

    setRetryingIds((prev) => new Set(prev).add(eventId));

    try {
      // Re-submit event payload to the webhooks endpoint to trigger processing
      await fetch(`${API_BASE_URL}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: targetEvent.eventId || targetEvent.id,
          type: targetEvent.eventType || targetEvent.type || 'order.created',
          data: targetEvent.payload,
        }),
      });

      // Refetch updated events and stats from backend
      await Promise.all([fetchEvents(), fetchStats()]);
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
            <h1 className="text-2xl font-bold text-gray-900">Webhook Processor</h1>
            <p className="text-sm text-gray-500 mt-1">
              Received events, current state, attempt counts, processing history and error messages.
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
          />
        )}
      </div>
    </div>
  );
}
