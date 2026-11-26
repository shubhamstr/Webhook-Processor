'use client';

import React, { useState } from 'react';
import { WebhookEventType, WebhookStatus } from '../types/webhook';
import { X, Send } from 'lucide-react';

interface SimulateWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulate: (data: {
    type: WebhookEventType;
    orderId: string;
    customerId: string;
    initialStatus: WebhookStatus;
    simulateFailure: boolean;
    amount?: number;
    currency?: string;
  }) => void;
}

export const SimulateWebhookModal: React.FC<SimulateWebhookModalProps> = ({
  isOpen,
  onClose,
  onSimulate,
}) => {
  const [eventType, setEventType] = useState<WebhookEventType>('order.created');
  const [orderId, setOrderId] = useState(`ord_${Math.floor(1000000 + Math.random() * 9000000)}`);
  const [customerId, setCustomerId] = useState(`cust_${Math.floor(1000 + Math.random() * 9000)}`);
  const [amount, setAmount] = useState(199.99);
  const [currency, setCurrency] = useState('USD');
  const [behavior, setBehavior] = useState<'processing' | 'success' | 'failure'>('processing');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let initialStatus: WebhookStatus = 'processing';
    let simulateFailure = false;

    if (behavior === 'success') {
      initialStatus = 'completed';
    } else if (behavior === 'failure') {
      simulateFailure = true;
    }

    onSimulate({
      type: eventType,
      orderId: orderId.trim() || `ord_${Date.now()}`,
      customerId: customerId.trim() || `cust_1001`,
      initialStatus,
      simulateFailure,
      amount: Number(amount) || 0,
      currency,
    });

    // Reset random values for next time
    setOrderId(`ord_${Math.floor(1000000 + Math.random() * 9000000)}`);
    setCustomerId(`cust_${Math.floor(1000 + Math.random() * 9000)}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="relative w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">
              Simulate Webhook Event
            </h3>
            <p className="text-xs text-gray-500">
              Create a test webhook to trigger processor
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-gray-700 mb-1">
              Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as WebhookEventType)}
              className="w-full font-mono px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="order.created">order.created</option>
              <option value="order.updated">order.updated</option>
              <option value="order.cancelled">order.cancelled</option>
              <option value="payment.succeeded">payment.succeeded</option>
              <option value="payment.failed">payment.failed</option>
              <option value="customer.created">customer.created</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Order ID
              </label>
              <input
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full font-mono px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Customer ID
              </label>
              <input
                type="text"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full font-mono px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Currency
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full font-mono uppercase px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Behavior Simulation */}
          <div>
            <label className="block font-medium text-gray-700 mb-1.5">
              Simulation Outcome
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBehavior('processing')}
                className={`p-2 rounded-lg border text-center transition cursor-pointer ${
                  behavior === 'processing'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Processing
              </button>
              <button
                type="button"
                onClick={() => setBehavior('success')}
                className={`p-2 rounded-lg border text-center transition cursor-pointer ${
                  behavior === 'success'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setBehavior('failure')}
                className={`p-2 rounded-lg border text-center transition cursor-pointer ${
                  behavior === 'failure'
                    ? 'border-red-600 bg-red-50 text-red-800 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Fail & Retry
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Simulate Webhook
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
