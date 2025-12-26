#!/usr/bin/env node
import { SyncProcessor } from '../lib/processor.js';
import { getSettings } from '../lib/storage.js';

const args = process.argv.slice(2);

// Parse arguments
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose') || args.includes('-v'),
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
  node cli/index.js [options]

Options:
  --project <slug>   Process only this project (by slug, name, or id)
  --dry-run          Preview changes without writing files
  --daemon           Run continuously at configured interval
  --verbose, -v      Show detailed output
  --help, -h         Show this help message

Examples:
  node cli/index.js                      # Sync all active projects
  node cli/index.js --project residio    # Sync only Residio
  node cli/index.js --dry-run            # Preview sync
  node cli/index.js --daemon             # Run as background service
`);
  process.exit(0);
}

// Main execution
async function main() {
  const processor = new SyncProcessor(options);

  if (args.includes('--daemon')) {
    // Daemon mode - run continuously
    const settings = await getSettings();
    const intervalMs = (settings.syncIntervalMinutes || 15) * 60 * 1000;

    console.log(`🔄 Starting daemon mode`);
    console.log(`   Interval: ${settings.syncIntervalMinutes} minutes`);
    console.log(`   Press Ctrl+C to stop\n`);

    // Run immediately
    await processor.run().catch(err => console.error('Sync error:', err.message));

    // Then run on interval
    setInterval(async () => {
      console.log(`\n⏰ Scheduled sync at ${new Date().toLocaleString()}\n`);
      await processor.run().catch(err => console.error('Sync error:', err.message));
    }, intervalMs);

  } else {
    // One-time run
    await processor.run();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
