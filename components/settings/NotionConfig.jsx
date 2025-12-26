'use client';

import Card from '../ui/Card';
import Input from '../ui/Input';

export default function NotionConfig({ settings, onChange }) {
  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Notion Integration</h3>
      <div className="space-y-4">
        <Input
          type="password"
          label="Notion Integration Token"
          value={settings.notionToken}
          onChange={(e) => onChange({ notionToken: e.target.value })}
          placeholder="secret_..."
          required
        />
        <Input
          label="Database ID"
          value={settings.notionDatabaseId}
          onChange={(e) => onChange({ notionDatabaseId: e.target.value })}
          placeholder="2d22bfe3ea0c81059ebef821673358c3"
          required
        />
        <p className="text-sm text-dark-500">
          Get your integration token from{' '}
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Notion Integrations
          </a>
        </p>
      </div>
    </Card>
  );
}
