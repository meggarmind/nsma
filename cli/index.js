#!/usr/bin/env node
import { SyncProcessor } from '../lib/processor.js';
import { getSettings, getProjects, updateProject, addLog } from '../lib/storage.js';
import { ConfigWatcher } from '../lib/config-watcher.js';
import { ReverseSyncProcessor } from '../lib/reverse-sync.js';
import { NotionClient } from '../lib/notion.js';

const args = process.argv.slice(2);

// Parse arguments
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  skipReverseSync: args.includes('--skip-reverse-sync'),
  project: null
};

// Get --project value
const projectIdx = args.indexOf('--project');
if (projectIdx >= 0 && args[projectIdx + 1]) {
  options.project = args[projectIdx + 1];
}

// Help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Notion Sync Manager CLI

Usage:
  node cli/index.js [command] [options]

Commands:
  (default)          Run full sync (Notion → files, then files → Notion)
  reverse-sync       Run reverse sync only (files → Notion)

Options:
  --project <slug>   Process only this project (by slug, name, or id)
  --dry-run          Preview changes without writing files
  --skip-reverse-sync  Skip reverse sync (forward sync only)
  --daemon           Run continuously at configured interval
  --verbose, -v      Show detailed output
  --help, -h         Show this help message

Examples:
  node cli/index.js                      # Full sync all active projects
  node cli/index.js --project residio    # Sync only Residio
  node cli/index.js --dry-run            # Preview sync
  node cli/index.js --skip-reverse-sync  # Forward sync only
  node cli/index.js reverse-sync         # Reverse sync only
  node cli/index.js --daemon             # Run as background service
`);
  process.exit(0);
}

// Standalone reverse sync command
async function runReverseSyncOnly() {
  console.log('🔄 Reverse Sync (files → Notion)');
  console.log('═'.repeat(60));

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE\n');
  }

  const settings = await getSettings();
  let projects = await getProjects();

  if (!settings.notionToken) {
    throw new Error('No Notion token configured. Set it in the NSMA dashboard at http://localhost:3100/settings');
  }

  const notion = new NotionClient(settings.notionToken);

  // Filter to target project if specified
  if (options.project) {
    projects = projects.filter(p =>
      p.slug === options.project ||
      p.name === options.project ||
      p.id === options.project
    );

    if (projects.length === 0) {
      console.log(`⚠️  Project "${options.project}" not found`);
      return;
    }
  }

  // Filter to active projects with reverse sync enabled
  projects = projects.filter(p => p.active && p.reverseSyncEnabled !== false);

  if (projects.length === 0) {
    console.log('✨ No projects with reverse sync enabled');
    return;
  }

  const reverseSyncProcessor = new ReverseSyncProcessor({
    notionClient: notion,
    dryRun: options.dryRun,
    verbose: options.verbose
  });

  const results = [];

  for (const project of projects) {
    reverseSyncProcessor.errorMode = project.reverseSyncErrorMode || 'skip';

    try {
      const result = await reverseSyncProcessor.syncProject(project);

      if (!options.dryRun) {
        await updateProject(project.id, {
          lastReverseSync: {
            timestamp: new Date().toISOString(),
            updated: result.updated,
            failed: result.failed,
            skipped: result.skipped
          }
        });

        if (result.updated > 0 || result.failed > 0) {
          await addLog({
            action: 'reverse-sync',
            projectId: project.id,
            projectName: project.name,
            updated: result.updated,
            failed: result.failed,
            skipped: result.skipped,
            errors: result.errors
          });
        }
      }

      results.push({ project: project.name, ...result });

    } catch (err) {
      console.error(`❌ ${project.name}: ${err.message}`);
      results.push({ project: project.name, error: err.message });
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Reverse sync complete!');
  console.log('═'.repeat(60));

  // Summary
  const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
  const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
  console.log(`   Updated: ${totalUpdated}, Failed: ${totalFailed}`);
}

// Main execution
async function main() {
  // Handle reverse-sync command
  if (args[0] === 'reverse-sync') {
    await runReverseSyncOnly();
    return;
  }

  const processor = new SyncProcessor(options);

  if (args.includes('--daemon')) {
    // Daemon mode - run continuously with config watching
    const settings = await getSettings();
    const intervalMs = (settings.syncIntervalMinutes || 15) * 60 * 1000;

    console.log(`🔄 Starting daemon mode`);
    console.log(`   Interval: ${settings.syncIntervalMinutes} minutes`);
    console.log(`   Config watching: enabled`);
    console.log(`   Press Ctrl+C to stop\n`);

    // Initialize config watcher
    const configWatcher = new ConfigWatcher({ verbose: options.verbose });

    // Start watching all active projects for config changes
    console.log('📁 Starting config file watchers...');
    await configWatcher.watchAllProjects();

    // Run initial config refresh and sync
    console.log('\n📋 Initial config refresh...');
    await configWatcher.refreshAllConfigs();
    await processor.run().catch(err => console.error('Sync error:', err.message));

    // Then run on interval
    setInterval(async () => {
      console.log(`\n⏰ Scheduled sync at ${new Date().toLocaleString()}\n`);

      // Refresh configs before syncing (checks for changes)
      await configWatcher.refreshAllConfigs();

      // Run the sync
      await processor.run().catch(err => console.error('Sync error:', err.message));
    }, intervalMs);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      await configWatcher.unwatchAll();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n🛑 Shutting down...');
      await configWatcher.unwatchAll();
      process.exit(0);
    });

  } else {
    // One-time run
    await processor.run();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
