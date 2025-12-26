import { mkdir, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from './notion.js';
import { PromptGenerator } from './prompt-generator.js';
import { getSettings, getProjects, updateProject, addLog, getOrCreateInboxProject } from './storage.js';
import { INBOX_PROJECT_ID } from './constants.js';

export class SyncProcessor {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.targetProject = options.project || null;
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

  async countPrompts(project) {
    const stats = { pending: 0, processed: 0, archived: 0, deferred: 0 };
    const baseDir = project.promptsPath;
    if (!baseDir || !existsSync(baseDir)) return stats;

    for (const folder of Object.keys(stats)) {
      const dir = join(baseDir, folder);
      if (existsSync(dir)) {
        try {
          const files = await readdir(dir);
          stats[folder] = files.filter(f => f.endsWith('.md')).length;
        } catch {}
      }
    }
    return stats;
  }

  /**
   * Process items for a specific project
   */
  async processProjectItems(project, items, settings, notion, isInbox = false) {
    if (!project.promptsPath) {
      this.log('⚠️  No prompts path configured, skipping');
      return { processed: 0, errors: 0, skipped: true };
    }

    await this.ensureDirectories(project);

    const generator = new PromptGenerator(project, settings);
    let processed = 0;
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
        }

        const { content, filename, phase, effort } = generator.generate(item, pageContent);

        // For inbox items, add original project info to frontmatter
        let finalContent = content;
        if (isInbox && item.project) {
          finalContent = content.replace(
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

        processed++;

      } catch (err) {
        this.log(`  ❌ Error: ${err.message}`);
        errors++;
      }
    }

    // Update stats
    const stats = await this.countPrompts(project);
    if (!this.dryRun && project.id !== INBOX_PROJECT_ID) {
      await updateProject(project.id, { stats, lastSyncAt: new Date().toISOString() });
    }

    if (!this.dryRun) {
      await addLog({
        projectId: project.id,
        projectName: project.name,
        processed,
        errors,
        isInbox,
        items: items.map(i => i.item.title)
      });
    }

    this.log(`\n✅ Processed ${processed} items (${errors} errors)`);
    return { processed, errors, skipped: false };
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

    // Process items for each active project
    for (const project of projects.filter(p => p.active)) {
      const projectItems = itemsByProject.get(project.slug) || [];

      if (projectItems.length === 0) {
        this.log(`\n📁 ${project.name}: No items`);
        continue;
      }

      this.log(`\n${'═'.repeat(60)}`);
      this.log(`📁 Processing: ${project.name} (${projectItems.length} items)`);
      this.log(`${'═'.repeat(60)}`);

      const result = await this.processProjectItems(project, projectItems, settings, notion);
      results.push({ project: project.name, ...result });
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

    this.log('\n' + '═'.repeat(60));
    this.log('🎉 Sync complete!');
    this.log('═'.repeat(60));

    return results;
  }
}
