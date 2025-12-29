import { NextResponse } from 'next/server';

/**
 * Cache durations in seconds for different endpoint types
 * These values balance freshness with reduced server load
 */
export const CACHE_DURATIONS = {
  status: 5,        // Daemon status - short cache (sync detection needs freshness)
  inbox: 10,        // Inbox items - slightly longer
  projects: 30,     // Project list - moderate cache
  logs: 30,         // Sync logs - moderate cache
  analytics: 30,    // Analytics data - moderate cache
  settings: 60,     // Settings - longer cache (rarely changes)
};

/**
 * Create a JSON response with appropriate Cache-Control headers
 *
 * @param {object} data - Response data
 * @param {object} options - Response options
 * @param {number} [options.maxAge=0] - Cache duration in seconds (0 = no cache)
 * @param {number} [options.status=200] - HTTP status code
 * @returns {NextResponse}
 */
export function jsonWithCache(data, { maxAge = 0, status = 200 } = {}) {
  const headers = {};

  if (maxAge > 0) {
    // 'private' prevents CDN caching while allowing browser cache
    headers['Cache-Control'] = `private, max-age=${maxAge}`;
  }

  return NextResponse.json(data, { status, headers });
}

/**
 * Create an error response (never cached)
 *
 * @param {string} message - Error message
 * @param {number} [status=500] - HTTP status code
 * @returns {NextResponse}
 */
export function jsonError(message, status = 500) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
