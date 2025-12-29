import { getInboxItems, getInboxStats } from '@/lib/storage';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';

export async function GET() {
  try {
    const items = await getInboxItems();
    const stats = await getInboxStats();

    return jsonWithCache({
      items,
      stats,
      count: items.length
    }, { maxAge: CACHE_DURATIONS.inbox });
  } catch (error) {
    return jsonError(error.message);
  }
}
