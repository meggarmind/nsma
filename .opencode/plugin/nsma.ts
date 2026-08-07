// NSMA Companion — opencode plugin
// Adds the NSMA MCP server and project-aware commands.
// The MCP server is defined in opencode.json (mcp.nsma-companion).
// This plugin is auto-discovered from .opencode/plugin/.

/** @type {import('@opencode-ai/plugin').Plugin} */
export default async ({ client, project, directory }) => {
  return {
    // Inject NSMA context into new chat sessions
    "chat.message": async (input, output) => {
      // Only on the first user message in a session
      if (input.messages?.length <= 1) {
        const fs = await import("fs/promises");
        const path = await import("path");
        const configPath = path.join(directory, ".nsma-plugin.json");
        try {
          const raw = await fs.readFile(configPath, "utf-8");
          const nsmaConfig = JSON.parse(raw);
          output.system = [
            ...(output.system || []),
            `\n## NSMA Integration\nThis project uses the Notion Sync Manager. Triage workflow:\n- Bug-family items (Bug Fix, Documentation, Security Fix, Technical Debt) are mechanically classified — no triage needed.\n- Ideation items (Feature, Improvement, Research/Spike) need your decision: determine phase, priority, and module, then call \`record_triage_decision\`.\n- When a task is done, run \`/nsma-complete <filename>\` to mark it Done in Notion.\n- Project slug: \`${nsmaConfig.projectSlug}\`, ideation method: \`${nsmaConfig.ideationMethod}\`\n`
          ];
        } catch {
          // .nsma-plugin.json not found — plugin not set up yet, run /nsma-setup
        }
      }
    }
  };
};
