'use client';

import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import Header from '@/components/layout/Header';
import StatsOverview from '@/components/dashboard/StatsOverview';
import SyncBanner from '@/components/dashboard/SyncBanner';
import ProjectCard from '@/components/dashboard/ProjectCard';
import InboxCard from '@/components/dashboard/InboxCard';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import AddProjectWizard from '@/components/wizard/AddProjectWizard';

export default function Dashboard() {
  const { showToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(new Set());
  const [refreshingProjects, setRefreshingProjects] = useState(new Set());
  const [reverseSyncingProjects, setReverseSyncingProjects] = useState(new Set());
  const [lastSync, setLastSync] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadProjects();
    const interval = setInterval(loadProjects, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadProjects = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data);

    // Get last sync from most recent project
    const sorted = data.sort((a, b) => new Date(b.lastSyncAt) - new Date(a.lastSyncAt));
    if (sorted[0]?.lastSyncAt) {
      setLastSync(sorted[0].lastSyncAt);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Sync failed', 'error');
        return;
      }

      const total = data.results?.reduce((sum, r) => sum + r.processed, 0) || 0;
      showToast(`Sync complete! Processed ${total} items`, 'success');
      setLastSync(new Date().toISOString());
      await loadProjects();
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncProject = async (projectId) => {
    setSyncingProjects(prev => new Set(prev).add(projectId));
    try {
      const res = await fetch(`/api/sync/${projectId}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Sync failed', 'error');
        return;
      }

      showToast('Project synced successfully', 'success');
      await loadProjects();
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    } finally {
      setSyncingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleToggleActive = async (projectId, active) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      await loadProjects();
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  const handleRefreshStats = async (projectId) => {
    setRefreshingProjects(prev => new Set(prev).add(projectId));
    try {
      const res = await fetch(`/api/projects/${projectId}/refresh`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Refresh failed', 'error');
        return;
      }

      showToast('Stats refreshed from disk', 'success');
      await loadProjects();
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    } finally {
      setRefreshingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleRefreshAllStats = async () => {
    try {
      const res = await fetch('/api/projects?refresh=true');
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Refresh failed', 'error');
        return;
      }

      setProjects(data);
      showToast('All stats refreshed from disk', 'success');
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    }
  };

  const handleReverseSync = async (projectId) => {
    setReverseSyncingProjects(prev => new Set(prev).add(projectId));
    try {
      const res = await fetch(`/api/projects/${projectId}/reverse-sync`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Reverse sync failed', 'error');
        return;
      }

      const { updated, failed } = data.result;
      if (updated > 0) {
        showToast(`Synced ${updated} file(s) to Notion`, 'success');
      } else if (failed > 0) {
        showToast(`Reverse sync: ${failed} failed`, 'warning');
      } else {
        showToast('No files needed syncing', 'info');
      }

      await loadProjects();
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    } finally {
      setReverseSyncingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleWizardSuccess = async () => {
    showToast('Project created successfully', 'success');
    await loadProjects();
  };

  return (
    <>
      <Header
        title="Dashboard"
        description="Manage your projects and sync development prompts from Notion"
        actions={
          <Button onClick={() => setShowWizard(true)} className="flex items-center gap-2">
            <FolderPlus size={18} />
            New Project
          </Button>
        }
      />

      <SyncBanner
        syncing={syncing}
        lastSync={lastSync}
        onSync={handleSyncAll}
      />

      <div className="mb-8">
        <InboxCard />
      </div>

      <StatsOverview projects={projects} onRefreshAll={handleRefreshAllStats} />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create your first project to start syncing development prompts from Notion"
          action={
            <Button onClick={() => setShowWizard(true)} className="flex items-center gap-2">
              <FolderPlus size={18} />
              Create First Project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              syncing={syncingProjects.has(project.id)}
              refreshing={refreshingProjects.has(project.id)}
              reverseSyncing={reverseSyncingProjects.has(project.id)}
              onSync={handleSyncProject}
              onToggleActive={handleToggleActive}
              onRefreshStats={handleRefreshStats}
              onReverseSync={handleReverseSync}
            />
          ))}
        </div>
      )}

      <AddProjectWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={handleWizardSuccess}
      />
    </>
  );
}
