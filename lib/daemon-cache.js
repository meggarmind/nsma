import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Hardcoded service name - prevents injection if extended in future
const SERVICE_NAME = 'notion-sync.service';

/**
 * In-memory cache for daemon status
 * TTL: 30 seconds - matches typical polling intervals
 *
 * This reduces shell spawns from 2/request to 2/30s (~95% reduction)
 */
const cache = {
  data: null,
  timestamp: 0,
  TTL: 30000  // 30 seconds in milliseconds
};

/**
 * Check if cache is still valid
 * @returns {boolean}
 */
function isCacheValid() {
  return cache.data !== null &&
         (Date.now() - cache.timestamp) < cache.TTL;
}

/**
 * Get daemon status with caching
 * Fetches from systemctl only if cache is expired
 *
 * @returns {Promise<{running: boolean, status: string, uptime: string|null}>}
 */
export async function getDaemonStatus() {
  // Return cached data if valid
  if (isCacheValid()) {
    return cache.data;
  }

  // Fetch fresh data from systemctl
  const daemonStatus = {
    running: false,
    status: 'unknown',
    uptime: null
  };

  try {
    // Use execFile with explicit argument array - prevents shell injection
    const { stdout } = await execFileAsync('systemctl', ['--user', 'is-active', SERVICE_NAME])
      .catch(() => ({ stdout: 'inactive' })); // Fallback if command fails

    const status = stdout.trim();
    daemonStatus.running = status === 'active';
    daemonStatus.status = status;

    // Get uptime if running
    if (daemonStatus.running) {
      try {
        const { stdout: propOutput } = await execFileAsync('systemctl', [
          '--user', 'show', SERVICE_NAME, '--property=ActiveEnterTimestamp'
        ]);
        const match = propOutput.match(/ActiveEnterTimestamp=(.+)/);
        if (match && match[1]) {
          // Parse systemctl format: "Mon 2025-12-29 01:32:45 WAT"
          // Extract date/time parts and convert to ISO
          const parts = match[1].match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
          if (parts) {
            // Store as ISO-ish format that JavaScript can parse
            daemonStatus.uptime = `${parts[1]}T${parts[2]}`;
          } else {
            daemonStatus.uptime = match[1]; // Fallback to raw value
          }
        }
      } catch (error) {
        console.debug('[daemon-cache] Uptime fetch failed:', error.message);
      }
    }
  } catch (error) {
    // systemctl not available or service not found
    console.debug('[daemon-cache] systemctl unavailable:', error.message);
    daemonStatus.status = 'not-installed';
  }

  // Update cache
  cache.data = daemonStatus;
  cache.timestamp = Date.now();

  return daemonStatus;
}

/**
 * Invalidate the cache
 * Call this after daemon start/stop/restart operations
 */
export function invalidateDaemonCache() {
  cache.data = null;
  cache.timestamp = 0;
}

/**
 * Get cache TTL in milliseconds
 * @returns {number}
 */
export function getCacheTTL() {
  return cache.TTL;
}
