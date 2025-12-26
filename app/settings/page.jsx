'use client';

import { useEffect, useState } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import NotionConfig from '@/components/settings/NotionConfig';
import SyncConfig from '@/components/settings/SyncConfig';
import TemplateConfig from '@/components/settings/TemplateConfig';

export default function Settings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.notionToken || settings.notionToken.startsWith('••••')) {
      showToast('Please enter a Notion token', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to save settings', 'error');
        return;
      }

      showToast('Settings saved successfully', 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    }
  };

  const updateSettings = (updates) => {
    setSettings({ ...settings, ...updates });
  };

  if (loading) {
    return <div className="text-dark-500">Loading...</div>;
  }

  return (
    <>
      <Header
        title="Settings"
        description="Configure Notion integration and sync preferences"
        actions={
          <Button onClick={handleSave} className="flex items-center gap-2">
            <Save size={18} />
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
        }
      />

      {settings && !settings.notionToken && (
        <div className="glass rounded-xl p-4 mb-6 border-2 border-amber-500 bg-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-400 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-amber-200">Notion Integration Not Configured</p>
              <p className="text-sm text-amber-300 mt-1">
                Add your Notion integration token below to enable syncing.
                Sync operations will fail until configured.
              </p>
            </div>
          </div>
        </div>
      )}

      <NotionConfig
        settings={settings}
        onChange={updateSettings}
      />

      <SyncConfig
        settings={settings}
        onChange={updateSettings}
      />

      <TemplateConfig
        settings={settings}
        onChange={updateSettings}
      />
    </>
  );
}
