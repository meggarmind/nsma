import { getAnalyticsData } from '@/lib/analytics';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

    // Validate range parameter
    const validRanges = ['7d', '30d', '90d', 'all'];
    if (!validRanges.includes(range)) {
      return jsonError('Invalid range. Use: 7d, 30d, 90d, or all', 400);
    }

    const data = await getAnalyticsData(range);
    return jsonWithCache(data, { maxAge: CACHE_DURATIONS.analytics });
  } catch (error) {
    console.error('Analytics API error:', error);
    return jsonError(error.message);
  }
}
