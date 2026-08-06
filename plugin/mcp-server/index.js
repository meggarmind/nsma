import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';
import { recordTriageDecision } from './record-triage-decision.js';

async function loadPluginConfig() {
  const configPath = join(process.cwd(), '.nsma-plugin.json');
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const pluginConfig = await loadPluginConfig();
  const notionToken = process.env.NSMA_NOTION_TOKEN;
  if (!notionToken) {
    console.error('NSMA_NOTION_TOKEN is not set — the nsma-companion MCP server cannot start.');
    process.exit(1);
  }
  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());
  const { phases, modules, modulePhaseMapping } = await parser.autoImport();
  const project = {
    slug: pluginConfig.projectSlug,
    name: pluginConfig.projectName || pluginConfig.projectSlug,
    phases,
    modules,
    modulePhaseMapping
  };

  const server = new McpServer({ name: 'nsma-companion', version: '0.1.0' });

  server.registerTool(
    'record_triage_decision',
    {
      description: 'Record the outcome of a live triage conversation: writes the decision back to the Notion item and generates the local task file.',
      inputSchema: {
        itemId: z.string().describe('Notion page ID, from the SessionStart listing'),
        phase: z.string().describe('Assigned Phase name'),
        module: z.string().optional().describe('Affected Module, only if the conversation corrected it'),
        type: z.string().optional().describe('Reclassified Type, only if the conversation corrected it'),
        priority: z.enum(['Critical', 'High', 'Medium', 'Low', 'Nice to Have']),
        rationale: z.string().describe('Short paragraph: why this priority/phase')
      }
    },
    async (args) => {
      const result = await recordTriageDecision(args, { notionClient, project, settings: {} });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('nsma-companion MCP server failed to start:', error);
  process.exit(1);
});
