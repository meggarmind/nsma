import { NextResponse } from 'next/server';

/**
 * Security Middleware
 *
 * Restricts API access to localhost only to prevent unauthorized network access.
 * This is a security measure for a local-only application that manages sensitive
 * Notion credentials and sync operations.
 *
 * To allow network access (e.g., for Docker), set NSMA_ALLOW_REMOTE=true
 */
export function middleware(request) {
  // Skip non-API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Allow if explicitly configured for remote access
  if (process.env.NSMA_ALLOW_REMOTE === 'true') {
    return NextResponse.next();
  }

  // Get the request origin
  const host = request.headers.get('host') || '';
  const forwardedFor = request.headers.get('x-forwarded-for');

  // Allow localhost access (various forms)
  const isLocalhost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]') ||
    host.startsWith('0.0.0.0');

  // If behind a proxy, check x-forwarded-for
  const isLocalForwarded = forwardedFor
    ? forwardedFor.split(',')[0].trim() === '127.0.0.1' ||
      forwardedFor.split(',')[0].trim() === '::1'
    : true; // No proxy header means direct connection

  if (!isLocalhost) {
    console.warn(`[security] Blocked non-localhost API access from: ${host}`);
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'API access restricted to localhost. Set NSMA_ALLOW_REMOTE=true to allow remote access.'
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
