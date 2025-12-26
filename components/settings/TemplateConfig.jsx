'use client';

import Card from '../ui/Card';

export default function TemplateConfig({ settings, onChange }) {
  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Success Criteria Template</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Default Success Criteria (added to all prompts)
          </label>
          <textarea
            value={settings.successCriteriaTemplate}
            onChange={(e) => onChange({ successCriteriaTemplate: e.target.value })}
            rows={8}
            className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all font-mono text-sm"
            placeholder="- [ ] Implementation complete..."
          />
        </div>
        <p className="text-sm text-dark-500">
          This template is included in every generated prompt file
        </p>
      </div>
    </Card>
  );
}
