'use client';

import { ToastProvider } from '@/hooks/useToast';
import { AppDataProvider } from '@/hooks/useAppData';

/**
 * Client-side providers wrapper
 *
 * Wraps all client-side context providers in a single component
 * for use in the server-side root layout.
 */
export default function ClientProviders({ children }) {
  return (
    <ToastProvider>
      <AppDataProvider>
        {children}
      </AppDataProvider>
    </ToastProvider>
  );
}
