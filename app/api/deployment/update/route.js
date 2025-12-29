import { NextResponse } from 'next/server';
import { verifyRegistrationToken } from '@/lib/auth';
import {
  executeUpdate,
  getCurrentVersion,
  checkForUpdates,
  scheduleServiceRestart,
} from '@/lib/deployment';
import { getSettings, saveSettings } from '@/lib/storage';
import { jsonError } from '@/lib/api-response';

/**
 * POST /api/deployment/update
 * Triggers update process (authenticated with registration token)
 *
 * Flow:
 * 1. Authenticate request
 * 2. Check if updates are available
 * 3. Execute update (git pull, npm install, npm run build)
 * 4. Record update in history
 * 5. Schedule service restart
 */
export async function POST(request) {
  try {
    // 1. Authenticate with registration token
    try {
      await verifyRegistrationToken(request);
    } catch (authError) {
      return jsonError(authError.message, 401);
    }

    // 2. Check if updates are available
    const updateInfo = await checkForUpdates();

    if (!updateInfo.hasUpdates) {
      return NextResponse.json({
        success: true,
        message: 'Already up to date',
        updated: false,
      });
    }

    // 3. Execute update steps (git pull, npm install, npm build)
    const previousVersion = await getCurrentVersion();

    const result = await executeUpdate((progress) => {
      // Progress callback - could be used for SSE in future
      console.log(`[deployment] ${progress.step}: ${progress.status}`);
    });

    if (!result.success) {
      // Update failed - record in history
      const settings = await getSettings();
      const updateRecord = {
        timestamp: new Date().toISOString(),
        previousVersion,
        status: 'failed',
        error: result.error,
        rolledBack: result.rolledBack || false,
        rollbackCommit: result.rollbackCommit || null,
      };

      settings.updateHistory = [
        updateRecord,
        ...(settings.updateHistory || []),
      ].slice(0, 20); // Keep last 20 records
      settings.lastUpdateCheck = new Date().toISOString();

      await saveSettings(settings);

      return NextResponse.json({
        success: false,
        message: result.error,
        updated: false,
        rolledBack: result.rolledBack,
        rollbackCommit: result.rollbackCommit,
      });
    }

    // 4. Record successful update in history
    const newVersion = await getCurrentVersion();
    const settings = await getSettings();

    const updateRecord = {
      timestamp: new Date().toISOString(),
      previousVersion,
      newVersion,
      commits: updateInfo.commits.slice(0, 10), // Keep first 10 commits
      commitCount: updateInfo.commitCount,
      status: 'completed',
    };

    settings.updateHistory = [
      updateRecord,
      ...(settings.updateHistory || []),
    ].slice(0, 20);
    settings.lastUpdateCheck = new Date().toISOString();

    await saveSettings(settings);

    // 5. Schedule service restart (allows response to be sent first)
    scheduleServiceRestart(2000); // 2 second delay

    return NextResponse.json({
      success: true,
      message: 'Update completed. Services restarting in 2 seconds...',
      updated: true,
      previousVersion,
      newVersion,
      commitCount: updateInfo.commitCount,
    });
  } catch (error) {
    console.error('[deployment] Update error:', error);

    // Record error in history
    try {
      const settings = await getSettings();
      settings.updateHistory = [
        {
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: error.message,
        },
        ...(settings.updateHistory || []),
      ].slice(0, 20);
      await saveSettings(settings);
    } catch {
      // Ignore history save errors
    }

    return jsonError(`Update failed: ${error.message}`);
  }
}
