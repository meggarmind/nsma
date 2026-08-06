import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';
import { PromptGenerator } from '../lib/prompt-generator.js';
import { splitByType, getPendingPageIds, findStaleWrites } from '../lib/routing.js';
import { formatIdeationListing } from '../lib/format-listing.js';
import { recordTriageDecision, buildTriageProperties } from '../mcp-server/record-triage-decision.js';

/**
 * Find the pending file for a given Notion page ID and pull the frontmatter
 * fields needed to reconstruct a full triage decision for a retry — the
 * original write's rationale text isn't preserved locally, so a retry uses
 * a fixed placeholder for it rather than losing the rest of the decision.
 */
async function loadDecisionFromPendingFile(promptsPendingDir, pageId) {
  const files = await readdir(promptsPendingDir);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(promptsPendingDir, file), 'utf-8');
    if (!content.includes(`notion_page_id: ${pageId}`)) continue;

    const field = (name) => content.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
    return {
      phase: field('phase'),
      module: field('module'),
      type: field('type'),
      priority: field('priority'),
      rationale: 'Recovered after a previous write failure — see the task file for full context.'
    };
  }
  return null;
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
      { notionClient, project, settings: {} }
    );
    console.log(`✅ [EXECUTE] ${item.title} (${item.type}, mechanically classified to ${phase})`);
  }

  console.log('');
  console.log(formatIdeationListing(ideationItems));

  const promptsProcessedDir = join(process.cwd(), 'prompts/processed');
  if (existsSync(promptsProcessedDir)) {
    const processedIds = await getPendingPageIds(promptsProcessedDir);
    for (const pageId of processedIds) {
      try {
        const page = await notionClient.request('GET', `/pages/${pageId}`);
        const item = NotionClient.parseItem(page);
        if (item.status !== 'Done') {
          await notionClient.updatePage(pageId, { 'Status': { select: { name: 'Done' } } });
          console.log(`✅ Synced missed completion: ${item.title}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not verify processed item ${pageId}: ${error.message}`);
      }
    }
  }
}

run().catch((error) => {
  console.error('NSMA Companion session-start hook failed:', error);
});
