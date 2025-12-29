'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Toast from '@/components/ui/Toast';
import type { Toast as ToastType, ToastType as ToastVariant } from '@/types';

interface ToastContextValue {
  showToast: (message: string, type?: ToastVariant, duration?: number) => number;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== String(id)));
  }, []);

  const showToast = useCallback((message: string, type: ToastVariant = 'info', duration = 5000) => {
    const id = ++toastId;
    const newToast: ToastType = { id: String(id), message, type };

    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <Toast toasts={toasts} removeToast={(id) => removeToast(Number(id))} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
