import { readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';
import { PromptGenerator } from '../lib/prompt-generator.js';
import { splitByType, getPendingPageIds, findStaleWrites, loadDecisionFromPendingFile } from '../lib/routing.js';
import { formatIdeationListing } from '../lib/format-listing.js';
import { recordTriageDecision, buildTriageProperties } from '../mcp-server/record-triage-decision.js';

/**
 * Insert a `synced_to_notion: true` frontmatter line right after the opening
 * `---` delimiter, unless it's already present. Used by the processed/
 * safety-net scan (Finding 7) so a file whose Notion status has already been
 * confirmed Done is skipped on future scans without a Notion round-trip.
 */
function addSyncedMarker(content) {
  if (/^synced_to_notion:\s*true\s*$/m.test(content)) return content;
  return content.replace(/^---\r?\n/, (match) => `${match}synced_to_notion: true\n`);
}

async function loadPluginConfig() {
  const configPath = join(process.cwd(), '.nsma-plugin.json');
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(await readFile(configPath, 'utf-8'));
}

async function run() {
  const pluginConfig = await loadPluginConfig();
  if (!pluginConfig) {
    console.log('NSMA Companion not set up for this project — run /nsma-setup.');
    return;
  }

  const notionToken = process.env.NSMA_NOTION_TOKEN;
  if (!notionToken) {
    console.warn('⚠️ NSMA_NOTION_TOKEN is not set — skipping this session\'s Notion sync.');
    return;
  }

  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());

  let phases = [];
  let modules = [];
  let modulePhaseMapping = {};

  try {
    ({ phases, modules, modulePhaseMapping } = await parser.autoImport());

    const modulesText = modules.map(m => m.name).join(', ');
    const phasesText = phases.map(p => p.name).join(', ');
    await notionClient.upsertProjectSlugsPage(
      pluginConfig.notionProjectSlugsDatabaseId || pluginConfig.notionInboxDatabaseId,
      { name: pluginConfig.projectName || pluginConfig.projectSlug, slug: pluginConfig.projectSlug, modules: modulesText, phases: phasesText },
      pluginConfig.notionProjectSlugsPageId || null
    );
  } catch (error) {
    console.warn(`⚠️ Config sync failed, continuing with last-known config: ${error.message}`);
  }

  const project = { slug: pluginConfig.projectSlug, name: pluginConfig.projectName || pluginConfig.projectSlug, phases, modules, modulePhaseMapping };

  let items = [];
  try {
    const inboxDbId = pluginConfig.notionInboxDatabaseId;
    const pages = await notionClient.queryDatabase(inboxDbId, pluginConfig.projectSlug, 'Not started');
    items = pages.map(page => NotionClient.parseItem(page));
  } catch (error) {
    console.warn(`⚠️ Notion query failed, skipping this session's listing: ${error.message}`);
  }

  const promptsPendingDir = join(process.cwd(), pluginConfig.taskOutputPath || 'prompts/pending');
  const pendingPageIds = await getPendingPageIds(promptsPendingDir);
  const { stale, remaining } = findStaleWrites(items, pendingPageIds);

  for (const item of stale) {
    console.log(`🔄 Retrying stale Notion write for "${item.title}"...`);
    let decision;
    try {
      decision = await loadDecisionFromPendingFile(promptsPendingDir, item.pageId);
    } catch (error) {
      console.warn(`  Could not read the local pending file: ${error.message}`);
      continue;
    }
    if (!decision || !decision.phase || !decision.priority) {
      console.warn(`  Could not reconstruct the original decision from the local file — skipping retry.`);
      continue;
    }
    const properties = buildTriageProperties(decision);
    await notionClient.updatePage(item.pageId, properties).catch(err => {
      console.warn(`  Still failing: ${err.message}`);
    });
  }

  const { bugItems, ideationItems } = splitByType(remaining);

  const generator = new PromptGenerator(project, {});
  for (const item of bugItems) {
    const phase = generator.determinePhase(item);
    await recordTriageDecision(
      { itemId: item.pageId, phase, priority: item.priority || 'Medium', rationale: 'Bug-family item — mechanically classified, no live ideation needed.' },
      { notionClient, project, settings: {}, promptsPendingDir }
    );
    console.log(`✅ [EXECUTE] ${item.title} (${item.type}, mechanically classified to ${phase})`);
  }

  console.log('');
  console.log(formatIdeationListing(ideationItems, pluginConfig.ideationMethod));

  const promptsProcessedDir = join(process.cwd(), 'prompts/processed');
  if (existsSync(promptsProcessedDir)) {
    const files = await readdir(promptsProcessedDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = join(promptsProcessedDir, file);
      const content = await readFile(filePath, 'utf-8');

      // Already confirmed Done in a prior session — skip the Notion round-trip
      // so this scan stays bounded as prompts/processed/ grows over time.
      if (/^synced_to_notion:\s*true\s*$/m.test(content)) continue;

      const match = content.match(/^notion_page_id:\s*(.+)$/m);
      if (!match) continue;
      const pageId = match[1].trim();

      try {
        const page = await notionClient.request('GET', `/pages/${pageId}`);
        const item = NotionClient.parseItem(page);
        if (item.status !== 'Done') {
          await notionClient.updatePage(pageId, { 'Status': { select: { name: 'Done' } } });
          console.log(`✅ Synced missed completion: ${item.title}`);
        }
        // Notion status is now confirmed Done either way — mark the file so
        // future sessions skip it without a Notion round-trip.
        await writeFile(filePath, addSyncedMarker(content));
      } catch (error) {
        console.warn(`⚠️ Could not verify processed item ${pageId}: ${error.message}`);
      }
    }
  }
}

run().catch((error) => {
  console.error('NSMA Companion session-start hook failed:', error);
});
