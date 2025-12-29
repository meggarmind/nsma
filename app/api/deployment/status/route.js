import { getSettings } from '@/lib/storage';
import { getInstanceInfo } from '@/lib/deployment';
import { jsonWithCache, jsonError } from '@/lib/api-response';

/**
 * GET /api/deployment/status
 * Returns deployment instance info and update history
 */
export async function GET() {
  try {
    const [settings, instanceInfo] = await Promise.all([
      getSettings(),
      getInstanceInfo(),
    ]);

    return jsonWithCache({
      instance: instanceInfo,
      updateHistory: settings.updateHistory || [],
      lastUpdateCheck: settings.lastUpdateCheck || null,
    }, { maxAge: 30 });
  } catch (error) {
    return jsonError(error.message);
  }
}
