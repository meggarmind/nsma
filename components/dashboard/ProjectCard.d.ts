import type { Project } from '@/types';

export interface ProjectCardProps {
  project: Project;
  onSync: (projectId: string) => void;
  onToggleActive: (projectId: string, active: boolean) => void;
  onRefreshStats: (projectId: string) => void;
  onReverseSync: (projectId: string) => void;
  syncing?: boolean;
  refreshing?: boolean;
  reverseSyncing?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: ((projectId: string) => void) | null;
}

declare const ProjectCard: React.FC<ProjectCardProps>;
export default ProjectCard;
