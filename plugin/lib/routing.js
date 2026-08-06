import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const BUG_FAMILY_TYPES = ['Bug Fix', 'Documentation', 'Security Fix', 'Technical Debt'];

/**
 * Split items into the mechanical (bug-family) fast path and the live-ideation queue.
 * @param {Array<{type: string}>} items
 * @returns {{bugItems: Array, ideationItems: Array}}
 */
export function splitByType(items) {
  const bugItems = [];
  const ideationItems = [];

  for (const item of items) {
    if (BUG_FAMILY_TYPES.includes(item.type)) {
      bugItems.push(item);
    } else {
      ideationItems.push(item);
    }
  }

  return { bugItems, ideationItems };
}

/**
 * Read notion_page_id frontmatter from every .md file in a prompts/pending-style directory.
 * @param {string} promptsPendingDir
 * @returns {Promise<Set<string>>}
 */
export async function getPendingPageIds(promptsPendingDir) {
  if (!existsSync(promptsPendingDir)) {
    return new Set();
  }

  const files = await readdir(promptsPendingDir);
  const ids = new Set();

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const content = await readFile(join(promptsPendingDir, file), 'utf-8');
    const match = content.match(/^notion_page_id:\s*(.+)$/m);
    if (match) {
      ids.add(match[1].trim());
    }
  }

  return ids;
}

/**
 * Separate items that already have a local task file (Notion write must have
 * failed previously) from items that genuinely still need triage.
 * @param {Array<{pageId: string}>} items
 * @param {Set<string>} pendingPageIds
 * @returns {{stale: Array, remaining: Array}}
 */
export function findStaleWrites(items, pendingPageIds) {
  const stale = [];
  const remaining = [];

  for (const item of items) {
    if (pendingPageIds.has(item.pageId)) {
      stale.push(item);
    } else {
      remaining.push(item);
    }
  }

  return { stale, remaining };
}
