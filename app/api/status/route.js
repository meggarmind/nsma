import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getLogs, getSettings } from '@/lib/storage';

const execAsync = promisify(exec);

/**
 * Get sync system status including daemon state and recent metrics
 * GET /api/status
 */
export async function GET() {
  try {
    // Get daemon status via systemctl
    let daemonStatus = {
      running: false,
      status: 'unknown',
      uptime: null
    };

    try {
      const { stdout } = await execAsync('systemctl --user is-active notion-sync.service 2>/dev/null || echo inactive');
      const status = stdout.trim();
      daemonStatus.running = status === 'active';
      daemonStatus.status = status;

      // Get uptime if running
      if (daemonStatus.running) {
        try {
          const { stdout: propOutput } = await execAsync(
            'systemctl --user show notion-sync.service --property=ActiveEnterTimestamp 2>/dev/null'
          );
          const match = propOutput.match(/ActiveEnterTimestamp=(.+)/);
          if (match && match[1]) {
            daemonStatus.uptime = match[1];
          }
        } catch {
          // Ignore uptime fetch errors
        }
      }
    } catch {
      // systemctl not available or service not found
      daemonStatus.status = 'not-installed';
    }

    // Get recent sync logs
    const logs = await getLogs(50);
    const recentLogs = logs.slice(-10).reverse(); // Last 10, most recent first

    // Calculate metrics from recent syncs
    const last24h = logs.filter(log => {
      const logTime = new Date(log.timestamp);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return logTime >= dayAgo;
    });

    const metrics = {
      syncsLast24h: last24h.length,
      itemsLast24h: last24h.reduce((sum, log) => sum + (log.processed || 0), 0),
      errorsLast24h: last24h.reduce((sum, log) => sum + (log.errors || 0), 0),
      lastSync: logs.length > 0 ? logs[logs.length - 1] : null,
      successRate: calculateSuccessRate(last24h)
    };

    // Get settings for sync interval
    const settings = await getSettings();

    return NextResponse.json({
      daemon: daemonStatus,
      metrics,
      recentLogs,
      syncIntervalMinutes: settings.syncIntervalMinutes || 15
    });
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function calculateSuccessRate(logs) {
  if (logs.length === 0) return 100;

  const totalItems = logs.reduce((sum, log) => sum + (log.processed || 0) + (log.errors || 0), 0);
  if (totalItems === 0) return 100;

  const successItems = logs.reduce((sum, log) => sum + (log.processed || 0), 0);
  return Math.round((successItems / totalItems) * 100);
}
