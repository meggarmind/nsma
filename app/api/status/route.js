import { getLogs, getSettings } from '@/lib/storage';
import { getDaemonStatus } from '@/lib/daemon-cache';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';

/**
 * Get sync system status including daemon state and recent metrics
 * GET /api/status
 *
 * Uses cached daemon status (30s TTL) to reduce shell spawns
 */
export async function GET() {
  try {
    // Get cached daemon status (reduces shell spawns by ~95%)
    const daemonStatus = await getDaemonStatus();

    // Get recent sync logs
    const logs = await getLogs(50);
    const recentLogs = logs.slice(-10).reverse(); // Last 10, most recent first

    // Calculate metrics from recent syncs
    const last24h = logs.filter(log => {
      const logTime = new Date(log.timestamp);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return logTime >= dayAgo;
    });

    // Helper to get error count (handles both number and array formats)
    const getErrorCount = (log) => {
      if (typeof log.errors === 'number') return log.errors;
      if (Array.isArray(log.errors)) return log.errors.length;
      if (typeof log.failed === 'number') return log.failed;
      return 0;
    };

    const metrics = {
      syncsLast24h: last24h.length,
      itemsLast24h: last24h.reduce((sum, log) => sum + (log.imported || 0) + (log.updated || 0), 0),
      errorsLast24h: last24h.reduce((sum, log) => sum + getErrorCount(log), 0),
      lastSync: logs.length > 0 ? logs[logs.length - 1] : null,
      successRate: calculateSuccessRate(last24h)
    };

    // Get settings for sync interval
    const settings = await getSettings();
    const intervalMs = (settings.syncIntervalMinutes || 15) * 60 * 1000;

    // Calculate sync times based on daemon startup + interval alignment
    // (setInterval fires at fixed intervals from startup, not from last sync completion)
    let nextSyncAt = null;
    let lastCheckAt = null;
    if (daemonStatus.running && daemonStatus.uptime) {
      const daemonStartTime = new Date(daemonStatus.uptime).getTime();
      const now = Date.now();

      // How many intervals have passed since daemon started?
      const intervalsPassed = Math.floor((now - daemonStartTime) / intervalMs);

      // Next sync = start time + (intervals passed + 1) * interval
      const nextSyncTime = daemonStartTime + ((intervalsPassed + 1) * intervalMs);
      nextSyncAt = new Date(nextSyncTime).toISOString();

      // Last check = when daemon last checked (most recent interval that fired)
      if (intervalsPassed > 0) {
        lastCheckAt = new Date(daemonStartTime + (intervalsPassed * intervalMs)).toISOString();
      } else {
        // Initial sync just ran
        lastCheckAt = new Date(daemonStartTime).toISOString();
      }
    }

    return jsonWithCache({
      daemon: daemonStatus,
      metrics,
      recentLogs,
      syncIntervalMinutes: settings.syncIntervalMinutes || 15,
      nextSyncAt,
      lastCheckAt,
      // Pause state
      syncPausedUntil: settings.syncPausedUntil || null,
      syncPauseType: settings.syncPauseType || null
    }, { maxAge: CACHE_DURATIONS.status });
  } catch (error) {
    console.error('Status API error:', error);
    return jsonError(error.message);
  }
}

function calculateSuccessRate(logs) {
  if (logs.length === 0) return 100;

  // Helper to get error count (handles both number and array formats)
  const getErrorCount = (log) => {
    if (typeof log.errors === 'number') return log.errors;
    if (Array.isArray(log.errors)) return log.errors.length;
    if (typeof log.failed === 'number') return log.failed;
    return 0;
  };

  const successItems = logs.reduce((sum, log) => sum + (log.imported || 0) + (log.updated || 0), 0);
  const errorItems = logs.reduce((sum, log) => sum + getErrorCount(log), 0);
  const totalItems = successItems + errorItems;

  if (totalItems === 0) return 100;

  return Math.round((successItems / totalItems) * 100);
}
