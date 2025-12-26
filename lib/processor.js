import { mkdir, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from './notion.js';
import { PromptGenerator } from './prompt-generator.js';
import { getSettings, getProjects, updateProject, addLog } from './storage.js';

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

  async processProject(project, settings, notion) {
    this.log(`\n${'═'.repeat(60)}`);
    this.log(`📁 Processing: ${project.name}`);
    this.log(`${'═'.repeat(60)}`);

    if (!project.active) {
      this.log('⏸️  Project is paused, skipping');
      return { processed: 0, errors: 0, skipped: true };
    }

    if (!project.promptsPath) {
      this.log('⚠️  No prompts path configured, skipping');
      return { processed: 0, errors: 0, skipped: true };
    }

    await this.ensureDirectories(project);

    this.log('🔍 Fetching unprocessed items from Notion...');
    const pages = await notion.queryDatabase(
      settings.notionDatabaseId,
      project.slug,
      'Not started'
    );

    if (pages.length === 0) {
      this.log('✨ No unprocessed items found');
      const stats = await this.countPrompts(project);
      if (!this.dryRun) {
        await updateProject(project.id, { stats, lastSyncAt: new Date().toISOString() });
      }
      return { processed: 0, errors: 0, skipped: false };
    }

    this.log(`📋 Found ${pages.length} item(s)`);

    const generator = new PromptGenerator(project, settings);
    let processed = 0;
    let errors = 0;

    for (const page of pages) {
      const item = NotionClient.parseItem(page);

      this.log(`\n${'─'.repeat(40)}`);
      this.log(`Processing: ${item.title}`);

      try {
        let pageContent = null;
        if (item.isHydrated) {
          this.log('  📝 Fetching hydrated content...');
          const blocks = await notion.getPageBlocks(item.pageId);
          pageContent = notion.blocksToMarkdown(blocks);
        }

        const { content, filename, phase, effort, dependencies } =
          generator.generate(item, pageContent);

        this.log(`  ✓ Phase: ${phase}`);
        this.log(`  ✓ Effort: ${effort}`);

        const filepath = join(project.promptsPath, 'pending', filename);

        if (this.dryRun) {
          this.log(`  [DRY RUN] Would save: ${filepath}`);
        } else {
          await writeFile(filepath, content);
          this.log(`  ✓ Saved: ${filepath}`);

          await notion.updatePage(item.pageId, {
            'Status': { select: { name: 'In progress' } },
            'Assigned Phase': { select: { name: phase } },
            'Estimated Effort': { select: { name: effort } },
            'Generated Prompt Location': { url: filepath },
            'Analysis Notes': {
              rich_text: [{
                text: { content: `Prompt generated: ${filename}` }
              }]
            },
            'Processed Date': {
              date: { start: new Date().toISOString().slice(0, 10) }
            }
          });
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
    if (!this.dryRun) {
      await updateProject(project.id, { stats, lastSyncAt: new Date().toISOString() });
      await addLog({
        projectId: project.id,
        projectName: project.name,
        processed,
        errors,
        items: pages.map(p => NotionClient.parseItem(p).title)
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

    // Filter projects: specific project OR all active projects
    const targetProjects = this.targetProject
      ? projects.filter(p => p.slug === this.targetProject || p.name === this.targetProject || p.id === this.targetProject)
      : projects.filter(p => p.active);

    if (targetProjects.length === 0) {
      this.log('⚠️  No projects to process');
      if (this.targetProject) {
        this.log(`   Project "${this.targetProject}" not found or not active`);
      }
      return [];
    }

    this.log(`📁 Processing ${targetProjects.length} project(s)\n`);

    const results = [];
    for (const project of targetProjects) {
      const result = await this.processProject(project, settings, notion);
      results.push({ project: project.name, ...result });
    }

    this.log('\n' + '═'.repeat(60));
    this.log('🎉 Sync complete!');
    this.log('═'.repeat(60));

    return results;
  }
}
