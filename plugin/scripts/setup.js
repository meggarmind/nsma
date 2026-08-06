import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, 'ideation-method': ideationMethod } = args;

  if (!slug || !ideationMethod) {
    console.error('Usage: setup.js --slug=<project-slug> --ideation-method=<brainstorming|plan-mode>');
    process.exit(1);
  }

  const notionToken = process.env.NSMA_NOTION_TOKEN;
  const inboxDbId = process.env.NSMA_NOTION_INBOX_DB_ID;
  const projectSlugsPageId = process.env.NSMA_NOTION_PROJECT_SLUGS_PAGE_ID || null;

  if (!notionToken || !inboxDbId) {
    console.error('NSMA_NOTION_TOKEN and NSMA_NOTION_INBOX_DB_ID must be set in the environment.');
    process.exit(1);
  }

  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());
  const { phases, modules } = await parser.autoImport();

  const modulesText = modules.map(m => m.name).join(', ');
  const phasesText = phases.map(p => p.name).join(', ');

  const { pageId } = await notionClient.upsertProjectSlugsPage(
    inboxDbId,
    { name: slug, slug, modules: modulesText, phases: phasesText },
    projectSlugsPageId
  );

  // notionToken is deliberately NOT persisted here — it stays in the
  // NSMA_NOTION_TOKEN environment variable only, so it never ends up
  // committed to the project's git history via .nsma-plugin.json.
  const pluginConfig = {
    projectSlug: slug,
    ideationMethod,
    notionInboxDatabaseId: inboxDbId,
    notionProjectSlugsPageId: pageId,
    taskOutputPath: 'prompts/pending',
    unattendedThresholdHours: 24
  };

  const promptsDirs = ['prompts/pending', 'prompts/processed', 'prompts/archived', 'prompts/deferred'];
  for (const dir of promptsDirs) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true });
    }
  }

  await writeFile(join(process.cwd(), '.nsma-plugin.json'), JSON.stringify(pluginConfig, null, 2));

  console.log(`✅ NSMA Companion set up for "${slug}" (ideation method: ${ideationMethod}).`);
  console.log(`   Project Slugs page: ${pageId}`);
}

main().catch((error) => {
  console.error('nsma-setup failed:', error);
  process.exit(1);
});
