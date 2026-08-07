import { writeFile as writeFileImpl, mkdir as mkdirImpl } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

export function buildPluginConfig(slug, ideationMethod, inboxDbId, projectSlugsPageId) {
  return {
    projectSlug: slug,
    ideationMethod,
    notionInboxDatabaseId: inboxDbId,
    notionProjectSlugsPageId: projectSlugsPageId,
    taskOutputPath: 'prompts/pending',
    taskProcessedPath: 'prompts/processed',
    unattendedThresholdHours: 24
  };
}

export async function setupProject(deps) {
  const { slug, ideationMethod, notionToken, inboxDbId, projectSlugsPageId, cwd, writeFile: depsWriteFile, mkdir: depsMkdir, notionClient: depsNotionClient } = deps;
  const writeFile = depsWriteFile || writeFileImpl;
  const mkdirFunc = depsMkdir || mkdirImpl;
  const notionClient = depsNotionClient || new NotionClient(notionToken);
  const parser = new ConfigParser(cwd);

  const { phases, modules } = await parser.autoImport();
  const modulesText = modules.map(m => m.name).join(', ');
  const phasesText = phases.map(p => p.name).join(', ');

  const { pageId } = await notionClient.upsertProjectSlugsPage(
    inboxDbId,
    { name: slug, slug, modules: modulesText, phases: phasesText },
    projectSlugsPageId
  );

  const pluginConfig = buildPluginConfig(slug, ideationMethod, inboxDbId, pageId);

  const promptsDirs = ['prompts/pending', 'prompts/processed', 'prompts/archived', 'prompts/deferred'];
  for (const dir of promptsDirs) {
    const fullPath = join(cwd, dir);
    if (!existsSync(fullPath)) {
      await mkdirFunc(fullPath, { recursive: true });
    }
  }

  await writeFile(join(cwd, '.nsma-plugin.json'), JSON.stringify(pluginConfig, null, 2));

  return { pageId, pluginConfig };
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

  const { pageId } = await setupProject({
    slug,
    ideationMethod,
    notionToken,
    inboxDbId,
    projectSlugsPageId,
    cwd: process.cwd()
  });

  console.log(`✅ NSMA Companion set up for "${slug}" (ideation method: ${ideationMethod}).`);
  console.log(`   Project Slugs page: ${pageId}`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error('nsma-setup failed:', error);
    process.exit(1);
  });
}
