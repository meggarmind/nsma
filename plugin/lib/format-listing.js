/**
 * Format the non-bug item queue as text for SessionStart hook output.
 * @param {Array<{pageId: string, title: string, type: string, affectedModule: string, priority: string, description: string}>} items
 * @returns {string}
 */
export function formatIdeationListing(items) {
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

  lines.push(
    'For each item above, run superpowers:brainstorming (or plan mode, per this project\'s configured ideation method) ' +
    'to determine urgency and phase fit, then call the record_triage_decision MCP tool with your conclusion.'
  );

  return lines.join('\n');
}
