'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from './useToast';
import { useWindowFocus } from './useWindowFocus';

/**
 * Hook to detect and notify about background sync events
 *
 * Polls the system status API and compares timestamps to detect
 * when a background sync (daemon) has completed. Shows toast
 * notifications for new sync events.
 *
 * Features:
 * - Faster polling when window is focused (5s vs 30s)
 * - Tracks last known sync timestamp to detect changes
 * - Debounces notifications to prevent spam
 * - Shows appropriate toast type based on sync result (success/warning/error)
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.focusedInterval=5000] - Polling interval when focused (ms)
 * @param {number} [options.blurredInterval=30000] - Polling interval when blurred (ms)
 * @param {boolean} [options.enabled=true] - Whether to enable polling
 * @returns {Object} - { lastSync, status, isPolling }
 */
export function useSyncEvents(options = {}) {
  const {
    focusedInterval = 5000,
    blurredInterval = 30000,
    enabled = true
  } = options;

  const { showToast } = useToast();
  const isFocused = useWindowFocus();

  const [status, setStatus] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  // Use refs to avoid stale closures in interval callback
  const lastKnownSyncRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const lastNotificationTimeRef = useRef(0);

  // Notification debounce time (ms) - prevent spam for rapid syncs
  const NOTIFICATION_DEBOUNCE = 2000;

  /**
   * Fetch current sync status and check for new events
   */
  const checkForSyncEvents = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsPolling(true);
      const res = await fetch('/api/status');

      if (!res.ok) {
        console.warn('Failed to fetch status:', res.status);
        return;
      }

      const data = await res.json();
      setStatus(data);

      const currentSyncTime = data.lastSync?.timestamp;

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
        const { imported, updated, errors } = data.lastSync || {};
        const totalProcessed = (imported || 0) + (updated || 0);

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
    } catch (error) {
      console.error('Error checking sync events:', error);
    } finally {
      setIsPolling(false);
    }
  }, [enabled, showToast]);

  // Set up polling with dynamic interval based on focus
  useEffect(() => {
    if (!enabled) return;

    // Initial check
    checkForSyncEvents();

    // Set up interval with appropriate timing
    const interval = isFocused ? focusedInterval : blurredInterval;
    const timerId = setInterval(checkForSyncEvents, interval);

    return () => clearInterval(timerId);
  }, [enabled, isFocused, focusedInterval, blurredInterval, checkForSyncEvents]);

  return {
    lastSync: status?.lastSync || null,
    status,
    isPolling
  };
}

export default useSyncEvents;
