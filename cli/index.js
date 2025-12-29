#!/usr/bin/env node
import { createInterface } from 'readline';
import { SyncProcessor } from '../lib/processor.js';
import { getSettings, getProjects, updateProject, addLog, logInfo, logWarn } from '../lib/storage.js';
import { ConfigWatcher } from '../lib/config-watcher.js';
import { ReverseSyncProcessor } from '../lib/reverse-sync.js';
import { NotionClient } from '../lib/notion.js';
import {
  generateProjectDefaults,
  validatePaths,
  detectConfigFiles,
  createProjectWithSetup
} from '../lib/wizard.js';

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
  add-project        Interactive wizard to add a new project

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
  node cli/index.js add-project          # Add a new project interactively
  node cli/index.js --daemon             # Run as background service
`);
  process.exit(0);
}

// ============================================================================
// ADD PROJECT WIZARD (Interactive CLI)
// ============================================================================

/**
 * Helper to prompt user for input
 */
function prompt(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * Interactive wizard to add a new project
 */
async function runAddProjectWizard() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n' + '═'.repeat(60));
  console.log('          ADD NEW PROJECT WIZARD');
  console.log('═'.repeat(60) + '\n');

  try {
    // Step 1: Get PROJECT_ROOT
    console.log('Step 1/5: Project Root');
    console.log('─'.repeat(40));
    const projectRoot = await prompt(rl, 'Enter PROJECT_ROOT path: ');

    if (!projectRoot) {
      console.log('\n❌ PROJECT_ROOT is required. Aborting.');
      rl.close();
      return;
    }

    // Generate defaults
    const defaults = generateProjectDefaults(projectRoot);

    // Step 2: Review/Edit Name and Slug
    console.log('\nStep 2/5: Project Details');
    console.log('─'.repeat(40));
    console.log(`Auto-generated from path:`);
    console.log(`  Name: ${defaults.name}`);
    console.log(`  Slug: ${defaults.slug}`);

    const nameInput = await prompt(rl, `Project name [${defaults.name}]: `);
    const name = nameInput || defaults.name;

    const slugInput = await prompt(rl, `Project slug [${defaults.slug}]: `);
    const slug = slugInput || defaults.slug;

    // Step 3: Prompts Directory
    console.log('\nStep 3/5: Prompts Directory');
    console.log('─'.repeat(40));
    const promptsPathInput = await prompt(rl, `Prompts directory [${defaults.promptsPath}]: `);
    let promptsPath = promptsPathInput || defaults.promptsPath;

    // Validate paths
    console.log('\nValidating paths...');
    const validation = validatePaths(projectRoot, promptsPath);

    if (!validation.valid) {
      console.log('\n❌ Validation failed:');
      validation.errors.forEach(e => console.log(`   - ${e}`));
      rl.close();
      return;
    }

    // Apply corrections if any
    if (validation.corrections.promptsPath) {
      promptsPath = validation.corrections.promptsPath;
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validation.warnings.forEach(w => console.log(`   - ${w}`));
    }

    // Step 4: Confirmation
    console.log('\nStep 4/5: Review & Confirm');
    console.log('─'.repeat(40));
    console.log(`  Project Root:  ${projectRoot}`);
    console.log(`  Project Name:  ${name}`);
    console.log(`  Project Slug:  ${slug}`);
    console.log(`  Prompts Path:  ${promptsPath}`);

    const confirmCreate = await prompt(rl, '\nProceed with project creation? (y/n): ');
    if (confirmCreate.toLowerCase() !== 'y' && confirmCreate.toLowerCase() !== 'yes') {
      console.log('\n❌ Aborted by user.');
      rl.close();
      return;
    }

    // Step 5: Config and Hook Options
    console.log('\nStep 5/5: Configuration Options');
    console.log('─'.repeat(40));

    // Check for existing config files
    const configDetection = await detectConfigFiles(projectRoot);
    let importConfig = true;
    let createConfigTemplate = false;

    if (configDetection.found) {
      console.log(`Found config files: ${configDetection.files.join(', ')}`);
      const doImport = await prompt(rl, 'Import phases/modules from config? (y/n) [y]: ');
      importConfig = doImport.toLowerCase() !== 'n';
    } else {
      console.log('No config files found (.nsma-config.md, PERSPECTIVE.md, etc.)');
      const createConfig = await prompt(rl, 'Create starter .nsma-config.md template? (y/n) [y]: ');
      createConfigTemplate = createConfig.toLowerCase() !== 'n';
    }

    // Hook style choice
    console.log('\nHook style options:');
    console.log('  1. Full   - Complete hook with prompt analysis');
    console.log('  2. Minimal - Just sync, no analysis');
    const hookChoice = await prompt(rl, 'Choose hook style (1/2) [1]: ');
    const hookStyle = hookChoice === '2' ? 'minimal' : 'full';

    // Execute wizard
    console.log('\n' + '─'.repeat(40));
    console.log('Creating project...\n');

    const result = await createProjectWithSetup({
      projectRoot,
      name,
      slug,
      promptsPath,
      importConfig,
      hookStyle,
      createConfigTemplate
    });

    rl.close();

    // Display results
    if (result.success) {
      console.log('\n' + '═'.repeat(60));
      console.log('          PROJECT CREATED SUCCESSFULLY');
      console.log('═'.repeat(60));
      console.log(`\nProject: ${result.project.name}`);
      console.log(`ID: ${result.project.id}`);
      console.log(`Slug: ${result.project.slug}`);

      if (result.imported) {
        console.log(`\nImported from: ${result.imported.source}`);
        console.log(`  - ${result.imported.phases} phases`);
        console.log(`  - ${result.imported.modules} modules`);
      }

      console.log('\nCreated:');
      result.created.forEach(f => console.log(`  ✓ ${f}`));

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
      }

      console.log('\n' + '─'.repeat(60));
      console.log('Next steps:');
      console.log(`  1. Open dashboard: http://localhost:3100/projects/${result.project.id}`);
      console.log(`  2. Sync from Notion: node cli/index.js --project ${slug}`);
      console.log('  3. Start a Claude Code session in your project');
      console.log('═'.repeat(60) + '\n');

    } else {
      console.log('\n❌ Project creation failed:');
      result.errors.forEach(e => console.log(`   - ${e}`));
    }

  } catch (error) {
    console.error('\n❌ Wizard error:', error.message);
    rl.close();
  }
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

  // Warm up API connection by querying the database first
  // This establishes context that makes subsequent updatePage calls work
  // (Notion API quirk: page operations fail without prior database interaction)
  if (settings.notionDatabaseId) {
    try {
      await notion.queryDatabase(settings.notionDatabaseId, null, 'In progress');
      if (options.verbose) {
        console.log('   ✓ API connection established');
      }
    } catch (warmupError) {
      console.warn('   ⚠️  Database warm-up query failed:', warmupError.message);
      // Continue anyway - some operations may still work
    }
  }

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
          const logFn = result.failed > 0 ? logWarn : logInfo;

          // Format error details with type labels for UI display
          const errorDetails = result.failed > 0 && result.errors?.length > 0
            ? {
                message: `${result.failed} file(s) failed to sync to Notion`,
                items: result.errors.map(e => {
                  const typeLabel = e.errorType === 'permission'
                    ? ' (permission denied)'
                    : e.errorType === 'deleted' ? ' (page deleted)' : '';
                  return `${e.file}: ${e.error}${typeLabel}`;
                }).join('\n')
              }
            : null;

          await logFn({
            operation: 'reverse-sync',
            projectId: project.id,
            projectName: project.name,
            message: result.failed > 0
              ? `Reverse sync completed with ${result.failed} failure(s)`
              : `Reverse sync completed: ${result.updated} item(s) updated`,
            updated: result.updated,
            failed: result.failed,
            skipped: result.skipped,
            details: errorDetails,
            errors: result.errors,
            updatedItems: result.updatedItems
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
  // Handle add-project wizard command
  if (args[0] === 'add-project') {
    await runAddProjectWizard();
    return;
  }

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

    // Helper function to run a complete sync cycle
    const runSyncCycle = async (isInitial = false) => {
      const cycleType = isInitial ? 'Initial' : 'Scheduled';
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`${isInitial ? '📋' : '⏰'} ${cycleType} sync at ${new Date().toLocaleString()}`);
      console.log('═'.repeat(60));

      try {
        // Step 1: Refresh configs (non-blocking - errors don't stop sync)
        try {
          await configWatcher.refreshAllConfigs();
        } catch (configErr) {
          console.error(`⚠️ Config refresh failed: ${configErr.message}`);
          // Continue with sync even if config refresh fails
        }

        // Step 2: Run the actual Notion sync (this is the critical part)
        console.log('\n🔄 Starting Notion sync...');
        const results = await processor.run();

        // Log sync completion to structured logs (visible in UI)
        const totalImported = results.reduce((sum, r) => sum + (r.imported || 0), 0);
        const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);

        if (totalImported > 0 || totalErrors > 0) {
          const logFn = totalErrors > 0 ? logWarn : logInfo;
          await logFn({
            operation: 'daemon-sync',
            message: totalErrors > 0
              ? `Daemon sync: ${totalImported} imported, ${totalErrors} errors`
              : `Daemon sync: ${totalImported} items imported`,
            imported: totalImported,
            errors: totalErrors,
            source: 'daemon',
            cycleType
          });
        }

        console.log(`\n✅ ${cycleType} sync completed: ${totalImported} items imported, ${totalErrors} errors`);

        // Step 3: Refresh all project stats from disk
        try {
          await configWatcher.refreshAllStats();
        } catch (statsErr) {
          console.error(`⚠️ Stats refresh failed: ${statsErr.message}`);
        }

      } catch (err) {
        // Critical error - log to both console and structured logs
        console.error(`❌ ${cycleType} sync failed: ${err.message}`);
        await logWarn({
          operation: 'daemon-sync-error',
          message: `Daemon sync failed: ${err.message}`,
          error: err.message,
          source: 'daemon',
          cycleType
        });
      }
    };

    // Run initial sync
    await runSyncCycle(true);

    // Then run on interval
    setInterval(() => {
      runSyncCycle(false);
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
