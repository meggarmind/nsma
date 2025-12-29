/**
 * Feature-Dev Enhancer
 *
 * Enhances generated prompt files with architecture analysis, code exploration
 * results, implementation blueprints, and testing strategies for Feature and
 * Improvement type items.
 */

import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from './retry.js';

export class FeatureDevEnhancer {
  constructor(settings) {
    this.client = new Anthropic({ apiKey: settings.anthropicApiKey });
    this.settings = settings;
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  isRetryable(error) {
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
   * Enhance a prompt file with feature-dev analysis
   * @param {Object} item - The Notion item
   * @param {Object} project - The project configuration
   * @param {string} baseContent - The base generated content
   * @returns {Promise<string>} - Enhanced sections to append
   */
  async enhance(item, project, baseContent) {
    const systemPrompt = this.buildSystemPrompt(project);
    const userPrompt = this.buildFeatureDevPrompt(item, project, baseContent);

    const response = await withRetry(
      async () => {
        return this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        isRetryable: this.isRetryable,
        onRetry: (error, attempt, delay) => {
          console.warn(
            `Feature-dev enhancement retry ${attempt}/3: ${error.message} ` +
            `(waiting ${Math.round(delay / 1000)}s)`
          );
        }
      }
    );

    return this.formatEnhancedSections(response.content[0].text);
  }

  /**
   * Build the system prompt with project context
   * @param {Object} project - Project configuration
   * @returns {string}
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
          return `- **${m.name}**: ${m.description || 'No description'}\n  Files: ${files}`;
        }).join('\n')
      : 'No modules defined';

    // Try to derive project root from promptsPath
    const projectRoot = project.promptsPath
      ? project.promptsPath.replace(/\/prompts\/?$/, '')
      : 'Unknown';

    return `You are a senior software architect providing implementation guidance for a development task.

## Project Context
- **Project**: ${project.name}
- **Slug**: ${project.slug}
- **Root Path**: ${projectRoot}

### Project Phases
${phasesContext}

### Project Modules
${modulesContext}

## Your Task
Analyze the development task and provide detailed implementation guidance. Structure your response with these sections:

### Architecture Analysis
- How this fits into the existing codebase patterns
- Which architectural layers are affected
- Integration points with existing code

### Code Exploration Results
- Key files and functions to understand before implementing
- Related patterns and conventions in the codebase
- Dependencies and imports to be aware of

### Implementation Blueprint
- Step-by-step implementation plan with specific file paths
- Code patterns to follow (based on existing conventions)
- Order of implementation for minimal conflicts

### Testing Strategy
- Types of tests needed (unit, integration, e2e)
- Specific test files to create or modify
- Key scenarios and edge cases to test

## Guidelines
- Be specific and actionable
- Reference actual file paths from the module configuration
- Consider the project's existing patterns and conventions
- Keep guidance practical and implementable
- Do NOT include any preamble - output the sections directly`;
  }

  /**
   * Build the user prompt with item and base content context
   * @param {Object} item - The Notion item
   * @param {Object} project - Project configuration
   * @param {string} baseContent - Base generated content
   * @returns {string}
   */
  buildFeatureDevPrompt(item, project, baseContent) {
    return `## Development Task to Analyze

**Title**: ${item.title}
**Type**: ${item.type}
**Priority**: ${item.priority || 'Medium'}
**Affected Module**: ${item.affectedModule || 'Not specified'}

## Base Prompt Content (Already Generated)
${baseContent}

---

Provide detailed feature-dev analysis with Architecture Analysis, Code Exploration Results, Implementation Blueprint, and Testing Strategy sections.`;
  }

  /**
   * Format the AI response into enhanced sections
   * @param {string} aiResponse - Raw AI response
   * @returns {string}
   */
  formatEnhancedSections(aiResponse) {
    return `

---

## Feature-Dev Analysis

${aiResponse}

---
*Enhanced with feature-dev analysis*
`;
  }
}
