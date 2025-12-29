'use client';

import Link from 'next/link';
import { FolderOpen, Pause, Play, RefreshCw, Calendar, ArrowUp, ArrowDown, Check } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

export default function ProjectCard({
  project,
  onSync,
  onToggleActive,
  onRefreshStats,
  onReverseSync,
  syncing = false,
  refreshing = false,
  reverseSyncing = false,
  selectionMode = false,
  selected = false,
  onSelect = null
}) {
  const stats = project.stats || { pending: 0, processed: 0, archived: 0, deferred: 0 };
  const lastSync = project.lastSync || null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const diffMs = date - new Date();
    const diffMins = Math.round(diffMs / (1000 * 60));

    if (diffMins > -60) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(diffMins, 'minute');
    }
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil(diffMs / (1000 * 60 * 60 * 24)),
      'day'
    );
  };

  return (
    <Card hover className={`flex flex-col h-full ${syncing ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-accent' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        {/* Selection Checkbox */}
        {selectionMode && onSelect && (
          <button
            onClick={() => onSelect(project.id)}
            className={`mr-3 mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? 'bg-accent border-accent text-white'
                : 'border-dark-500 hover:border-accent'
            }`}
          >
            {selected && <Check size={14} />}
          </button>
        )}
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

      {/* Sync Info */}
      <div className="space-y-2 text-sm text-dark-500 mb-4">
        {/* Forward Sync (Notion → Files) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDown size={14} className="text-blue-400" />
            <span>From Notion: {formatDate(project.lastSyncAt)}</span>
            {lastSync && lastSync.imported > 0 && (
              <Badge variant="info" className="text-xs">
                +{lastSync.imported}
              </Badge>
            )}
          </div>
          {onRefreshStats && (
            <button
              onClick={() => onRefreshStats(project.id)}
              disabled={refreshing}
              className="p-1 hover:bg-dark-700 rounded transition-colors"
              title="Refresh stats from disk"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        {/* Reverse Sync (Files → Notion) */}
        <div className="flex items-center gap-2">
          <ArrowUp size={14} className="text-green-400" />
          <span>To Notion: {formatDate(project.lastReverseSync?.timestamp)}</span>
          {project.lastReverseSync?.updated > 0 && (
            <Badge variant="success" className="text-xs">
              {project.lastReverseSync.updated} updated
            </Badge>
          )}
          {project.lastReverseSync?.failed > 0 && (
            <Badge variant="error" className="text-xs">
              {project.lastReverseSync.failed} failed
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-4 border-t border-dark-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(project.id, !project.active)}
          disabled={syncing || reverseSyncing}
          className="flex items-center gap-2"
        >
          {project.active ? <Pause size={16} /> : <Play size={16} />}
          {project.active ? 'Pause' : 'Resume'}
        </Button>

        {/* Reverse Sync Button (Files → Notion) */}
        {onReverseSync && project.reverseSyncEnabled !== false && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReverseSync(project.id)}
            disabled={syncing || reverseSyncing}
            className="flex items-center gap-2"
            title="Sync local file statuses to Notion"
          >
            {reverseSyncing ? (
              <ArrowUp size={16} className="animate-pulse" />
            ) : (
              <ArrowUp size={16} />
            )}
            {reverseSyncing ? 'Syncing...' : 'To Notion'}
          </Button>
        )}

        {/* Forward Sync Button (Notion → Files) */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSync(project.id)}
          disabled={syncing || reverseSyncing}
          className="flex items-center gap-2 ml-auto"
        >
          {syncing ? (
            <ArrowDown size={16} className="animate-spin" />
          ) : (
            <ArrowDown size={16} />
          )}
          {syncing ? 'Syncing...' : 'From Notion'}
        </Button>
      </div>
    </Card>
  );
}
