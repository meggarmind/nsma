'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useWindowFocus } from './useWindowFocus';

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
 * Request deduplication - tracks in-flight requests
 * Prevents duplicate requests when multiple components mount simultaneously
 */
const inFlightRequests = new Map();

async function fetchWithDedup(url) {
  // Return existing promise if request is in-flight
  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url);
  }

  // Create new request
  const promise = fetch(url)
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
    .finally(() => inFlightRequests.delete(url));

  inFlightRequests.set(url, promise);
  return promise;
}

const AppDataContext = createContext(null);

/**
 * AppDataProvider - Centralized data polling and state management
 *
 * Replaces 7 separate polling loops with:
 * - Single main loop for projects/inbox (15s focused, 60s blurred)
 * - Separate fast loop for status (5s focused, 60s blurred)
 * - Request deduplication
 * - Shared state across all components
 */
export function AppDataProvider({ children }) {
  const isFocused = useWindowFocus();

  // Centralized state for all polled data
  const [data, setData] = useState({
    projects: [],
    status: null,
    inbox: { items: [], stats: {}, count: 0 },
    isLoading: true,
    errors: {}
  });

  // Track if we've done initial fetch
  const initialFetchDone = useRef(false);

  /**
   * Fetch a specific data type with error handling
   */
  const fetchDataType = useCallback(async (type, url) => {
    try {
      const result = await fetchWithDedup(url);
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
        errors: { ...prev.errors, [type]: error.message }
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
      fetchDataType('projects', '/api/projects'),
      fetchDataType('status', '/api/status'),
      fetchDataType('inbox', '/api/inbox'),
    ]);

    initialFetchDone.current = true;
    setData(prev => ({ ...prev, isLoading: false }));
  }, [fetchDataType]);

  /**
   * Manual refresh for specific data type
   */
  const refresh = useCallback(async (type) => {
    const urls = {
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
      fetchDataType('projects', '/api/projects');
      fetchDataType('inbox', '/api/inbox');
    }, interval);

    return () => clearInterval(timer);
  }, [isFocused, fetchDataType]);

  // Status polling - faster for sync event detection (5s focused, 60s blurred)
  useEffect(() => {
    const statusInterval = isFocused
      ? POLLING_CONFIG.statusInterval
      : POLLING_CONFIG.blurredInterval;

    const timer = setInterval(() => {
      fetchDataType('status', '/api/status');
    }, statusInterval);

    return () => clearInterval(timer);
  }, [isFocused, fetchDataType]);

  const value = {
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

/**
 * Hook to access all app data
 */
export function useAppData() {
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
    stats: inbox?.stats || {},
    count: inboxCount,
    error: errors.inbox,
    refresh: () => refresh('inbox')
  };
}
