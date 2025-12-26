'use client';

import { FolderOpen, FileText, CheckCircle, Clock } from 'lucide-react';
import Card from '../ui/Card';

export default function StatsOverview({ projects = [] }) {
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.active).length;

  const totalStats = projects.reduce(
    (acc, project) => {
      const stats = project.stats || {};
      return {
        pending: acc.pending + (stats.pending || 0),
        processed: acc.processed + (stats.processed || 0),
        deferred: acc.deferred + (stats.deferred || 0),
        archived: acc.archived + (stats.archived || 0),
      };
    },
    { pending: 0, processed: 0, deferred: 0, archived: 0 }
  );

  const stats = [
    {
      label: 'Active Projects',
      value: `${activeProjects}/${totalProjects}`,
      icon: FolderOpen,
      color: 'text-accent'
    },
    {
      label: 'Pending Prompts',
      value: totalStats.pending,
      icon: Clock,
      color: 'text-yellow-400'
    },
    {
      label: 'Completed',
      value: totalStats.processed,
      icon: CheckCircle,
      color: 'text-green-400'
    },
    {
      label: 'Total Prompts',
      value: totalStats.pending + totalStats.processed + totalStats.deferred + totalStats.archived,
      icon: FileText,
      color: 'text-blue-400'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <Card key={index}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-dark-500 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-dark-50">{stat.value}</p>
            </div>
            <div className={`p-3 bg-dark-900/50 rounded-lg ${stat.color}`}>
              <stat.icon size={24} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
