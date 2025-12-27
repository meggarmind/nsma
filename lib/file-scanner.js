import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';

// Standard prompt folders
const PROMPT_FOLDERS = ['pending', 'processed', 'archived', 'deferred'];

/**
 * FileScanner - Scans prompt folders and parses frontmatter
 * Used by reverse sync to find files and extract notion_page_id
 */
export class FileScanner {
  constructor(promptsPath) {
    this.promptsPath = promptsPath;
  }

  /**
   * Scan all folders and return files grouped by folder
   * @returns {Promise<{pending: Array, processed: Array, archived: Array, deferred: Array}>}
   */
  async scanAll() {
    const results = {
      pending: [],
      processed: [],
      archived: [],
      deferred: []
    };

    if (!this.promptsPath || !existsSync(this.promptsPath)) {
      return results;
    }

    for (const folder of PROMPT_FOLDERS) {
      const folderPath = join(this.promptsPath, folder);

      if (!existsSync(folderPath)) {
        continue;
      }

      try {
        const files = await readdir(folderPath);

        for (const filename of files) {
          if (!filename.endsWith('.md')) {
            continue;
          }

          const filepath = join(folderPath, filename);
          const fileData = await this.parseFile(filepath);

          if (fileData) {
            results[folder].push({
              ...fileData,
              folder
            });
          }
        }
      } catch (error) {
        console.error(`Error scanning ${folderPath}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Parse a single markdown file and extract frontmatter
   * @param {string} filepath - Absolute path to the .md file
   * @returns {Promise<{filepath, filename, notionPageId, notionUrl, frontmatter}|null>}
   */
  async parseFile(filepath) {
    try {
      const content = await readFile(filepath, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);

      // Skip files without notion_page_id
      if (!frontmatter.notion_page_id) {
        return null;
      }

      return {
        filepath,
        filename: basename(filepath),
        notionPageId: frontmatter.notion_page_id,
        notionUrl: frontmatter.notion_url || null,
        lastSyncedToNotion: frontmatter.last_synced_to_notion || null,
        lastStatus: frontmatter.last_status || null,
        frontmatter
      };
    } catch (error) {
      console.error(`Error parsing ${filepath}:`, error.message);
      return null;
    }
  }

  /**
   * Parse YAML frontmatter from markdown content
   * @param {string} content - Raw markdown content
   * @returns {Object} - Parsed frontmatter key-value pairs
   */
  parseFrontmatter(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return {};
    }

    const frontmatter = {};
    const lines = frontmatterMatch[1].split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        frontmatter[key] = value;
      }
    }

    return frontmatter;
  }

  /**
   * Get files that need to be synced to Notion
   * A file needs sync if:
   * 1. It has never been synced (no last_synced_to_notion)
   * 2. Its folder changed since last sync (folder !== last_status)
   *
   * @returns {Promise<Array<{filepath, filename, notionPageId, folder, lastStatus, needsSync}>>}
   */
  async getFilesNeedingSync() {
    const allFiles = await this.scanAll();
    const needsSync = [];

    for (const [folder, files] of Object.entries(allFiles)) {
      for (const file of files) {
        // Check if file needs sync
        const statusChanged = file.lastStatus && file.lastStatus !== folder;
        const neverSynced = !file.lastSyncedToNotion;

        if (statusChanged || neverSynced) {
          needsSync.push({
            ...file,
            needsSync: true,
            reason: neverSynced ? 'never_synced' : 'status_changed'
          });
        }
      }
    }

    return needsSync;
  }

  /**
   * Get total count of files across all folders
   * @returns {Promise<{total: number, byFolder: Object}>}
   */
  async getFileCounts() {
    const allFiles = await this.scanAll();
    const byFolder = {};
    let total = 0;

    for (const [folder, files] of Object.entries(allFiles)) {
      byFolder[folder] = files.length;
      total += files.length;
    }

    return { total, byFolder };
  }
}

/**
 * Update frontmatter in a markdown file
 * Preserves the rest of the file content
 *
 * @param {string} filepath - Path to the .md file
 * @param {Object} updates - Key-value pairs to add/update in frontmatter
 */
export async function updateFileFrontmatter(filepath, updates) {
  const content = await readFile(filepath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error('No frontmatter found in file');
  }

  // Parse existing frontmatter
  const frontmatter = {};
  const lines = frontmatterMatch[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  // Apply updates
  Object.assign(frontmatter, updates);

  // Rebuild frontmatter string
  const newFrontmatter = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  // Replace frontmatter in content
  const newContent = content.replace(
    /^---\n[\s\S]*?\n---/,
    `---\n${newFrontmatter}\n---`
  );

  // Write back to file
  const { writeFile: fsWriteFile } = await import('fs/promises');
  await fsWriteFile(filepath, newContent);
}
