'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useWindowFocus } from './useWindowFocus';
import type { Project, InboxData, SyncStatus, SyncMetrics } from '@/types';

/**
 * Centralized polling configuration
 * - Faster when window is focused for responsive UI
 * - Slower when blurred to save resources
 */
const POLLING_CONFIG = {
  focusedInterval: 15000,    // 15s when focused (general data)
  blurredInterval: 60000,    // 60s when blurred
  statusInterval: 5000,      // 5s for status (sync detection - needs to be fast)
};

/**
 * Request deduplication - tracks in-flight requests with TTL
 * Prevents duplicate requests when multiple components mount simultaneously
 * Includes TTL-based cleanup to prevent memory leaks if promises reject unexpectedly
 */
interface InFlightRequest {
  promise: Promise<unknown>;
  timestamp: number;
}

const inFlightRequests = new Map<string, InFlightRequest>();
const REQUEST_TTL = 30000; // 30 seconds max lifetime for any request entry

async function fetchWithDedup<T>(url: string): Promise<T> {
  const now = Date.now();

  // Check for existing in-flight request
  const existing = inFlightRequests.get(url);
  if (existing && (now - existing.timestamp) < REQUEST_TTL) {
    return existing.promise as Promise<T>;
  }

  // Clean up any stale entries (safety mechanism)
  if (existing) {
    inFlightRequests.delete(url);
  }

  // Create new request with timestamp tracking
  const promise = fetch(url)
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
    .finally(() => inFlightRequests.delete(url));

  inFlightRequests.set(url, { promise, timestamp: now });
  return promise as Promise<T>;
}

// =============================================================================
// Types
// =============================================================================

interface AppDataState {
  projects: Project[];
  status: SyncStatus | null;
  inbox: InboxData;
  isLoading: boolean;
  errors: Record<string, string | null>;
}

type DataType = 'projects' | 'status' | 'inbox';

interface AppDataContextValue {
  // Data
  projects: Project[];
  status: SyncStatus | null;
  inbox: InboxData;
  isLoading: boolean;
  errors: Record<string, string | null>;

  // Actions
  refresh: (type: DataType) => Promise<unknown>;
  refreshAll: () => Promise<void>;

  // Derived data (convenience selectors)
  inboxCount: number;
  daemonRunning: boolean;
  lastSync: SyncMetrics['lastSync'] | null;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface AppDataProviderProps {
  children: ReactNode;
}

/**
 * AppDataProvider - Centralized data polling and state management
 *
 * Replaces 7 separate polling loops with:
 * - Single main loop for projects/inbox (15s focused, 60s blurred)
 * - Separate fast loop for status (5s focused, 60s blurred)
 * - Request deduplication
 * - Shared state across all components
 */
export function AppDataProvider({ children }: AppDataProviderProps) {
  const isFocused = useWindowFocus();

  // Centralized state for all polled data
  const [data, setData] = useState<AppDataState>({
    projects: [],
    status: null,
    inbox: { items: [], stats: { total: 0, processed: 0, pending: 0 }, count: 0 },
    isLoading: true,
    errors: {}
  });

  // Track if we've done initial fetch
  const initialFetchDone = useRef(false);

  /**
   * Fetch a specific data type with error handling
   */
  const fetchDataType = useCallback(async <T,>(type: DataType, url: string): Promise<T | null> => {
    try {
      const result = await fetchWithDedup<T>(url);
      setData(prev => ({
        ...prev,
        [type]: result,
        errors: { ...prev.errors, [type]: null }
      }));
      return result;
    } catch (error) {
      console.error(`Failed to fetch ${type}:`, error);
      setData(prev => ({
        ...prev,
        errors: { ...prev.errors, [type]: (error as Error).message }
      }));
      return null;
    }
  }, []);

  /**
   * Fetch all core data types
   */
  const fetchAll = useCallback(async () => {
    if (!initialFetchDone.current) {
      setData(prev => ({ ...prev, isLoading: true }));
    }

    await Promise.all([
      fetchDataType<Project[]>('projects', '/api/projects'),
      fetchDataType<SyncStatus>('status', '/api/status'),
      fetchDataType<InboxData>('inbox', '/api/inbox'),
    ]);

    initialFetchDone.current = true;
    setData(prev => ({ ...prev, isLoading: false }));
  }, [fetchDataType]);

  /**
   * Manual refresh for specific data type
   */
  const refresh = useCallback(async (type: DataType): Promise<unknown> => {
    const urls: Record<DataType, string> = {
      projects: '/api/projects',
      status: '/api/status',
      inbox: '/api/inbox',
    };
    if (urls[type]) {
      return fetchDataType(type, urls[type]);
    }
  }, [fetchDataType]);

  /**
   * Refresh all data (manual trigger)
   */
  const refreshAll = useCallback(async () => {
    return fetchAll();
  }, [fetchAll]);

  // Initial fetch on mount
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Main polling loop - projects and inbox (15s focused, 60s blurred)
  useEffect(() => {
    const interval = isFocused
      ? POLLING_CONFIG.focusedInterval
      : POLLING_CONFIG.blurredInterval;

    const timer = setInterval(() => {
      fetchDataType<Project[]>('projects', '/api/projects');
      fetchDataType<InboxData>('inbox', '/api/inbox');
    }, interval);

    return () => clearInterval(timer);
  }, [isFocused, fetchDataType]);

  // Status polling - faster for sync event detection (5s focused, 60s blurred)
  useEffect(() => {
    const statusInterval = isFocused
      ? POLLING_CONFIG.statusInterval
      : POLLING_CONFIG.blurredInterval;

    const timer = setInterval(() => {
      fetchDataType<SyncStatus>('status', '/api/status');
    }, statusInterval);

    return () => clearInterval(timer);
  }, [isFocused, fetchDataType]);

  const value: AppDataContextValue = {
    // Data
    projects: data.projects,
    status: data.status,
    inbox: data.inbox,
    isLoading: data.isLoading,
    errors: data.errors,

    // Actions
    refresh,
    refreshAll,

    // Derived data (convenience selectors)
    inboxCount: data.inbox?.count || data.inbox?.items?.length || 0,
    daemonRunning: data.status?.daemon?.running || false,
    lastSync: data.status?.metrics?.lastSync || null,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access all app data
 */
export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}

/**
 * Selector hook for projects only
 * Use this to avoid re-renders when other data changes
 */
export function useProjects() {
  const { projects, refresh, isLoading, errors } = useAppData();
  return {
    projects,
    isLoading,
    error: errors.projects,
    refresh: () => refresh('projects')
  };
}

/**
 * Selector hook for status only
 */
export function useStatus() {
  const { status, daemonRunning, lastSync, refresh, errors } = useAppData();
  return {
    status,
    daemonRunning,
    lastSync,
    error: errors.status,
    refresh: () => refresh('status')
  };
}

/**
 * Selector hook for inbox only
 */
export function useInbox() {
  const { inbox, inboxCount, refresh, errors } = useAppData();
  return {
    inbox,
    items: inbox?.items || [],
    stats: inbox?.stats || { total: 0, processed: 0, pending: 0 },
    count: inboxCount,
    error: errors.inbox,
    refresh: () => refresh('inbox')
  };
}
