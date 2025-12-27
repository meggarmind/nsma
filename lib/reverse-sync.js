import { unlink, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { FileScanner, updateFileFrontmatter } from './file-scanner.js';

// Folder → Notion Status mapping
export const FOLDER_STATUS_MAP = {
  'pending': 'In progress',
  'processed': 'Done',
  'archived': 'Archived',
  'deferred': 'Deferred'
};

// Notion Status → Folder mapping (reverse lookup)
export const STATUS_FOLDER_MAP = {
  'In progress': 'pending',
  'Done': 'processed',
  'Archived': 'archived',
  'Deferred': 'deferred'
};

/**
 * ReverseSyncProcessor - Syncs local file folder locations to Notion page statuses
 *
 * When a user moves a file from pending/ to processed/, this processor
 * updates the corresponding Notion page status from "In progress" to "Done"
 */
export class ReverseSyncProcessor {
  constructor(options = {}) {
    this.notionClient = options.notionClient;
    this.errorMode = options.errorMode || 'skip'; // 'skip' | 'delete' | 'archive'
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;

    // Rate limiting: Notion allows 3 requests/second
    this.requestDelay = 350; // ms between requests (slightly under 3/sec)
  }

  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Process reverse sync for a single project
   * @param {Object} project - Project object with promptsPath
   * @returns {Promise<{updated: number, failed: number, skipped: number, errors: Array}>}
   */
  async syncProject(project) {
    this.log(`\n🔄 Reverse sync: ${project.name}`);
    this.log(`   Path: ${project.promptsPath}`);

    if (!project.promptsPath || !existsSync(project.promptsPath)) {
      this.log('   ⚠️  Prompts path does not exist, skipping');
      return { updated: 0, failed: 0, skipped: 1, errors: [] };
    }

    const scanner = new FileScanner(project.promptsPath);
    const filesByFolder = await scanner.scanAll();

    const results = {
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Count total files
    let totalFiles = 0;
    for (const files of Object.values(filesByFolder)) {
      totalFiles += files.length;
    }
    this.log(`   📁 Found ${totalFiles} total files`);

    // Process each folder
    for (const [folder, files] of Object.entries(filesByFolder)) {
      const targetStatus = FOLDER_STATUS_MAP[folder];

      if (!targetStatus) {
        this.log(`   ⚠️  Unknown folder: ${folder}`);
        continue;
      }

      for (const file of files) {
        try {
          const synced = await this.syncFile(file, folder, targetStatus, project);

          if (synced) {
            results.updated++;
            this.log(`   ✓ ${file.filename} → ${targetStatus}`);
          } else {
            results.skipped++;
          }

          // Rate limiting delay
          await this.delay(this.requestDelay);

        } catch (error) {
          results.failed++;
          results.errors.push({
            file: file.filename,
            filepath: file.filepath,
            notionPageId: file.notionPageId,
            error: error.message
          });

          await this.handleError(file, error, project);
        }
      }
    }

    this.log(`\n   ✅ Complete: ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    return results;
  }

  /**
   * Sync a single file to Notion
   * @returns {Promise<boolean>} - true if updated, false if skipped
   */
  async syncFile(file, folder, targetStatus, project) {
    // Skip if already synced to this status
    if (file.lastStatus === folder) {
      return false; // No change needed
    }

    if (this.dryRun) {
      this.log(`   [DRY RUN] Would update ${file.notionPageId} → ${targetStatus}`);
      return true;
    }

    // Update Notion page status
    await this.notionClient.updatePage(file.notionPageId, {
      'Status': { select: { name: targetStatus } }
    });

    // Update frontmatter with sync timestamp and current status
    await updateFileFrontmatter(file.filepath, {
      last_synced_to_notion: new Date().toISOString(),
      last_status: folder
    });

    return true;
  }

  /**
   * Handle sync errors based on errorMode configuration
   */
  async handleError(file, error, project) {
    const errorMessage = error.message || 'Unknown error';
    this.log(`   ❌ ${file.filename}: ${errorMessage}`);

    // Check for specific Notion API errors
    const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
    const is401 = errorMessage.includes('401') || errorMessage.includes('unauthorized');
    const is429 = errorMessage.includes('429') || errorMessage.includes('rate limit');

    // Auth failures should stop the sync
    if (is401) {
      throw new Error('Notion authorization failed - check API token');
    }

    // Rate limit - log and continue (will be handled by delay)
    if (is429) {
      this.log(`   ⚠️  Rate limited, will retry in next sync`);
      return;
    }

    // For 404 (page deleted in Notion), apply errorMode
    if (is404) {
      await this.applyErrorMode(file, project, 'Notion page not found (may have been deleted)');
      return;
    }

    // For other errors, just log and continue
    this.log(`   ⚠️  Skipping ${file.filename} due to error`);
  }

  /**
   * Apply configured error handling mode
   */
  async applyErrorMode(file, project, reason) {
    if (this.dryRun) {
      this.log(`   [DRY RUN] Would apply errorMode '${this.errorMode}' to ${file.filename}`);
      return;
    }

    switch (this.errorMode) {
      case 'skip':
        this.log(`   ⚠️  Skipping: ${reason}`);
        break;

      case 'delete':
        try {
          await unlink(file.filepath);
          this.log(`   🗑️  Deleted ${file.filename}: ${reason}`);
        } catch (deleteError) {
          this.log(`   ❌ Failed to delete: ${deleteError.message}`);
        }
        break;

      case 'archive':
        try {
          const archivePath = join(project.promptsPath, 'archived', file.filename);
          await rename(file.filepath, archivePath);
          this.log(`   📦 Moved to archived/: ${reason}`);
        } catch (moveError) {
          this.log(`   ❌ Failed to archive: ${moveError.message}`);
        }
        break;

      default:
        this.log(`   ⚠️  Unknown errorMode '${this.errorMode}', skipping`);
    }
  }

  /**
   * Delay helper for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process multiple projects
   * @param {Array} projects - Array of project objects
   * @returns {Promise<Array<{project: string, ...results}>>}
   */
  async syncAllProjects(projects) {
    const results = [];

    for (const project of projects) {
      // Skip if reverse sync is disabled for this project
      if (project.reverseSyncEnabled === false) {
        this.log(`\n⏭️  Skipping ${project.name} (reverse sync disabled)`);
        continue;
      }

      const errorMode = project.reverseSyncErrorMode || this.errorMode;
      this.errorMode = errorMode;

      const result = await this.syncProject(project);
      results.push({
        project: project.name,
        projectId: project.id,
        ...result
      });
    }

    return results;
  }
}

/**
 * Standalone function to run reverse sync for a project
 * Useful for CLI and API endpoints
 */
export async function runReverseSync(project, notionClient, options = {}) {
  const processor = new ReverseSyncProcessor({
    notionClient,
    errorMode: project.reverseSyncErrorMode || options.errorMode || 'skip',
    dryRun: options.dryRun || false,
    verbose: options.verbose || false
  });

  return processor.syncProject(project);
}
