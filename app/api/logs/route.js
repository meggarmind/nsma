import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/storage';

/**
 * GET /api/logs
 *
 * Query parameters:
 * - limit: number (default: 50) - Maximum logs to return
 * - level: 'info' | 'warn' | 'error' (optional) - Filter by log level
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const level = searchParams.get('level') || null;

    // Validate level if provided
    if (level && !['info', 'warn', 'error'].includes(level)) {
      return NextResponse.json(
        { error: 'Invalid level. Must be: info, warn, or error' },
        { status: 400 }
      );
    }

    const logs = await getLogs(limit, level);
    return NextResponse.json(logs.reverse()); // Most recent first
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
