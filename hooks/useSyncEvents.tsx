'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './useToast';
import { useStatus } from './useAppData';
import type { SyncStatus, SyncMetrics } from '@/types';

interface UseSyncEventsOptions {
  /** Whether to enable notifications */
  enabled?: boolean;
}

interface UseSyncEventsReturn {
  /** Last sync information */
  lastSync: SyncMetrics['lastSync'] | null;
  /** Current sync status */
  status: SyncStatus | null;
  /** Whether the hook is polling (always false - uses centralized polling) */
  isPolling: boolean;
}

/**
 * Hook to detect and notify about background sync events
 *
 * Uses centralized status from useAppData instead of its own polling.
 * Reacts to status changes and shows toast notifications when new syncs complete.
 *
 * Features:
 * - Uses centralized polling (no duplicate requests)
 * - Tracks last known sync timestamp to detect changes
 * - Debounces notifications to prevent spam
 * - Shows appropriate toast type based on sync result (success/warning/error)
 */
export function useSyncEvents(options: UseSyncEventsOptions = {}): UseSyncEventsReturn {
  const { enabled = true } = options;

  const { showToast } = useToast();
  const { status, lastSync } = useStatus();

  // Use refs to track state across renders
  const lastKnownSyncRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);
  const lastNotificationTimeRef = useRef(0);

  // Notification debounce time (ms) - prevent spam for rapid syncs
  const NOTIFICATION_DEBOUNCE = 2000;

  // React to status changes from centralized polling
  useEffect(() => {
    if (!enabled || !status) return;

    const currentSyncTime = status.metrics?.lastSync?.timestamp;

    // Skip if no sync data yet
    if (!currentSyncTime) return;

    // Skip notification on initial load (just record the timestamp)
    if (!hasInitializedRef.current) {
      lastKnownSyncRef.current = currentSyncTime;
      hasInitializedRef.current = true;
      return;
    }

    // Check if this is a new sync event
    if (currentSyncTime !== lastKnownSyncRef.current) {
      const now = Date.now();

      // Debounce rapid notifications
      if (now - lastNotificationTimeRef.current < NOTIFICATION_DEBOUNCE) {
        lastKnownSyncRef.current = currentSyncTime;
        return;
      }

      // Update tracking
      lastKnownSyncRef.current = currentSyncTime;
      lastNotificationTimeRef.current = now;

      // Determine notification type and message
      const syncData = status.metrics?.lastSync as {
        imported?: number;
        updated?: number;
        errors?: number;
      } | undefined;

      const imported = syncData?.imported || 0;
      const updated = syncData?.updated || 0;
      const errors = syncData?.errors || 0;
      const totalProcessed = imported + updated;

      if (errors > 0) {
        showToast(
          `Background sync completed with ${errors} error(s)`,
          'warning'
        );
      } else if (totalProcessed > 0) {
        showToast(
          `Background sync completed: ${totalProcessed} item(s) processed`,
          'success'
        );
      } else {
        // Sync ran but no items processed - still notify subtly
        showToast('Background sync completed', 'info', 3000);
      }
    }
  }, [enabled, status, showToast]);

  return {
    lastSync: status?.metrics?.lastSync || lastSync || null,
    status: status as SyncStatus | null,
    isPolling: false // No longer doing its own polling
  };
}

export default useSyncEvents;
