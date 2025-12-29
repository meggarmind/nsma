'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Save, AlertCircle, RefreshCw, Database, Clock, FileText, Zap, Key, ChevronRight, Server } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import NotionConfig from '@/components/settings/NotionConfig';
import SyncConfig from '@/components/settings/SyncConfig';
import TemplateConfig from '@/components/settings/TemplateConfig';
import AIConfig from '@/components/settings/AIConfig';
import DeploymentConfig from '@/components/settings/DeploymentConfig';

// Tab configuration
const TABS = [
  { id: 'notion', label: 'Notion', icon: Database, description: 'API token & database' },
  { id: 'sync', label: 'Sync', icon: Clock, description: 'Intervals & automation' },
  { id: 'templates', label: 'Templates', icon: FileText, description: 'Prompt templates' },
  { id: 'ai', label: 'AI', icon: Zap, description: 'AI expansion settings' },
  { id: 'advanced', label: 'Advanced', icon: Key, description: 'Registration & tools' },
  { id: 'deployment', label: 'Deployment', icon: Server, description: 'Updates & services' }
];

// Inner component that uses useSearchParams
function SettingsContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // URL-based active tab
  const activeTab = searchParams.get('tab') || 'notion';

  const setActiveTab = (tabId) => {
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  };

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

    setSaving(true);
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
    } finally {
      setSaving(false);
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

  // Render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'notion':
        return (
          <>
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
            <NotionConfig settings={settings} onChange={updateSettings} />
          </>
        );

      case 'sync':
        return <SyncConfig settings={settings} onChange={updateSettings} />;

      case 'templates':
        return <TemplateConfig settings={settings} onChange={updateSettings} />;

      case 'ai':
        return <AIConfig settings={settings} onChange={updateSettings} />;

      case 'advanced':
        return (
          <>
            {/* Sync Projects to Notion */}
            <div className="glass rounded-xl p-6 border border-dark-700 mb-6">
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

            {/* Registration Token */}
            <div className="glass rounded-xl p-6 border border-dark-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                Registration Token
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Token required for projects to self-register via API.
                Used in initialization scripts.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.registrationToken || ''}
                  onChange={(e) => updateSettings({ registrationToken: e.target.value })}
                  placeholder="Enter registration token"
                  className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const token = crypto.randomUUID();
                    updateSettings({ registrationToken: token });
                    navigator.clipboard.writeText(token);
                    showToast('Token generated and copied to clipboard', 'success');
                  }}
                >
                  Generate
                </Button>
              </div>

              {settings.registrationToken && (
                <div className="mt-3 p-3 bg-dark-800 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Example registration command:</p>
                  <code className="text-xs text-green-400 block whitespace-pre-wrap">
                    {`curl -X POST http://localhost:3100/api/projects/register \\
  -H "Authorization: Bearer ${settings.registrationToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"My Project","slug":"my-project","promptsPath":"/path/to/prompts"}'`}
                  </code>
                </div>
              )}
            </div>
          </>
        );

      case 'deployment':
        return <DeploymentConfig settings={settings} />;

      default:
        return null;
    }
  };

  return (
    <>
      <Header
        title="Settings"
        description="Configure Notion integration and sync preferences"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24 space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-white shadow-lg shadow-accent/20'
                      : 'text-dark-400 hover:bg-dark-800 hover:text-dark-200'
                  }`}
                >
                  <Icon size={20} className={isActive ? 'text-white' : ''} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{tab.label}</div>
                    <div className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-dark-500'}`}>
                      {tab.description}
                    </div>
                  </div>
                  {isActive && <ChevronRight size={16} className="text-white/50" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mobile Tab Bar */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'bg-dark-800 text-dark-400 hover:text-dark-200'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {renderTabContent()}

          {/* Sticky Save Button */}
          <div className="sticky bottom-4 mt-6 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 shadow-lg shadow-accent/20"
            >
              {saving ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  {saved ? 'Saved!' : 'Save Settings'}
                </>
              )}
            </Button>
          </div>
        </main>
      </div>
    </>
  );
}

// Main component with Suspense boundary for useSearchParams
export default function Settings() {
  return (
    <Suspense fallback={<div className="text-dark-500">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
