import { readFile as fsReadFile, rename as fsRename } from 'fs/promises';
import { basename, join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';

/**
 * Move a completed task file to processed/ and mark its Notion item Done.
 * @param {string} filePath - full path to the file in prompts/pending/
 * @param {{notionClient: NotionClient, promptsProcessedDir: string, rename?: Function, readFile?: Function}} deps
 * @returns {Promise<{success: true, notionUrl?: string} | {success: false, error: string}>}
 */
export async function completeTask(filePath, deps) {
  const { notionClient, promptsProcessedDir } = deps;
  const readFile = deps.readFile || fsReadFile;
  const rename = deps.rename || fsRename;

  const content = await readFile(filePath, 'utf-8');
  const match = content.match(/^notion_page_id:\s*(.+)$/m);
  if (!match) {
    return { success: false, error: `No notion_page_id found in frontmatter of ${filePath}` };
  }

  const pageId = match[1].trim();

  try {
    await notionClient.updatePage(pageId, { 'Status': { select: { name: 'Done' } } });
  } catch (error) {
    return { success: false, error: `Notion update failed: ${error.message}` };
  }

  const destination = join(promptsProcessedDir, basename(filePath));
  await rename(filePath, destination);

  return { success: true };
}
