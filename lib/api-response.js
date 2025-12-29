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
 * Messages that are safe to expose to clients
 * These are user-friendly and don't leak internal details
 */
const SAFE_MESSAGE_PATTERNS = [
  'not found',
  'invalid request',
  'unauthorized',
  'validation failed',
  'missing',
  'required',
  'already exists',
  'not configured',
  'rate limit',
];

/**
 * Sanitize an error for client response
 * Prevents leaking internal error details, stack traces, or file paths
 *
 * @param {Error|string} error - The error to sanitize
 * @returns {string} - Safe error message for client
 */
export function sanitizeError(error) {
  const message = error?.message || String(error) || 'An error occurred';
  const lowerMessage = message.toLowerCase();

  // Check if message matches known safe patterns
  const isSafe = SAFE_MESSAGE_PATTERNS.some(pattern =>
    lowerMessage.includes(pattern)
  );

  if (isSafe) {
    return message;
  }

  // Log the actual error for debugging (server-side only)
  console.error('API Error (sanitized for client):', message);

  // Return generic message for potentially sensitive errors
  return 'An internal error occurred';
}

/**
 * Create an error response (never cached)
 * Automatically sanitizes error messages to prevent information leakage
 *
 * @param {string|Error} error - Error message or Error object
 * @param {number} [status=500] - HTTP status code
 * @returns {NextResponse}
 */
export function jsonError(error, status = 500) {
  const message = typeof error === 'string' ? error : sanitizeError(error);

  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
