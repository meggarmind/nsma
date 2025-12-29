import { NextResponse } from 'next/server';
import { checkRateLimit } from './lib/rate-limit.js';

/**
 * Security Middleware
 *
 * Provides multiple layers of protection:
 * 1. Localhost restriction - Only allows API access from localhost by default
 * 2. Rate limiting - Prevents abuse by limiting requests per IP
 * 3. Proxy header validation - Only trusts X-Forwarded-For when explicitly configured
 *
 * Configuration environment variables:
 * - NSMA_ALLOW_REMOTE=true - Allow non-localhost access (for Docker)
 * - NSMA_TRUST_PROXY=true - Trust X-Forwarded-For header (when behind a proxy)
 * - NSMA_RATE_LIMIT_MAX=100 - Max requests per window
 * - NSMA_RATE_LIMIT_WINDOW_MS=60000 - Window duration in ms
 */
export function middleware(request) {
  // Skip non-API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Skip health check endpoint (needed for Docker/k8s)
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next();
  }

  // Configuration flags
  const allowRemote = process.env.NSMA_ALLOW_REMOTE === 'true';
  const trustProxy = process.env.NSMA_TRUST_PROXY === 'true';

  // Get the request origin
  const host = request.headers.get('host') || '';

  // Check if host indicates localhost
  let isLocalhost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]') ||
    host.startsWith('0.0.0.0');

  // Only check X-Forwarded-For if proxy trust is explicitly enabled
  // This prevents header spoofing attacks
  if (trustProxy) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const clientIp = forwardedFor.split(',')[0].trim();
      isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';
    }
  }

  // Enforce localhost restriction unless remote access is allowed
  if (!allowRemote && !isLocalhost) {
    console.warn(`[security] Blocked non-localhost API access from: ${host}`);
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'API access restricted to localhost. Set NSMA_ALLOW_REMOTE=true to allow remote access.'
      },
      { status: 403 }
    );
  }

  // Rate limiting
  const clientIp = getClientIp(request, trustProxy);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    console.warn(`[security] Rate limit exceeded for IP: ${clientIp}`);
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetAt),
        },
      }
    );
  }

  // Add rate limit headers to response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateLimit.resetAt));

  return response;
}

/**
 * Extract client IP address from request
 * @param {Request} request - The incoming request
 * @param {boolean} trustProxy - Whether to trust proxy headers
 * @returns {string} - Client IP address
 */
function getClientIp(request, trustProxy) {
  if (trustProxy) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
      return realIp.trim();
    }
  }

  // Default to localhost for direct connections
  return '127.0.0.1';
}

export const config = {
  matcher: '/api/:path*',
};
