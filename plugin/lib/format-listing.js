/**
 * Format the non-bug item queue as text for SessionStart hook output.
 * @param {Array<{pageId: string, title: string, type: string, affectedModule: string, priority: string, description: string}>} items
 * @param {string} [ideationMethod] - the project's configured ideation method ('brainstorming' | 'plan-mode'), from .nsma-plugin.json
 * @returns {string}
 */
export function formatIdeationListing(items, ideationMethod) {
  if (items.length === 0) {
    return 'No items need triage.';
  }

  const lines = ['The following items need triage this session:', ''];

  for (const item of items) {
    lines.push(`- **${item.title}** (${item.pageId})`);
    lines.push(`  Type: ${item.type} | Module: ${item.affectedModule || 'none'} | Priority: ${item.priority}`);
    lines.push(`  ${item.description || '(no description)'}`);
    lines.push('');
  }

  let ideationDirective;
  if (ideationMethod === 'brainstorming') {
    ideationDirective = 'run superpowers:brainstorming';
  } else if (ideationMethod === 'plan-mode') {
    ideationDirective = "use Claude Code's plan mode";
  } else {
    ideationDirective = "run superpowers:brainstorming (or plan mode, per this project's configured ideation method)";
  }

  lines.push(
    `For each item above, ${ideationDirective} ` +
    'to determine urgency and phase fit, then call the record_triage_decision MCP tool with your conclusion.'
  );

  return lines.join('\n');
}
