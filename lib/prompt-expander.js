import Anthropic from '@anthropic-ai/sdk';

/**
 * PromptExpander uses the Anthropic Claude API to expand brief ideas
 * into fully-fleshed development prompts using project context.
 */
export class PromptExpander {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Expand a brief item description into a detailed development prompt
   * @param {Object} item - The Notion item with title, description, type, etc.
   * @param {Object} project - The project configuration with phases, modules, etc.
   * @returns {Promise<string>} - Expanded markdown content
   */
  async expand(item, project) {
    const systemPrompt = this.buildSystemPrompt(project);
    const userPrompt = this.buildUserPrompt(item);

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('PromptExpander error:', error.message);
      // Return a basic expansion on failure
      return this.buildFallbackContent(item);
    }
  }

  /**
   * Build the system prompt with project context
   */
  buildSystemPrompt(project) {
    const phasesContext = project.phases?.length
      ? project.phases.map(p => `- **${p.name}**: ${p.description || 'No description'}`).join('\n')
      : 'No phases defined';

    const modulesContext = project.modules?.length
      ? project.modules.map(m => {
          const files = m.filePaths?.length
            ? m.filePaths.map(f => `\`${f}\``).join(', ')
            : 'No files specified';
          return `- **${m.name}**: ${m.description || 'No description'} (Files: ${files})`;
        }).join('\n')
      : 'No modules defined';

    return `You are a software development assistant helping to expand brief task ideas into detailed, actionable development prompts.

## Project Context
**Project Name**: ${project.name}
**Project Slug**: ${project.slug}

### Available Phases
${phasesContext}

### Available Modules
${modulesContext}

## Your Task
Transform the brief idea provided into a comprehensive development prompt. Your output should be in markdown format and include:

1. **Objective**: A clear, expanded description of what needs to be done (2-3 sentences)
2. **Implementation Approach**: Step-by-step implementation guidance (3-5 numbered steps)
3. **Key Considerations**: Important edge cases, security concerns, or dependencies to consider (bullet points)
4. **Success Criteria**: Specific, measurable criteria for completion (checkbox format)

## Guidelines
- Be specific and actionable
- Reference the module's file paths when relevant
- Consider the item type (Feature, Bug Fix, etc.) when suggesting approach
- Keep the total output concise but comprehensive (aim for 200-400 words)
- Use markdown formatting for readability
- Do NOT include any preamble or explanation - just output the formatted prompt content`;
  }

  /**
   * Build the user prompt with item details
   */
  buildUserPrompt(item) {
    return `## Task to Expand

**Title**: ${item.title}
**Type**: ${item.type || 'Feature'}
**Priority**: ${item.priority || 'Medium'}
**Affected Module**: ${item.affectedModule || 'Not specified'}

**Brief Description**:
${item.description || item.title}

Please expand this into a detailed development prompt.`;
  }

  /**
   * Build fallback content if AI expansion fails
   */
  buildFallbackContent(item) {
    return `## Objective
${item.description || item.title}

## Implementation Approach
1. Analyze the current implementation in the affected module
2. Implement the required changes following existing patterns
3. Test the changes thoroughly
4. Update any related documentation

## Key Considerations
- Follow existing code patterns and conventions
- Consider edge cases and error handling
- Ensure backwards compatibility where applicable

## Success Criteria
- [ ] Implementation complete and functional
- [ ] Code follows project conventions
- [ ] No regressions introduced`;
  }
}
