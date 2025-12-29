import { getLogs } from '@/lib/storage';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';

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
      return jsonError('Invalid level. Must be: info, warn, or error', 400);
    }

    const logs = await getLogs(limit, level);
    return jsonWithCache(logs.reverse(), { maxAge: CACHE_DURATIONS.logs }); // Most recent first
  } catch (error) {
    return jsonError(error.message);
  }
}
