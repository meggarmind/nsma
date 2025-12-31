import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { isValidCommitHash } from './validation.js';

const execFileAsync = promisify(execFile);

// Timeout for long-running commands (5 minutes)
const COMMAND_TIMEOUT = 300000;

/**
 * Get the absolute path to npm based on the running node process.
 * In nvm environments, npm lives next to node in the same bin directory.
 * This ensures npm is found even when PATH is not set (systemd services).
 * @returns {string}
 */
function getNpmPath() {
  // process.execPath is the absolute path to the running node binary
  // e.g., /home/user/.nvm/versions/node/v20.10.0/bin/node
  const nodeBinDir = dirname(process.execPath);
  return join(nodeBinDir, 'npm');
}

/**
 * Resolve command to absolute path if needed.
 * This handles the case where systemd services don't have PATH set.
 * @param {string} cmd - Command name (e.g., 'npm', 'git')
 * @returns {string} - Resolved command path
 */
function resolveCommand(cmd) {
  if (cmd === 'npm') {
    return getNpmPath();
  }
  // git should be in /usr/bin/git which is usually available in systemd
  return cmd;
}

/**
 * Get current version from package.json
 * @returns {Promise<string>}
 */
export async function getCurrentVersion() {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch (error) {
    console.error('[deployment] Failed to read version:', error.message);
    return '0.0.0';
  }
}

/**
 * Get current git commit hash (short)
 * @returns {Promise<string>}
 */
export async function getCurrentCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
    });
    return stdout.trim();
  } catch (error) {
    console.error('[deployment] Failed to get commit:', error.message);
    return 'unknown';
  }
}

/**
 * Get full current git commit hash
 * @returns {Promise<string>}
 */
export async function getCurrentCommitFull() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
    });
    return stdout.trim();
  } catch (error) {
    console.error('[deployment] Failed to get full commit:', error.message);
    return '';
  }
}

/**
 * Check for updates from git remote
 * @returns {Promise<{hasUpdates: boolean, currentCommit: string, latestCommit: string, commitCount: number, commits: string[]}>}
 */
export async function checkForUpdates() {
  const cwd = process.cwd();

  try {
    // Fetch without modifying working tree
    await execFileAsync('git', ['fetch', 'origin', 'master'], { cwd });

    // Get current and latest commits
    const { stdout: currentCommit } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd });
    const { stdout: latestCommit } = await execFileAsync('git', ['rev-parse', '--short', 'origin/master'], { cwd });

    const current = currentCommit.trim();
    const latest = latestCommit.trim();
    const hasUpdates = current !== latest;

    let commits = [];
    let commitCount = 0;

    if (hasUpdates) {
      try {
        // Get list of commits between current and latest
        const { stdout: logOutput } = await execFileAsync('git', [
          'log',
          '--oneline',
          `HEAD..origin/master`,
        ], { cwd });

        commits = logOutput.trim().split('\n').filter(Boolean);
        commitCount = commits.length;
      } catch (error) {
        console.error('[deployment] Failed to get commit log:', error.message);
      }
    }

    return {
      hasUpdates,
      currentCommit: current,
      latestCommit: latest,
      commitCount,
      commits,
    };
  } catch (error) {
    console.error('[deployment] Failed to check for updates:', error.message);
    throw new Error(`Failed to check for updates: ${error.message}`);
  }
}

/**
 * Execute a command with error handling
 * @param {string} cmd - Command to run
 * @param {string[]} args - Arguments
 * @param {string} stepName - Step name for logging
 * @returns {Promise<{success: boolean, output: string, error?: string}>}
 */
async function runCommand(cmd, args, stepName) {
  try {
    // Resolve command to absolute path (fixes ENOENT in systemd environments)
    const resolvedCmd = resolveCommand(cmd);
    // Get nvm bin directory to include in PATH for child processes
    // This fixes "node: No such file or directory" when npm runs lifecycle scripts
    const nodeBinDir = dirname(process.execPath);

    const { stdout, stderr } = await execFileAsync(resolvedCmd, args, {
      cwd: process.cwd(),
      timeout: COMMAND_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for npm install output
      env: {
        ...process.env,
        PATH: `${nodeBinDir}:${process.env.PATH || '/usr/bin:/bin'}`
      }
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.message,
    };
  }
}

/**
 * Rollback to a specific commit
 * @param {string} commitHash - Full commit hash to rollback to
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function rollbackUpdate(commitHash) {
  if (!commitHash) {
    return { success: false, error: 'No commit hash provided for rollback' };
  }

  // Security: Validate commit hash format to prevent command injection
  if (!isValidCommitHash(commitHash)) {
    return { success: false, error: 'Invalid commit hash format' };
  }

  try {
    await execFileAsync('git', ['reset', '--hard', commitHash], {
      cwd: process.cwd(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute update process with auto-rollback on failure
 * Steps: git pull -> npm install -> npm run build
 * @param {function} onProgress - Progress callback
 * @returns {Promise<{success: boolean, steps: Array, error?: string, rolledBack?: boolean}>}
 */
export async function executeUpdate(onProgress) {
  const steps = [
    { name: 'pull', label: 'Pulling latest changes', cmd: 'git', args: ['pull', 'origin', 'master'] },
    { name: 'install', label: 'Installing dependencies', cmd: 'npm', args: ['install', '--production=false'] },
    { name: 'build', label: 'Building application', cmd: 'npm', args: ['run', 'build'] },
  ];

  const results = [];

  // Save current commit for potential rollback
  const previousCommit = await getCurrentCommitFull();

  for (const step of steps) {
    onProgress?.({ step: step.name, label: step.label, status: 'running' });

    const result = await runCommand(step.cmd, step.args, step.name);
    results.push({ step: step.name, ...result });

    if (result.success) {
      onProgress?.({ step: step.name, status: 'completed' });
    } else {
      onProgress?.({ step: step.name, status: 'failed', error: result.error });

      // Auto-rollback on failure
      if (previousCommit && step.name !== 'pull') {
        // Only rollback if we actually pulled something
        onProgress?.({ step: 'rollback', label: 'Rolling back changes', status: 'running' });

        const rollbackResult = await rollbackUpdate(previousCommit);

        if (rollbackResult.success) {
          onProgress?.({ step: 'rollback', status: 'completed' });
          return {
            success: false,
            steps: results,
            error: `Update failed at '${step.name}': ${result.error}`,
            rolledBack: true,
            rollbackCommit: previousCommit.slice(0, 7),
          };
        } else {
          onProgress?.({ step: 'rollback', status: 'failed', error: rollbackResult.error });
          return {
            success: false,
            steps: results,
            error: `Update failed at '${step.name}' and rollback failed: ${rollbackResult.error}`,
            rolledBack: false,
          };
        }
      }

      return {
        success: false,
        steps: results,
        error: `Update failed at '${step.name}': ${result.error}`,
        rolledBack: false,
      };
    }
  }

  return { success: true, steps: results };
}

/**
 * Restart NSMA services via systemctl
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restartServices() {
  const instance = process.env.NSMA_INSTANCE || 'prod';
  const daemonService = `nsma-daemon-${instance}.service`;
  const webService = `nsma-web-${instance}.service`;

  try {
    // Restart daemon first
    await execFileAsync('systemctl', ['--user', 'restart', daemonService]);

    // Restart web service (this will kill the current process)
    await execFileAsync('systemctl', ['--user', 'restart', webService]);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Schedule service restart (delayed to allow response to be sent)
 * @param {number} delayMs - Delay in milliseconds before restart
 */
export function scheduleServiceRestart(delayMs = 1000) {
  const instance = process.env.NSMA_INSTANCE || 'prod';
  const webService = `nsma-web-${instance}.service`;

  setTimeout(async () => {
    try {
      await execFileAsync('systemctl', ['--user', 'restart', webService]);
    } catch (error) {
      console.error('[deployment] Failed to restart service:', error.message);
    }
  }, delayMs);
}

/**
 * Get deployment instance info
 * @returns {Promise<{instance: string, nodeEnv: string, port: string|number, installDir: string, configDir: string}>}
 */
export async function getInstanceInfo() {
  return {
    instance: process.env.NSMA_INSTANCE || 'dev',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3100,
    installDir: process.cwd(),
    configDir: process.env.NOTION_SYNC_CONFIG_DIR || '~/.notion-sync-manager',
  };
}

/**
 * Check if running in production instance
 * @returns {boolean}
 */
export function isProductionInstance() {
  return process.env.NSMA_INSTANCE === 'prod' || process.env.NODE_ENV === 'production';
}
