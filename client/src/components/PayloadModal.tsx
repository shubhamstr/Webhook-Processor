'use client';

import React, { useState } from 'react';
import { WebhookEvent } from '../types/webhook';
import { X, Copy, Check } from 'lucide-react';

interface PayloadModalProps {
  event: WebhookEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PayloadModal: React.FC<PayloadModalProps> = ({ event, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !event) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="relative w-full max-w-lg bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">
              Webhook Data Payload
            </h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {event.id} • {event.type}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Highlighted IDs */}
        <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-200 grid grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 rounded border border-gray-200 bg-white">
            <div className="text-[10px] text-gray-400 font-semibold uppercase">Order ID</div>
            <div className="font-mono font-bold text-gray-900 mt-0.5">{event.payload.orderId}</div>
          </div>
          <div className="p-2.5 rounded border border-gray-200 bg-white">
            <div className="text-[10px] text-gray-400 font-semibold uppercase">Customer ID</div>
            <div className="font-mono font-bold text-gray-900 mt-0.5">{event.payload.customerId}</div>
          </div>
        </div>

        {/* JSON Viewer */}
        <div className="p-5 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              JSON Data
            </span>
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre className="text-xs font-mono bg-gray-900 text-emerald-400 p-3.5 rounded-lg overflow-x-auto">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
