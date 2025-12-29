'use client';

import type { Project } from '@/types';
import ProjectCard from '@/components/dashboard/ProjectCard';

export interface ProjectCardGridProps {
  /** List of projects to display */
  projects: Project[];
  /** Set of project IDs currently syncing */
  syncingProjects: Set<string>;
  /** Set of project IDs currently refreshing */
  refreshingProjects: Set<string>;
  /** Set of project IDs currently reverse syncing */
  reverseSyncingProjects: Set<string>;
  /** Whether selection mode is active */
  selectionMode: boolean;
  /** Set of selected project IDs */
  selectedProjects: Set<string>;
  /** Called when sync is triggered for a project */
  onSync: (projectId: string) => void;
  /** Called when project active state is toggled */
  onToggleActive: (projectId: string, active: boolean) => void;
  /** Called when stats refresh is triggered */
  onRefreshStats: (projectId: string) => void;
  /** Called when reverse sync is triggered */
  onReverseSync: (projectId: string) => void;
  /** Called when project selection is toggled */
  onToggleSelection: (projectId: string) => void;
}

export default function ProjectCardGrid({
  projects,
  syncingProjects,
  refreshingProjects,
  reverseSyncingProjects,
  selectionMode,
  selectedProjects,
  onSync,
  onToggleActive,
  onRefreshStats,
  onReverseSync,
  onToggleSelection
}: ProjectCardGridProps) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      role="list"
      aria-label="Projects"
    >
      {projects.map((project) => (
        <div key={project.id} role="listitem">
          <ProjectCard
            project={project}
            syncing={syncingProjects.has(project.id)}
            refreshing={refreshingProjects.has(project.id)}
            reverseSyncing={reverseSyncingProjects.has(project.id)}
            onSync={onSync}
            onToggleActive={onToggleActive}
            onRefreshStats={onRefreshStats}
            onReverseSync={onReverseSync}
            selectionMode={selectionMode}
            selected={selectedProjects.has(project.id)}
            onSelect={selectionMode ? onToggleSelection : undefined}
          />
        </div>
      ))}
    </div>
  );
}
