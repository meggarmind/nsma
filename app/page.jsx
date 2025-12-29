'use client';

import { useEffect, useState } from 'react';
import { FolderPlus, Search, CheckSquare, Square, RefreshCw, ArrowDown, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useSyncEvents } from '@/hooks/useSyncEvents';
import Header from '@/components/layout/Header';
import StatsOverview from '@/components/dashboard/StatsOverview';
import SyncBanner from '@/components/dashboard/SyncBanner';
import SyncStatusDashboard from '@/components/dashboard/SyncStatusDashboard';
import ProjectCard from '@/components/dashboard/ProjectCard';
import InboxCard from '@/components/dashboard/InboxCard';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import AddProjectWizard from '@/components/wizard/AddProjectWizard';

export default function Dashboard() {
  const { showToast } = useToast();

  // Enable background sync event detection with toast notifications
  // Polls faster (5s) when window is focused, slower (30s) when blurred
  useSyncEvents({ focusedInterval: 5000, blurredInterval: 30000 });

  const [projects, setProjects] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(new Set());
  const [refreshingProjects, setRefreshingProjects] = useState(new Set());
  const [reverseSyncingProjects, setReverseSyncingProjects] = useState(new Set());
  const [lastSync, setLastSync] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'paused'
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);

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

  // Selection handlers
  const handleToggleSelection = (projectId) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const visibleIds = filteredProjects.map(p => p.id);
    setSelectedProjects(new Set(visibleIds));
  };

  const handleClearSelection = () => {
    setSelectedProjects(new Set());
    setSelectionMode(false);
  };

  // Bulk operations
  const handleBulkSync = async () => {
    if (selectedProjects.size === 0) return;

    setBulkSyncing(true);
    const projectIds = Array.from(selectedProjects);

    try {
      // Sync all selected projects in parallel
      const results = await Promise.allSettled(
        projectIds.map(id =>
          fetch(`/api/sync/${id}`, { method: 'POST' }).then(r => r.json())
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
      const failed = results.length - succeeded;

      if (failed > 0) {
        showToast(`Synced ${succeeded} projects, ${failed} failed`, 'warning');
      } else {
        showToast(`Successfully synced ${succeeded} projects`, 'success');
      }

      await loadProjects();
      handleClearSelection();
    } catch (error) {
      showToast('Bulk sync failed', 'error');
    } finally {
      setBulkSyncing(false);
    }
  };

  const handleBulkRefresh = async () => {
    if (selectedProjects.size === 0) return;

    setBulkRefreshing(true);
    const projectIds = Array.from(selectedProjects);

    try {
      // Refresh all selected projects in parallel
      const results = await Promise.allSettled(
        projectIds.map(id =>
          fetch(`/api/projects/${id}/refresh`, { method: 'POST' }).then(r => r.json())
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
      showToast(`Refreshed stats for ${succeeded} projects`, 'success');

      await loadProjects();
      handleClearSelection();
    } catch (error) {
      showToast('Bulk refresh failed', 'error');
    } finally {
      setBulkRefreshing(false);
    }
  };

  // Filter and search projects
  const filteredProjects = projects.filter(project => {
    // Search filter
    const matchesSearch = searchQuery === '' ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.slug.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && project.active) ||
      (filterStatus === 'paused' && !project.active);

    return matchesSearch && matchesStatus;
  });

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

      <SyncStatusDashboard />

      <div className="mb-8">
        <InboxCard />
      </div>

      <StatsOverview projects={projects} onRefreshAll={handleRefreshAllStats} />

      {/* Bulk Action Bar - appears when projects are selected */}
      {selectionMode && selectedProjects.size > 0 && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-sm font-medium text-accent">
            {selectedProjects.size} project{selectedProjects.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkRefresh}
              disabled={bulkRefreshing || bulkSyncing}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} className={bulkRefreshing ? 'animate-spin' : ''} />
              {bulkRefreshing ? 'Refreshing...' : 'Refresh Stats'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkSync}
              disabled={bulkSyncing || bulkRefreshing}
              className="flex items-center gap-2"
            >
              <ArrowDown size={16} className={bulkSyncing ? 'animate-spin' : ''} />
              {bulkSyncing ? 'Syncing...' : 'Sync from Notion'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="flex items-center gap-2"
            >
              <X size={16} />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Search and Filter Bar */}
      {projects.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilterStatus(value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === value
                    ? 'bg-accent text-white'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Selection Mode Toggle */}
          <button
            onClick={() => {
              if (selectionMode) {
                handleClearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              selectionMode
                ? 'bg-accent text-white'
                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
            }`}
          >
            {selectionMode ? <CheckSquare size={16} /> : <Square size={16} />}
            {selectionMode ? 'Selecting' : 'Select'}
          </button>

          {/* Select All (only shown in selection mode) */}
          {selectionMode && filteredProjects.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 transition-colors"
            >
              Select All ({filteredProjects.length})
            </button>
          )}
        </div>
      )}

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
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description={searchQuery ? `No projects match "${searchQuery}"` : "No projects match the current filter"}
          action={
            <Button variant="secondary" onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
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
              selectionMode={selectionMode}
              selected={selectedProjects.has(project.id)}
              onSelect={handleToggleSelection}
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
