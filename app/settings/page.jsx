'use client';

import { useEffect, useState } from 'react';
import { Save, AlertCircle, RefreshCw } from 'lucide-react';
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
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

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

  const handleSyncProjects = async () => {
    setSyncingProjects(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/settings/sync-projects', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setSyncResult({ type: 'success', message: data.message });
        showToast(data.message, 'success');
      } else {
        setSyncResult({ type: 'error', message: data.error });
        showToast(data.error, 'error');
      }
    } catch (error) {
      setSyncResult({ type: 'error', message: 'Failed to sync projects' });
      showToast('Failed to sync projects', 'error');
    } finally {
      setSyncingProjects(false);
    }
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

      <div className="glass rounded-xl p-6 border border-dark-700 mt-6">
        <h3 className="text-lg font-semibold text-white mb-2">Sync Projects to Notion</h3>
        <p className="text-sm text-gray-400 mb-4">
          Manually sync all project slugs to the Notion database's Project dropdown.
          This happens automatically when you add or rename projects.
        </p>

        <button
          onClick={handleSyncProjects}
          disabled={syncingProjects}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark disabled:bg-dark-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {syncingProjects ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Sync Projects to Notion
            </>
          )}
        </button>

        {syncResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            syncResult.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {syncResult.message}
          </div>
        )}
      </div>
    </>
  );
}
