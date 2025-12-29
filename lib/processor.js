import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from './notion.js';
import { PromptGenerator } from './prompt-generator.js';
import { PromptExpander } from './prompt-expander.js';
import { getConfiguredProviders } from './ai-providers.js';
import { FeatureDevEnhancer } from './feature-dev-enhancer.js';
import { ReverseSyncProcessor } from './reverse-sync.js';
import { getSettings, getProjects, updateProject, logInfo, logWarn, logError, getOrCreateInboxProject, countPrompts } from './storage.js';
import { INBOX_PROJECT_ID } from './constants.js';

export class SyncProcessor {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.targetProject = options.project || null;
    this.skipReverseSync = options.skipReverseSync || false;
  }

  log(message) {
    console.log(message);
  }

  async ensureDirectories(project) {
    const baseDir = project.promptsPath;
    if (!baseDir) return;

    const subfolders = ['pending', 'processed', 'archived', 'deferred'];
    for (const folder of subfolders) {
      const dir = join(baseDir, folder);
      if (!existsSync(dir)) {
        if (!this.dryRun) {
          await mkdir(dir, { recursive: true });
        }
        this.log(`  Created: ${dir}`);
      }
    }
  }

  /**
   * Process items for a specific project
   * Returns: { imported, errors, skipped }
   */
  async processProjectItems(project, items, settings, notion, isInbox = false) {
    if (!project.promptsPath) {
      this.log('⚠️  No prompts path configured, skipping');
      return { imported: 0, updated: 0, errors: 0, skipped: true };
    }

    await this.ensureDirectories(project);

    const generator = new PromptGenerator(project, settings);
    let imported = 0;
    let updated = 0;  // For future: re-syncing existing items
    let errors = 0;

    for (const { page, item } of items) {
      this.log(`\n${'─'.repeat(40)}`);
      this.log(`Processing: ${item.title}`);

      try {
        let pageContent = null;
        if (item.isHydrated) {
          this.log('  📝 Fetching hydrated content...');
          const blocks = await notion.getPageBlocks(item.pageId);
          pageContent = notion.blocksToMarkdown(blocks);
        } else if (project.aiPromptEnabled !== false) {
          // AI expansion is enabled (default true) - check if any providers are configured
          const configuredProviders = getConfiguredProviders(settings);
          if (configuredProviders.length > 0) {
            const providerNames = configuredProviders.map(p => p.name).join(', ');
            this.log(`  🤖 Expanding prompt with AI (${providerNames})...`);
            try {
              const expander = new PromptExpander(settings);
              pageContent = await expander.expand(item, project);
              this.log('  ✓ AI expansion complete');
            } catch (err) {
              this.log(`  ⚠️ AI expansion failed: ${err.message}, using brief description`);
            }
          }
        } else {
          this.log('  ⏭️ AI expansion disabled for this project');
        }

        const { content, filename, phase, effort } = generator.generate(item, pageContent);

        // Feature-dev enhancement for configured types
        let finalContent = content;
        const featureDevTypes = settings.featureDevTypes || ['Feature', 'Improvement'];
        if (settings.featureDevEnabled !== false &&
            settings.anthropicApiKey &&
            featureDevTypes.includes(item.type)) {
          this.log(`  🔧 Enhancing with feature-dev analysis...`);
          try {
            const enhancer = new FeatureDevEnhancer(settings);
            const enhancedSections = await enhancer.enhance(item, project, content);
            finalContent = content + enhancedSections;
            this.log(`  ✓ Feature-dev enhancement complete`);
          } catch (err) {
            this.log(`  ⚠️ Feature-dev enhancement failed: ${err.message}`);
            // Continue with base content
          }
        }

        // For inbox items, add original project info to frontmatter
        if (isInbox && item.project) {
          finalContent = finalContent.replace(
            /^---\n/,
            `---\noriginal_project: ${item.project}\n`
          );
        }

        this.log(`  ✓ Phase: ${phase}`);
        this.log(`  ✓ Effort: ${effort}`);
        if (isInbox) {
          this.log(`  📥 Routed to Inbox`);
        }

        const filepath = join(project.promptsPath, 'pending', filename);

        if (this.dryRun) {
          this.log(`  [DRY RUN] Would save: ${filepath}`);
        } else {
          await writeFile(filepath, finalContent);
          this.log(`  ✓ Saved: ${filepath}`);

          // Update Notion - mark as In progress
          const updateProps = {
            'Status': { select: { name: 'In progress' } },
            'Assigned Phase': { select: { name: phase } },
            'Estimated Effort': { select: { name: effort } },
            'Generated Prompt Location': { url: filepath },
            'Analysis Notes': {
              rich_text: [{
                text: {
                  content: isInbox
                    ? `Routed to Inbox - needs project assignment`
                    : `Prompt generated: ${filename}`
                }
              }]
            },
            'Processed Date': {
              date: { start: new Date().toISOString().slice(0, 10) }
            }
          };

          await notion.updatePage(item.pageId, updateProps);
          this.log('  ✓ Notion updated');
        }

        imported++;

      } catch (err) {
        this.log(`  ❌ Error: ${err.message}`);
        errors++;
      }
    }

    // Calculate live stats from disk
    const stats = await countPrompts(project.promptsPath);

    // Update project with live stats AND sync metadata
    if (!this.dryRun && project.id !== INBOX_PROJECT_ID) {
      const now = new Date().toISOString();
      await updateProject(project.id, {
        stats,  // Live counts from disk
        lastSync: {
          timestamp: now,
          imported,
          updated,
          skipped: items.length - imported - updated - errors  // Items that weren't processed
        },
        lastSyncAt: now
      });
    }

    if (!this.dryRun) {
      // Use appropriate log level based on outcome
      const logFn = errors > 0 ? logWarn : logInfo;
      await logFn({
        operation: 'sync',
        projectId: project.id,
        projectName: project.name,
        message: errors > 0
          ? `Sync completed with ${errors} error(s)`
          : `Sync completed successfully`,
        imported,
        updated,
        errors,
        isInbox,
        items: items.map(i => i.item.title)
      });
    }

    this.log(`\n✅ Imported ${imported} items (${errors} errors)`);
    return { imported, updated, errors, skipped: false };
  }

  async run() {
    this.log('🚀 Notion Sync Manager');
    this.log('═'.repeat(60));

    if (this.dryRun) {
      this.log('⚠️  DRY RUN MODE\n');
    }

    const settings = await getSettings();
    const projects = await getProjects();

    if (!settings.notionToken) {
      throw new Error('No Notion token configured. Set it in the NSMA dashboard at http://localhost:3100/settings');
    }

    const notion = new NotionClient(settings.notionToken);

    // Get or create inbox project
    const inboxProject = await getOrCreateInboxProject();

    // If targeting a specific project, just process that one
    if (this.targetProject) {
      const project = projects.find(p =>
        p.slug === this.targetProject ||
        p.name === this.targetProject ||
        p.id === this.targetProject
      );

      if (!project) {
        this.log(`⚠️  Project "${this.targetProject}" not found`);
        return [];
      }

      this.log('🔍 Fetching unprocessed items from Notion...');
      const pages = await notion.queryDatabase(
        settings.notionDatabaseId,
        project.slug,
        'Not started'
      );

      if (pages.length === 0) {
        this.log('✨ No unprocessed items found');
        return [];
      }

      const items = pages.map(page => ({ page, item: NotionClient.parseItem(page) }));
      const result = await this.processProjectItems(project, items, settings, notion);
      return [{ project: project.name, ...result }];
    }

    // Fetch ALL unprocessed items from Notion (no project filter)
    this.log('🔍 Fetching all unprocessed items from Notion...');
    const allPages = await notion.queryDatabase(
      settings.notionDatabaseId,
      null,  // No project filter - get everything
      'Not started'
    );

    if (allPages.length === 0) {
      this.log('✨ No unprocessed items found');
      return [];
    }

    this.log(`📋 Found ${allPages.length} total item(s)\n`);

    // Group items by project
    const itemsByProject = new Map();
    const inboxItems = [];
    const activeProjectSlugs = new Set(projects.filter(p => p.active).map(p => p.slug));

    for (const page of allPages) {
      const item = NotionClient.parseItem(page);
      const projectSlug = item.project;

      if (!projectSlug || projectSlug.trim() === '') {
        // No project assigned -> Inbox
        inboxItems.push({ page, item, reason: 'No project assigned' });
      } else if (!activeProjectSlugs.has(projectSlug)) {
        // Unknown or inactive project -> Inbox
        inboxItems.push({ page, item, reason: `Unknown project: ${projectSlug}` });
      } else {
        // Valid project
        if (!itemsByProject.has(projectSlug)) {
          itemsByProject.set(projectSlug, []);
        }
        itemsByProject.get(projectSlug).push({ page, item });
      }
    }

    const results = [];

    // Process items for each active project IN PARALLEL
    const activeProjects = projects.filter(p => p.active);
    const projectPromises = activeProjects.map(async (project) => {
      const projectItems = itemsByProject.get(project.slug) || [];

      if (projectItems.length === 0) {
        this.log(`\n📁 ${project.name}: No items`);
        return { project: project.name, imported: 0, updated: 0, errors: 0, skipped: true };
      }

      this.log(`\n${'═'.repeat(60)}`);
      this.log(`📁 Processing: ${project.name} (${projectItems.length} items)`);
      this.log(`${'═'.repeat(60)}`);

      const result = await this.processProjectItems(project, projectItems, settings, notion);
      return { project: project.name, ...result };
    });

    const projectResults = await Promise.allSettled(projectPromises);
    for (const result of projectResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        this.log(`❌ Project processing failed: ${result.reason?.message || result.reason}`);
        results.push({ project: 'Unknown', error: result.reason?.message });
      }
    }

    // Process inbox items
    if (inboxItems.length > 0) {
      this.log(`\n${'═'.repeat(60)}`);
      this.log(`📥 Processing: Inbox (${inboxItems.length} items)`);
      this.log(`${'═'.repeat(60)}`);

      const inboxResult = await this.processProjectItems(
        inboxProject,
        inboxItems.map(i => ({ page: i.page, item: i.item })),
        settings,
        notion,
        true // isInbox flag
      );

      // Log reasons for inbox items
      for (const { item, reason } of inboxItems) {
        this.log(`  📥 "${item.title}" → Inbox (${reason})`);
      }

      results.push({ project: 'Inbox', ...inboxResult });
    }

    // ─────────────────────────────────────────────────────────────
    // REVERSE SYNC: Update Notion statuses based on local file locations
    // ─────────────────────────────────────────────────────────────
    if (!this.skipReverseSync) {
      this.log('\n' + '═'.repeat(60));
      this.log('🔄 Reverse Sync (files → Notion)');
      this.log('═'.repeat(60));

      // Process active projects that have reverse sync enabled IN PARALLEL
      const reverseSyncProjects = projects.filter(p =>
        p.active && p.reverseSyncEnabled !== false
      );

      const reverseSyncPromises = reverseSyncProjects.map(async (project) => {
        // Create a processor instance per project to avoid shared state issues
        const projectProcessor = new ReverseSyncProcessor({
          notionClient: notion,
          dryRun: this.dryRun,
          verbose: this.verbose,
          errorMode: project.reverseSyncErrorMode || 'skip'
        });

        try {
          const result = await projectProcessor.syncProject(project);

          // Update project with reverse sync stats
          if (!this.dryRun) {
            await updateProject(project.id, {
              lastReverseSync: {
                timestamp: new Date().toISOString(),
                updated: result.updated,
                failed: result.failed,
                skipped: result.skipped
              }
            });

            // Log reverse sync activity
            if (result.updated > 0 || result.failed > 0) {
              const logFn = result.failed > 0 ? logWarn : logInfo;

              // Format error details for UI display with error type labels
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
                details: errorDetails,  // Structured for UI display
                errors: result.errors,  // Keep raw array for debugging
                updatedItems: result.updatedItems  // Include successful updates for UI
              });
            }
          }

          return {
            project: `${project.name} (reverse)`,
            reverseSync: true,
            updated: result.updated,
            failed: result.failed,
            skipped: result.skipped
          };

        } catch (err) {
          this.log(`❌ Reverse sync failed for ${project.name}: ${err.message}`);
          return {
            project: `${project.name} (reverse)`,
            reverseSync: true,
            error: err.message
          };
        }
      });

      const reverseSyncResults = await Promise.allSettled(reverseSyncPromises);
      for (const result of reverseSyncResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.log(`❌ Reverse sync processing failed: ${result.reason?.message || result.reason}`);
          results.push({ project: 'Unknown (reverse)', reverseSync: true, error: result.reason?.message });
        }
      }
    }

    this.log('\n' + '═'.repeat(60));
    this.log('🎉 Sync complete!');
    this.log('═'.repeat(60));

    return results;
  }
}
