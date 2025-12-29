import { getCurrentVersion, getCurrentCommit, checkForUpdates, getInstanceInfo } from '@/lib/deployment';
import { jsonWithCache, jsonError } from '@/lib/api-response';

/**
 * GET /api/deployment/version
 * Returns current version, commit, and available updates
 */
export async function GET() {
  try {
    const [version, commit, updateInfo, instanceInfo] = await Promise.all([
      getCurrentVersion(),
      getCurrentCommit(),
      checkForUpdates().catch((err) => ({
        hasUpdates: false,
        currentCommit: 'unknown',
        latestCommit: 'unknown',
        commitCount: 0,
        commits: [],
        error: err.message,
      })),
      getInstanceInfo(),
    ]);

    return jsonWithCache({
      currentVersion: version,
      currentCommit: commit,
      hasUpdates: updateInfo.hasUpdates,
      latestCommit: updateInfo.latestCommit,
      commitCount: updateInfo.commitCount,
      commits: updateInfo.commits,
      instance: instanceInfo,
      checkedAt: new Date().toISOString(),
      ...(updateInfo.error && { updateCheckError: updateInfo.error }),
    }, { maxAge: 60 }); // Cache for 1 minute
  } catch (error) {
    return jsonError(error.message);
  }
}
