import { writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { PromptGenerator } from '../lib/prompt-generator.js';

/**
 * Build the Notion properties payload for a triage decision. Pure function —
 * shared between the live write-back path (below) and the SessionStart
 * hook's stale-write retry path (Task 6), so a retry re-sends the full
 * decision, not just Status.
 * @param {{phase: string, module?: string, type?: string, priority: string, rationale: string}} decision
 * @returns {object} Notion properties object, ready for NotionClient.updatePage
 */
export function buildTriageProperties(decision) {
  const properties = {
    'Assigned Phase': { select: { name: decision.phase } },
    'Priority': { select: { name: decision.priority } },
    'Status': { select: { name: 'In progress' } },
    'Analysis Notes': { rich_text: [{ text: { content: decision.rationale } }] }
  };
  if (decision.module) {
    properties['Affected Module'] = { select: { name: decision.module } };
  }
  if (decision.type) {
    properties['Type'] = { select: { name: decision.type } };
  }
  return properties;
}

/**
 * Apply a live triage decision: write the properties to Notion and generate
 * the local task file. Never throws — failures are returned as
 * { success: false, error } so the MCP tool layer can report them cleanly.
 *
 * @param {{itemId: string, phase: string, module?: string, type?: string, priority: string, rationale: string}} decision
 * @param {{notionClient: NotionClient, project: object, settings: object, writeFile?: Function}} deps
 * @returns {Promise<{success: true, notionUrl: string, filePath: string} | {success: false, error: string}>}
 */
export async function recordTriageDecision(decision, deps) {
  const { notionClient, project, settings } = deps;
  const writeFile = deps.writeFile || fsWriteFile;

  let page;
  try {
    page = await notionClient.request('GET', `/pages/${decision.itemId}`);
  } catch (error) {
    return { success: false, error: `Could not read item ${decision.itemId}: ${error.message}` };
  }

  const item = NotionClient.parseItem(page);
  const properties = buildTriageProperties(decision);

  let notionError = null;
  try {
    await notionClient.updatePage(decision.itemId, properties);
  } catch (error) {
    notionError = error.message;
  }

  const generator = new PromptGenerator(project, settings);
  const generated = generator.generate({
    ...item,
    assignedPhase: decision.phase,
    affectedModule: decision.module || item.affectedModule,
    type: decision.type || item.type,
    priority: decision.priority
  });

  const promptsPendingDir = join(process.cwd(), 'prompts', 'pending');
  if (!existsSync(promptsPendingDir)) {
    await mkdir(promptsPendingDir, { recursive: true });
  }
  // Normalize to forward slashes: Node's fs accepts them on all platforms,
  // and callers (e.g. Task 6's retry, MCP responses) expect a stable format.
  const filePath = join(promptsPendingDir, generated.filename).split('\\').join('/');
  await writeFile(filePath, generated.content);

  if (notionError) {
    return { success: false, error: `Task file written, but Notion update failed: ${notionError}` };
  }

  return { success: true, notionUrl: item.url, filePath };
}
