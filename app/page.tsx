'use client';

import { useState, useMemo, useCallback } from 'react';
import { FolderPlus, Search } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useSyncEvents } from '@/hooks/useSyncEvents';
import { useProjects, useAppData } from '@/hooks/useAppData';
import Header from '@/components/layout/Header';
import StatsOverview from '@/components/dashboard/StatsOverview';
import SyncBanner from '@/components/dashboard/SyncBanner';
import SyncStatusDashboard from '@/components/dashboard/SyncStatusDashboard';
import InboxCard from '@/components/dashboard/InboxCard';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import AddProjectWizard from '@/components/wizard/AddProjectWizard';

// Dashboard-specific components
import BulkActionBar from './_components/BulkActionBar';
import ProjectListControls, { type FilterStatus } from './_components/ProjectListControls';
import ProjectCardGrid from './_components/ProjectCardGrid';

import type { Project } from '@/types';

/**
 * Main Dashboard page
 *
 * Uses centralized polling from useAppData for projects list.
 * Polling is handled by the provider - no local setInterval needed.
 */
export default function Dashboard() {
  const { showToast } = useToast();

  // Use centralized data - no more local polling
  const { projects, refresh: refreshProjects } = useProjects();
  const { refreshAll } = useAppData();

  // Enable background sync event detection with toast notifications
  useSyncEvents();

  // Global sync state
  const [syncing, setSyncing] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Per-project loading states
  const [syncingProjects, setSyncingProjects] = useState<Set<string>>(new Set());
  const [refreshingProjects, setRefreshingProjects] = useState<Set<string>>(new Set());
  const [reverseSyncingProjects, setReverseSyncingProjects] = useState<Set<string>>(new Set());

  // Filter and selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);

  // Derive lastSync from projects (most recent)
  const lastSync = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    const sorted = [...projects].sort(
      (a, b) => new Date(b.lastSync || 0).getTime() - new Date(a.lastSync || 0).getTime()
    );
    return sorted[0]?.lastSync || null;
  }, [projects]);

  // Filter and search projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project: Project) => {
      const matchesSearch =
        searchQuery === '' ||
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.slug.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && project.active) ||
        (filterStatus === 'paused' && !project.active);

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, filterStatus]);

  // =============================================================================
  // Sync Handlers
  // =============================================================================

  const handleSyncAll = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Sync failed', 'error');
        return;
      }

      const total = data.results?.reduce((sum: number, r: { processed: number }) => sum + r.processed, 0) || 0;
      showToast(`Sync complete! Processed ${total} items`, 'success');
      await refreshProjects();
    } catch (error) {
      showToast((error as Error).message || 'Network error', 'error');
    } finally {
      setSyncing(false);
    }
  }, [showToast, refreshProjects]);

  const handleSyncProject = useCallback(async (projectId: string) => {
    setSyncingProjects((prev) => new Set(prev).add(projectId));
    try {
      const res = await fetch(`/api/sync/${projectId}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Sync failed', 'error');
        return;
      }

      showToast('Project synced successfully', 'success');
      await refreshProjects();
    } catch (error) {
      showToast((error as Error).message || 'Network error', 'error');
    } finally {
      setSyncingProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [showToast, refreshProjects]);

  const handleToggleActive = useCallback(async (projectId: string, active: boolean) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      await refreshProjects();
    } catch (error) {
      console.error('Update failed:', error);
    }
  }, [refreshProjects]);

  const handleRefreshStats = useCallback(async (projectId: string) => {
    setRefreshingProjects((prev) => new Set(prev).add(projectId));
    try {
      const res = await fetch(`/api/projects/${projectId}/refresh`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Refresh failed', 'error');
        return;
      }

      showToast('Stats refreshed from disk', 'success');
      await refreshProjects();
    } catch (error) {
      showToast((error as Error).message || 'Network error', 'error');
    } finally {
      setRefreshingProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [showToast, refreshProjects]);

  const handleRefreshAllStats = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?refresh=true');
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Refresh failed', 'error');
        return;
      }

      await refreshProjects();
      showToast('All stats refreshed from disk', 'success');
    } catch (error) {
      showToast((error as Error).message || 'Network error', 'error');
    }
  }, [showToast, refreshProjects]);

  const handleReverseSync = useCallback(async (projectId: string) => {
    setReverseSyncingProjects((prev) => new Set(prev).add(projectId));
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

      await refreshProjects();
    } catch (error) {
      showToast((error as Error).message || 'Network error', 'error');
    } finally {
      setReverseSyncingProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [showToast, refreshProjects]);

  const handleWizardSuccess = useCallback(async () => {
    showToast('Project created successfully', 'success');
    await refreshProjects();
  }, [showToast, refreshProjects]);

  // =============================================================================
  // Selection Handlers
  // =============================================================================

  const handleToggleSelection = useCallback((projectId: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const visibleIds = filteredProjects.map((p: Project) => p.id);
    setSelectedProjects(new Set(visibleIds));
  }, [filteredProjects]);

  const handleClearSelection = useCallback(() => {
    setSelectedProjects(new Set());
    setSelectionMode(false);
  }, []);

  const handleSelectionModeToggle = useCallback(() => {
    if (selectionMode) {
      handleClearSelection();
    } else {
      setSelectionMode(true);
    }
  }, [selectionMode, handleClearSelection]);

  // =============================================================================
  // Bulk Operations
  // =============================================================================

  const handleBulkSync = useCallback(async () => {
    if (selectedProjects.size === 0) return;

    setBulkSyncing(true);
    const projectIds = Array.from(selectedProjects);

    try {
      const results = await Promise.allSettled(
        projectIds.map((id) =>
          fetch(`/api/sync/${id}`, { method: 'POST' }).then((r) => r.json())
        )
      );

      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && !(r.value as { error?: string }).error
      ).length;
      const failed = results.length - succeeded;

      if (failed > 0) {
        showToast(`Synced ${succeeded} projects, ${failed} failed`, 'warning');
      } else {
        showToast(`Successfully synced ${succeeded} projects`, 'success');
      }

      await refreshProjects();
      handleClearSelection();
    } catch {
      showToast('Bulk sync failed', 'error');
    } finally {
      setBulkSyncing(false);
    }
  }, [selectedProjects, showToast, refreshProjects, handleClearSelection]);

  const handleBulkRefresh = useCallback(async () => {
    if (selectedProjects.size === 0) return;

    setBulkRefreshing(true);
    const projectIds = Array.from(selectedProjects);

    try {
      const results = await Promise.allSettled(
        projectIds.map((id) =>
          fetch(`/api/projects/${id}/refresh`, { method: 'POST' }).then((r) => r.json())
        )
      );

      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && !(r.value as { error?: string }).error
      ).length;
      showToast(`Refreshed stats for ${succeeded} projects`, 'success');

      await refreshProjects();
      handleClearSelection();
    } catch {
      showToast('Bulk refresh failed', 'error');
    } finally {
      setBulkRefreshing(false);
    }
  }, [selectedProjects, showToast, refreshProjects, handleClearSelection]);

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <>
      <Header
        title="Dashboard"
        description="Manage your projects and sync development prompts from Notion"
        actions={
          <Button onClick={() => setShowWizard(true)} className="flex items-center gap-2">
            <FolderPlus size={18} aria-hidden="true" />
            New Project
          </Button>
        }
      />

      <SyncBanner syncing={syncing} lastSync={lastSync} onSync={handleSyncAll} />

      <SyncStatusDashboard />

      <div className="mb-8">
        <InboxCard />
      </div>

      <StatsOverview projects={projects} onRefreshAll={handleRefreshAllStats} />

      {/* Bulk Action Bar - appears when projects are selected */}
      {selectionMode && (
        <BulkActionBar
          selectedCount={selectedProjects.size}
          bulkSyncing={bulkSyncing}
          bulkRefreshing={bulkRefreshing}
          onBulkSync={handleBulkSync}
          onBulkRefresh={handleBulkRefresh}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Search and Filter Bar */}
      {projects.length > 0 && (
        <ProjectListControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          selectionMode={selectionMode}
          onSelectionModeToggle={handleSelectionModeToggle}
          filteredCount={filteredProjects.length}
          onSelectAll={handleSelectAll}
        />
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create your first project to start syncing development prompts from Notion"
          action={
            <Button onClick={() => setShowWizard(true)} className="flex items-center gap-2">
              <FolderPlus size={18} aria-hidden="true" />
              Create First Project
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description={
            searchQuery
              ? `No projects match "${searchQuery}"`
              : 'No projects match the current filter'
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('all');
              }}
            >
              Clear Filters
            </Button>
          }
        />
      ) : (
        <ProjectCardGrid
          projects={filteredProjects}
          syncingProjects={syncingProjects}
          refreshingProjects={refreshingProjects}
          reverseSyncingProjects={reverseSyncingProjects}
          selectionMode={selectionMode}
          selectedProjects={selectedProjects}
          onSync={handleSyncProject}
          onToggleActive={handleToggleActive}
          onRefreshStats={handleRefreshStats}
          onReverseSync={handleReverseSync}
          onToggleSelection={handleToggleSelection}
        />
      )}

      <AddProjectWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={handleWizardSuccess}
      />
    </>
  );
}
