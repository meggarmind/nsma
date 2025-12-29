import { getConfiguredProviders } from './ai-providers.js';
import { withRetry } from './retry.js';

/**
 * PromptExpander uses configured AI providers to expand brief ideas
 * into fully-fleshed development prompts using project context.
 *
 * Supports multiple providers with automatic fallback:
 * - Tries providers in priority order
 * - Falls back to next provider if one fails
 * - Returns basic fallback content if all providers fail
 */
export class PromptExpander {
  constructor(settings) {
    this.settings = settings;
    this.providers = getConfiguredProviders(settings);
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

    // If no providers configured, return fallback immediately
    if (this.providers.length === 0) {
      console.log('No AI providers configured, using fallback content');
      return this.buildFallbackContent(item);
    }

    // Try each provider in priority order
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const isLastProvider = i === this.providers.length - 1;

      try {
        const result = await this.tryProvider(provider, systemPrompt, userPrompt);
        return result;
      } catch (error) {
        console.warn(`Provider ${provider.name} failed: ${error.message}`);

        if (!isLastProvider) {
          console.log(`Falling back to next provider...`);
        }
        // Continue to next provider
      }
    }

    // All providers failed, return fallback content
    console.log('All AI providers failed, using fallback content');
    return this.buildFallbackContent(item);
  }

  /**
   * Try a single provider with retry logic
   * @param {AIProvider} provider - The provider to use
   * @param {string} systemPrompt - System prompt
   * @param {string} userPrompt - User prompt
   * @returns {Promise<string>} - Expanded content
   */
  async tryProvider(provider, systemPrompt, userPrompt) {
    return withRetry(
      () => provider.expand(systemPrompt, userPrompt),
      {
        maxRetries: 3,
        baseDelay: 1000,
        isRetryable: provider.isRetryable.bind(provider),
        onRetry: (error, attempt, delay) => {
          console.warn(
            `${provider.name} retry ${attempt}/3: ${error.message} ` +
            `(waiting ${Math.round(delay / 1000)}s)`
          );
        }
      }
    );
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
