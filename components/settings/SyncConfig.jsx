'use client';

import Card from '../ui/Card';
import Input from '../ui/Input';

export default function SyncConfig({ settings, onChange }) {
  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Sync Configuration</h3>
      <div className="space-y-4">
        <Input
          type="number"
          label="Sync Interval (minutes)"
          value={settings.syncIntervalMinutes}
          onChange={(e) => onChange({ syncIntervalMinutes: parseInt(e.target.value) })}
          placeholder="15"
          required
        />
        <p className="text-sm text-dark-500">
          How often the systemd daemon should sync projects
        </p>
      </div>
    </Card>
  );
}
