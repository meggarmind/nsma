'use client';

import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { Toast as ToastType, ToastType as ToastVariant } from '@/types';

export interface ToastProps {
  /** Array of toast messages to display */
  toasts: ToastType[];
  /** Callback to remove a toast by id */
  removeToast: (id: string) => void;
}

const iconMap: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
};

const styleMap: Record<ToastVariant, string> = {
  success: 'bg-green-500/20 border-green-500/50 text-green-100',
  error: 'bg-red-500/20 border-red-500/50 text-red-100',
  warning: 'bg-amber-500/20 border-amber-500/50 text-amber-100',
  info: 'bg-blue-500/20 border-blue-500/50 text-blue-100'
};

export default function Toast({ toasts, removeToast }: ToastProps) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type] || Info;
        const styles = styleMap[toast.type] || 'bg-dark-800 border-dark-700 text-dark-100';

        return (
          <div
            key={toast.id}
            role="alert"
            className={`${styles} border rounded-lg p-4 shadow-lg backdrop-blur-sm animate-slide-in flex items-start gap-3`}
          >
            <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity p-1 rounded focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Dismiss notification"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
