'use client';

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

export default function NotionConfig({ settings, onChange }) {
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDatabaseId, setPendingDatabaseId] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Get the display name for current database
  const currentDatabaseName = databases.find(db => db.id === settings.notionDatabaseId)?.title
    || (settings.notionDatabaseId ? `Database: ${settings.notionDatabaseId.slice(0, 8)}...` : 'Not selected');

  // Fetch databases when entering edit mode
  const handleEdit = async () => {
    setIsEditing(true);
    setError(null);
    setShowManualInput(false);
    setPendingDatabaseId(settings.notionDatabaseId || '');
    await fetchDatabases();
  };

  const fetchDatabases = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/settings/notion-databases');
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setDatabases([]);
      } else {
        setDatabases(data.databases || []);
        if (data.databases?.length === 0) {
          setError('No databases found. Make sure you\'ve shared at least one database with your integration.');
        }
      }
    } catch (err) {
      setError('Failed to fetch databases. Please try again.');
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setPendingDatabaseId('');
    setShowManualInput(false);
  };

  const handleSave = () => {
    onChange({ notionDatabaseId: pendingDatabaseId });
    setIsEditing(false);
    setError(null);
    setShowManualInput(false);
  };

  const handleManualToggle = () => {
    setShowManualInput(true);
    setError(null);
  };

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

        {/* Database Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-dark-200">
            Notion Database
            <span className="text-red-400 ml-1">*</span>
          </label>

          {!isEditing ? (
            // Locked view - show current selection with Edit button
            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50">
                {settings.notionDatabaseId ? (
                  <span>{currentDatabaseName}</span>
                ) : (
                  <span className="text-dark-500">No database selected</span>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEdit}
                disabled={!settings.notionToken || settings.notionToken.startsWith('••••')}
              >
                Edit
              </Button>
            </div>
          ) : (
            // Editing view
            <div className="space-y-3">
              {loading ? (
                // Loading state
                <div className="flex items-center gap-3 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg">
                  <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-dark-400">Fetching databases...</span>
                </div>
              ) : error && !showManualInput ? (
                // Error state with manual fallback option
                <div className="space-y-2">
                  <div className="px-4 py-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualToggle}
                  >
                    Enter Database ID manually
                  </Button>
                </div>
              ) : showManualInput ? (
                // Manual input fallback
                <Input
                  value={pendingDatabaseId}
                  onChange={(e) => setPendingDatabaseId(e.target.value)}
                  placeholder="Paste database ID from URL"
                />
              ) : (
                // Dropdown with databases
                <Select
                  value={pendingDatabaseId}
                  onChange={(e) => setPendingDatabaseId(e.target.value)}
                  options={databases.map(db => ({
                    value: db.id,
                    label: `${db.title} (${db.id})`
                  }))}
                  placeholder="Select a database..."
                />
              )}

              {/* Action buttons */}
              {!loading && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={!pendingDatabaseId}
                  >
                    Save
                  </Button>
                  {!showManualInput && databases.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchDatabases}
                      className="ml-auto"
                    >
                      Refresh
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Help text */}
          {!isEditing && !settings.notionToken && (
            <p className="text-sm text-dark-500">
              Add your Notion token first to select a database
            </p>
          )}
          {!isEditing && settings.notionToken?.startsWith('••••') && (
            <p className="text-sm text-dark-500">
              Re-enter your Notion token above to edit the database selection
            </p>
          )}
        </div>

        {/* Project Slugs Page Link */}
        {settings.projectSlugsPageId && (
          <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-lg">
            <ExternalLink size={16} className="text-accent" />
            <span className="text-sm text-dark-300">Project Slugs Reference:</span>
            <a
              href={`https://notion.so/${settings.projectSlugsPageId.replace(/-/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline"
            >
              View in Notion
            </a>
          </div>
        )}

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
