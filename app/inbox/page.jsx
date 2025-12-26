'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  RefreshCw,
  ChevronLeft,
  AlertCircle
} from 'lucide-react';
import InboxList from '@/components/inbox/InboxList';

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [inboxRes, projectsRes] = await Promise.all([
        fetch('/api/inbox'),
        fetch('/api/projects')
      ]);

      if (inboxRes.ok) {
        const inboxData = await inboxRes.json();
        setItems(inboxData.items || []);
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData || []);
      }
    } catch (err) {
      setError('Failed to load inbox data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleAssign = async (itemId, projectId) => {
    const res = await fetch(`/api/inbox/${itemId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to assign item');
    }

    // Remove item from list
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-dark-900/80 backdrop-blur-lg border-b border-dark-800">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Inbox className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">Inbox</h1>
                  <p className="text-sm text-gray-400">
                    {items.length} item{items.length !== 1 ? 's' : ''} awaiting assignment
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Info banner */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-amber-200 font-medium">Items need project assignment</p>
            <p className="text-amber-200/70 mt-1">
              These items were captured in Notion without a valid project, or their project no longer exists in NSMA.
              Assign them to a project to move them to the project's prompts folder.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <InboxList
            items={items}
            projects={projects}
            onAssign={handleAssign}
            onRefresh={fetchData}
          />
        )}
      </main>
    </div>
  );
}
