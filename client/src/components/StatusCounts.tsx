'use client';

import React from 'react';
import { WebhookEvent } from '../types/webhook';

interface StatusCountsProps {
  events: WebhookEvent[];
  activeFilter?: string;
  onFilterChange?: (status: string) => void;
}

export const StatusCounts: React.FC<StatusCountsProps> = ({
  events,
  activeFilter = 'all',
  onFilterChange,
}) => {
  const total = events.length;
  const pending = events.filter(
    (e) => (e.status || '').toLowerCase() === 'pending'
  ).length;
  const processing = events.filter(
    (e) => (e.status || '').toLowerCase() === 'processing'
  ).length;
  const completed = events.filter(
    (e) => (e.status || '').toLowerCase() === 'completed'
  ).length;
  const permanentlyFailed = events.filter(
    (e) => (e.status || '').toLowerCase().includes('fail')
  ).length;

  const handleClick = (status: string) => {
    if (!onFilterChange) return;
    if (activeFilter === status && status !== 'all') {
      onFilterChange('all');
    } else {
      onFilterChange(status);
    }
  };

  const cards = [
    {
      key: 'all',
      label: 'Total Events',
      count: total,
      activeStyle: 'bg-blue-50 border-blue-300 ring-1 ring-blue-300',
      labelColor: 'text-gray-500',
    },
    {
      key: 'pending',
      label: 'Pending',
      count: pending,
      activeStyle: 'bg-blue-50 border-blue-400 ring-1 ring-blue-400',
      labelColor: 'text-blue-600',
    },
    {
      key: 'processing',
      label: 'Processing',
      count: processing,
      activeStyle: 'bg-amber-50 border-amber-300 ring-1 ring-amber-300',
      labelColor: 'text-amber-600',
    },
    {
      key: 'completed',
      label: 'Completed',
      count: completed,
      activeStyle: 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300',
      labelColor: 'text-emerald-600',
    },
    {
      key: 'failed',
      label: 'Permanently Failed',
      count: permanentlyFailed,
      activeStyle: 'bg-red-50 border-red-300 ring-1 ring-red-300',
      labelColor: 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
      {cards.map((card) => {
        const isSelected = activeFilter === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => handleClick(card.key)}
            className={`p-3 rounded-lg border text-left transition cursor-pointer ${
              isSelected
                ? card.activeStyle
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`${card.labelColor} font-medium`}>{card.label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{card.count}</div>
          </button>
        );
      })}
    </div>
  );
};
