export class PromptGenerator {
  constructor(project, settings) {
    this.project = project;
    this.settings = settings;
  }

  determinePhase(item) {
    // First check module-phase mapping
    const module = this.project.modules?.find(m => m.name === item.affectedModule);
    if (module && this.project.modulePhaseMapping?.[module.id]) {
      const phaseId = this.project.modulePhaseMapping[module.id];
      const phase = this.project.phases?.find(p => p.id === phaseId);
      if (phase) return phase.name;
    }

    // Then check keywords
    const text = `${item.title} ${item.description}`.toLowerCase();
    for (const phase of (this.project.phases || [])) {
      const keywords = phase.keywords || [];
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        return phase.name;
      }
    }

    // Default to first phase or Backlog
    return this.project.phases?.[0]?.name || 'Backlog';
  }

  getRelatedFiles(moduleName) {
    const module = this.project.modules?.find(m => m.name === moduleName);
    return module?.filePaths || [];
  }

  estimateEffort(item) {
    const typeScores = {
      'Feature': 3,
      'Improvement': 2,
      'Bug Fix': 1,
      'Technical Debt': 2,
      'Research/Spike': 2
    };

    let score = typeScores[item.type] || 2;
    if (item.description?.length > 500) score += 1;

    if (score <= 1) return 'XS - < 2 hours';
    if (score <= 3) return 'S - 2-4 hours';
    if (score <= 5) return 'M - 1-2 days';
    return 'L - 3-5 days';
  }

  identifyDependencies(item) {
    const deps = [];
    const text = `${item.title} ${item.description}`.toLowerCase();

    const keywords = {
      'payment': ['payment gateway'],
      'sms': ['SMS gateway', 'notification service'],
      'email': ['email service', 'notification service'],
      'notification': ['notification service'],
      'report': ['reporting engine'],
      'authentication': ['authentication service'],
      'database': ['database migration'],
      'api': ['API layer']
    };

    for (const [kw, depList] of Object.entries(keywords)) {
      if (text.includes(kw)) deps.push(...depList);
    }

    return [...new Set(deps)];
  }

  generateFilename(item, phase) {
    const safeTitle = item.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // Sanitize phase name: remove special chars like : and / that break file paths
    const phaseSlug = phase.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    return `${timestamp}_${phaseSlug}_${safeTitle}.md`;
  }

  generate(item, pageContent = null) {
    const phase = this.determinePhase(item);
    const relatedFiles = this.getRelatedFiles(item.affectedModule);
    const effort = this.estimateEffort(item);
    const dependencies = this.identifyDependencies(item);
    const filename = this.generateFilename(item, phase);

    const relatedFilesStr = relatedFiles.length
      ? relatedFiles.map(f => `- \`${f}\``).join('\n')
      : 'None identified';

    const depsStr = dependencies.length
      ? dependencies.map(d => `- ${d}`).join('\n')
      : 'None';

    const now = new Date().toISOString();
    const successCriteria = this.settings.successCriteriaTemplate || '';

    let content = `---
notion_page_id: ${item.pageId}
notion_url: ${item.url}
project: ${this.project.slug}
hydrated: ${item.isHydrated}
generated_at: ${now}
type: ${item.type}
module: ${item.affectedModule}
phase: ${phase}
priority: ${item.priority}
effort: ${effort}
---

# Development Task: ${item.title}

## Metadata
- **Project**: ${this.project.name}
- **Type**: ${item.type}
- **Module**: ${item.affectedModule}
- **Phase**: ${phase}
- **Priority**: ${item.priority}
- **Effort**: ${effort}

## Related Files
${relatedFilesStr}

## Dependencies
${depsStr}

---

`;

    if (item.isHydrated && pageContent) {
      content += pageContent;
    } else {
      content += `## Objective
${item.description || item.title}
`;
    }

    content += `

---

## Success Criteria
${successCriteria}

## Completion Actions
After completing this task, update Notion status:

\`\`\`
mcp__notion__notion-update-page
page_id: ${item.pageId}
command: update_properties
properties:
  Status: Done
  Processed Date: [today's date]
  Analysis Notes: "Completed by Claude Code on [date]"
\`\`\`

Then move this file to \`processed/\`:
\`\`\`bash
mv prompts/pending/${filename} prompts/processed/
\`\`\`

---
*From mobile capture: ${item.capturedDate}*
*Notion: ${item.url}*
`;

    return { content, filename, phase, effort, dependencies };
  }
}
