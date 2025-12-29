import { timingSafeEqual } from 'crypto';
import { getSettings } from './storage.js';

/**
 * Perform timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} - True if strings are equal
 */
function timingSafeCompare(a, b) {
  if (!a || !b) return false;

  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  // If lengths differ, compare against itself to maintain constant time
  // but still return false
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify registration token from Authorization header
 * @throws {Error} If token is invalid or missing
 */
export async function verifyRegistrationToken(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer') {
    throw new Error('Invalid authentication scheme. Use Bearer token.');
  }

  if (!token) {
    throw new Error('Missing authentication token');
  }

  const settings = await getSettings();

  if (!settings.registrationToken) {
    throw new Error('Registration token not configured in NSMA settings');
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!timingSafeCompare(token, settings.registrationToken)) {
    throw new Error('Invalid registration token');
  }

  return true;
}

/**
 * Higher-order function to wrap API handlers with authentication
 * Use this to protect API endpoints that require Bearer token auth
 *
 * @param {Function} handler - The API route handler function
 * @returns {Function} - Wrapped handler that checks auth first
 *
 * @example
 * // In an API route file:
 * import { withAuth } from '@/lib/auth';
 *
 * async function handlePost(request, context) {
 *   // Your handler logic here
 * }
 *
 * export const POST = withAuth(handlePost);
 */
export function withAuth(handler) {
  return async (request, context) => {
    try {
      await verifyRegistrationToken(request);
      return handler(request, context);
    } catch (error) {
      // Log the actual error for debugging but return generic message
      console.error('Auth error:', error.message);

      return Response.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store' }
        }
      );
    }
  };
}

/**
 * Validate request authentication (used by existing endpoints)
 * This is a compatibility wrapper that returns an object instead of throwing
 *
 * @param {Request} request - The incoming request
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateRequest(request) {
  try {
    await verifyRegistrationToken(request);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
