import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from './retry.js';

/**
 * PromptExpander uses the Anthropic Claude API to expand brief ideas
 * into fully-fleshed development prompts using project context.
 */
export class PromptExpander {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Check if a Claude API error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether to retry
   */
  isClaudeRetryable(error) {
    const status = error.status || error.statusCode;
    // 529 = overloaded, 5xx = server errors
    if (status === 529 || status >= 500) return true;

    // Network errors
    const code = error.code;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' || code === 'ECONNRESET') {
      return true;
    }

    // Check message for retryable patterns
    const message = (error.message || '').toLowerCase();
    if (message.includes('overloaded') || message.includes('529')) return true;
    if (message.includes('rate limit')) return true;

    return false;
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
      const response = await withRetry(
        async () => {
          return this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          });
        },
        {
          maxRetries: 3,
          baseDelay: 1000,
          isRetryable: this.isClaudeRetryable,
          onRetry: (error, attempt, delay) => {
            console.warn(
              `Claude API retry ${attempt}/3: ${error.message} ` +
              `(waiting ${Math.round(delay / 1000)}s)`
            );
          }
        }
      );

      return response.content[0].text;
    } catch (error) {
      console.error('PromptExpander error:', error.message);
      // Return a basic expansion on failure (after all retries exhausted)
      return this.buildFallbackContent(item);
    }
  }

  /**
   * Build the default system prompt with project context
   * This is the template used when no custom prompt is configured
   */
  buildDefaultSystemPrompt(project) {
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
   * Build the system prompt, applying custom prompt configuration if present
   * @param {Object} project - Project with optional aiPromptMode and aiPromptCustom
   * @returns {string} - The final system prompt
   */
  buildSystemPrompt(project) {
    const defaultPrompt = this.buildDefaultSystemPrompt(project);

    // If no custom prompt configured, use default
    if (!project.aiPromptCustom || project.aiPromptCustom.trim() === '') {
      return defaultPrompt;
    }

    // Check prompt mode
    const mode = project.aiPromptMode || 'extend';

    if (mode === 'replace') {
      // Full replacement - use custom prompt only
      // User is responsible for including any needed context
      return project.aiPromptCustom;
    }

    // Extend mode (default) - append custom instructions to default
    return `${defaultPrompt}

## Additional Instructions
${project.aiPromptCustom}`;
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
