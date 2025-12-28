'use client';

import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Info } from 'lucide-react';
import Card from '../ui/Card';

/**
 * AIPromptEditor - Configure AI prompt expansion settings per project
 *
 * Features:
 * - Toggle AI expansion on/off
 * - Choose between 'extend' (append to default) or 'replace' (full replacement) mode
 * - Custom prompt textarea
 * - Preview of resulting prompt (collapsible)
 */
export default function AIPromptEditor({ project, onChange }) {
  const [showPreview, setShowPreview] = useState(false);

  const aiEnabled = project.aiPromptEnabled !== false; // Default true
  const aiMode = project.aiPromptMode || 'extend';
  const customPrompt = project.aiPromptCustom || '';

  // Generate a simplified preview of the default prompt
  const defaultPromptPreview = `You are a software development assistant helping to expand brief task ideas...

## Project Context
**Project Name**: ${project.name}
**Project Slug**: ${project.slug}

### Available Phases
${project.phases?.length ? project.phases.map(p => `- ${p.name}`).join('\n') : 'No phases defined'}

### Available Modules
${project.modules?.length ? project.modules.map(m => `- ${m.name}`).join('\n') : 'No modules defined'}

## Your Task
Transform the brief idea into a comprehensive development prompt...
[Includes: Objective, Implementation Approach, Key Considerations, Success Criteria]`;

  // Build preview of final prompt
  const getFinalPromptPreview = () => {
    if (!customPrompt.trim()) {
      return defaultPromptPreview;
    }

    if (aiMode === 'replace') {
      return customPrompt;
    }

    return `${defaultPromptPreview}

## Additional Instructions
${customPrompt}`;
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="text-brand-400" size={20} />
        <h3 className="text-xl font-semibold text-dark-50">AI Prompt Configuration</h3>
      </div>

      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => onChange({ aiPromptEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-dark-700 bg-dark-800 text-accent focus:ring-accent"
          />
          <span className="text-dark-200">Enable AI prompt expansion</span>
        </label>

        {aiEnabled && (
          <>
            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Custom Prompt Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="aiPromptMode"
                    value="extend"
                    checked={aiMode === 'extend'}
                    onChange={() => onChange({ aiPromptMode: 'extend' })}
                    className="w-4 h-4 border-dark-700 bg-dark-800 text-accent focus:ring-accent"
                  />
                  <span className="text-dark-200">Extend default</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="aiPromptMode"
                    value="replace"
                    checked={aiMode === 'replace'}
                    onChange={() => onChange({ aiPromptMode: 'replace' })}
                    className="w-4 h-4 border-dark-700 bg-dark-800 text-accent focus:ring-accent"
                  />
                  <span className="text-dark-200">Replace default</span>
                </label>
              </div>
              <p className="text-xs text-dark-500 mt-1">
                {aiMode === 'extend'
                  ? 'Your custom instructions will be appended to the default prompt.'
                  : 'Your custom prompt will completely replace the default. You must include all context.'}
              </p>
            </div>

            {/* Custom Prompt Textarea */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                {aiMode === 'extend' ? 'Additional Instructions' : 'Custom System Prompt'}
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => onChange({ aiPromptCustom: e.target.value })}
                placeholder={
                  aiMode === 'extend'
                    ? 'Add specific instructions, preferences, or guidelines for this project...'
                    : 'Write your complete custom system prompt here...'
                }
                rows={6}
                className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
              />
              <p className="text-xs text-dark-500 mt-1">
                {aiMode === 'extend'
                  ? 'Leave empty to use the default prompt only.'
                  : 'Include project context if needed: {{project.name}}, phases, modules, etc.'}
              </p>
            </div>

            {/* Preview Toggle */}
            <div className="border-t border-dark-700 pt-4">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
              >
                {showPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showPreview ? 'Hide' : 'Show'} Prompt Preview
              </button>

              {showPreview && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={14} className="text-dark-500" />
                    <span className="text-xs text-dark-500">
                      This is how the system prompt will look when syncing items:
                    </span>
                  </div>
                  <pre className="p-4 bg-dark-900 rounded-lg text-xs text-dark-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {getFinalPromptPreview()}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}

        {!aiEnabled && (
          <div className="p-4 bg-dark-800 rounded-lg border border-dark-700">
            <p className="text-sm text-dark-400">
              When AI expansion is disabled, items will use their brief description or hydrated
              content from Notion without AI enhancement.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
