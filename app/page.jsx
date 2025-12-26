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
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

export default function Dashboard() {
  const { showToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState(new Set());
  const [lastSync, setLastSync] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', slug: '', promptsPath: '', active: true });

  useEffect(() => {
    loadProjects();
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

  const handleCreateProject = async () => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to create project', 'error');
        return;
      }

      showToast('Project created successfully', 'success');
      setShowNewProject(false);
      setNewProject({ name: '', slug: '', promptsPath: '', active: true });
      await loadProjects();
    } catch (error) {
      showToast(error.message || 'Network error', 'error');
    }
  };

  return (
    <>
      <Header
        title="Dashboard"
        description="Manage your projects and sync development prompts from Notion"
        actions={
          <Button onClick={() => setShowNewProject(true)} className="flex items-center gap-2">
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

      <StatsOverview projects={projects} />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create your first project to start syncing development prompts from Notion"
          action={
            <Button onClick={() => setShowNewProject(true)} className="flex items-center gap-2">
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
              onSync={handleSyncProject}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        title="New Project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewProject(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject}>
              Create Project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Project Name"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            placeholder="e.g., Residio"
            required
          />
          <Input
            label="Slug"
            value={newProject.slug}
            onChange={(e) => setNewProject({ ...newProject, slug: e.target.value })}
            placeholder="e.g., residio (must match Notion)"
            required
          />
          <Input
            label="Prompts Path"
            value={newProject.promptsPath}
            onChange={(e) => setNewProject({ ...newProject, promptsPath: e.target.value })}
            placeholder="/home/user/projects/MyProject/prompts"
            required
          />
        </div>
      </Modal>
    </>
  );
}
