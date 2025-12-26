'use client';

import Link from 'next/link';
import { FolderOpen, Pause, Play, RefreshCw, Calendar } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

export default function ProjectCard({ project, onSync, onToggleActive, syncing = false }) {
  const stats = project.stats || { pending: 0, processed: 0, archived: 0, deferred: 0 };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24)),
      'day'
    );
  };

  return (
    <Card hover className={`flex flex-col h-full ${syncing ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <Link href={`/projects/${project.id}`} className="flex items-center gap-3 flex-1">
          <div className="p-2 bg-accent/20 rounded-lg">
            <FolderOpen className="text-accent" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-dark-50 truncate">{project.name}</h3>
            <p className="text-sm text-dark-500 font-mono truncate">{project.slug}</p>
          </div>
        </Link>
        <Badge variant={project.active ? 'success' : 'warning'}>
          {project.active ? 'Active' : 'Paused'}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center p-3 bg-dark-900/50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-xs text-dark-500 mt-1">Pending</div>
        </div>
        <div className="text-center p-3 bg-dark-900/50 rounded-lg">
          <div className="text-2xl font-bold text-green-400">{stats.processed}</div>
          <div className="text-xs text-dark-500 mt-1">Done</div>
        </div>
        <div className="text-center p-3 bg-dark-900/50 rounded-lg">
          <div className="text-2xl font-bold text-orange-400">{stats.deferred}</div>
          <div className="text-xs text-dark-500 mt-1">Deferred</div>
        </div>
        <div className="text-center p-3 bg-dark-900/50 rounded-lg">
          <div className="text-2xl font-bold text-gray-400">{stats.archived}</div>
          <div className="text-xs text-dark-500 mt-1">Archived</div>
        </div>
      </div>

      {/* Last Sync */}
      <div className="flex items-center gap-2 text-sm text-dark-500 mb-4">
        <Calendar size={14} />
        <span>Last sync: {formatDate(project.lastSyncAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-4 border-t border-dark-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(project.id, !project.active)}
          disabled={syncing}
          className="flex items-center gap-2"
        >
          {project.active ? <Pause size={16} /> : <Play size={16} />}
          {project.active ? 'Pause' : 'Resume'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSync(project.id)}
          disabled={syncing}
          className="flex items-center gap-2 ml-auto"
        >
          {syncing ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>
    </Card>
  );
}
