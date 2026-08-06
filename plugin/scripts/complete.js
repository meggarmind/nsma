import { readFile as fsReadFile, rename as fsRename } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';
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

async function loadPluginConfig() {
  const configPath = join(process.cwd(), '.nsma-plugin.json');
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(await fsReadFile(configPath, 'utf-8'));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: complete.js <resolved-file-path>');
    process.exit(1);
  }

  const notionToken = process.env.NSMA_NOTION_TOKEN;
  if (!notionToken) {
    console.error('NSMA_NOTION_TOKEN must be set in the environment.');
    process.exit(1);
  }

  const notionClient = new NotionClient(notionToken);
  const pluginConfig = await loadPluginConfig();
  const promptsProcessedDir = pluginConfig?.taskProcessedPath
    ? join(process.cwd(), pluginConfig.taskProcessedPath)
    : join(process.cwd(), 'prompts', 'processed');

  const result = await completeTask(filePath, { notionClient, promptsProcessedDir });

  if (result.success) {
    console.log(`✅ Task complete: moved to ${promptsProcessedDir}, Notion item marked Done.`);
  } else {
    console.error(`nsma-complete failed: ${result.error}`);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error('nsma-complete failed:', error);
    process.exit(1);
  });
}
