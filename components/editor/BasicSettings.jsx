'use client';

import Input from '../ui/Input';
import Card from '../ui/Card';

export default function BasicSettings({ project, onChange }) {
  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Basic Settings</h3>
      <div className="space-y-4">
        <Input
          label="Project Name"
          value={project.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Residio"
          required
        />
        <Input
          label="Slug"
          value={project.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          placeholder="e.g., residio (must match Notion)"
          required
        />
        <Input
          label="Prompts Path"
          value={project.promptsPath}
          onChange={(e) => onChange({ promptsPath: e.target.value })}
          placeholder="/home/user/projects/MyProject/prompts"
          helpText="Must end with '/prompts'. Subfolders (pending, processed, archived, deferred) will be created here."
          required
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.active}
            onChange={(e) => onChange({ active: e.target.checked })}
            className="w-4 h-4 rounded border-dark-700 bg-dark-800 text-accent focus:ring-accent"
          />
          <span className="text-dark-200">Active (sync enabled)</span>
        </label>
      </div>
    </Card>
  );
}
