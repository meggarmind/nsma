import type { Project } from '@/types';

export interface StatsOverviewProps {
  projects: Project[];
  onRefreshAll: () => void;
}

declare const StatsOverview: React.FC<StatsOverviewProps>;
export default StatsOverview;
