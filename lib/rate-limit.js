/**
 * Simple in-memory rate limiting for API endpoints
 *
 * Uses a fixed window approach - tracks request counts per IP
 * within a time window and blocks when limit is exceeded.
 *
 * For a localhost-only application, this provides protection
 * against runaway scripts or accidental DoS.
 */

// Configuration (can be overridden via environment variables)
const WINDOW_MS = parseInt(process.env.NSMA_RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const MAX_REQUESTS = parseInt(process.env.NSMA_RATE_LIMIT_MAX || '100', 10); // per window

// In-memory storage for request counts
// Map<ip, { count: number, windowStart: number }>
const requestCounts = new Map();

// Cleanup interval to prevent memory leaks (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Periodic cleanup of expired entries
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    for (const [key, data] of requestCounts) {
      if (data.windowStart < windowStart) {
        requestCounts.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't prevent process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a request from an IP should be rate limited
 *
 * @param {string} ip - The client IP address
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(ip) {
  // Start cleanup timer on first call
  startCleanup();

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let data = requestCounts.get(ip);

  // Reset if window has expired
  if (!data || data.windowStart < windowStart) {
    data = { count: 0, windowStart: now };
  }

  // Increment counter
  data.count++;
  requestCounts.set(ip, data);

  const allowed = data.count <= MAX_REQUESTS;
  const remaining = Math.max(0, MAX_REQUESTS - data.count);
  const resetAt = data.windowStart + WINDOW_MS;

  return { allowed, remaining, resetAt };
}

/**
 * Get rate limit configuration
 * @returns {{ windowMs: number, maxRequests: number }}
 */
export function getRateLimitConfig() {
  return {
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
  };
}

/**
 * Clear rate limit data for an IP (for testing)
 * @param {string} ip - The IP to clear
 */
export function clearRateLimitForIp(ip) {
  requestCounts.delete(ip);
}

/**
 * Get current stats (for debugging/monitoring)
 * @returns {{ trackedIps: number, config: object }}
 */
export function getRateLimitStats() {
  return {
    trackedIps: requestCounts.size,
    config: getRateLimitConfig(),
  };
}
