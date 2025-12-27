'use client';

import Card from '../ui/Card';
import Input from '../ui/Input';

export default function AIConfig({ settings, onChange }) {
  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">AI Prompt Expansion</h3>
      <p className="text-sm text-dark-400 mb-4">
        When a Notion item has <code className="bg-dark-800 px-1 rounded">hydrated=false</code>,
        the system can use Claude to automatically expand brief ideas into detailed development prompts.
      </p>
      <div className="space-y-4">
        <Input
          type="password"
          label="Anthropic API Key"
          value={settings.anthropicApiKey || ''}
          onChange={(e) => onChange({ anthropicApiKey: e.target.value })}
          placeholder="sk-ant-..."
        />
        <p className="text-sm text-dark-500">
          Get your API key from{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Anthropic Console
          </a>
          . Leave empty to skip AI expansion (brief descriptions will be used as-is).
        </p>
      </div>
    </Card>
  );
}
