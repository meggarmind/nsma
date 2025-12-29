'use client';

import { useState } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  TrendingUp
} from 'lucide-react';
import Card from '../ui/Card';
import IssuesModal from './IssuesModal';
import { useStatus } from '@/hooks/useAppData';

/**
 * Sync Status Dashboard - shows daemon status, last sync details, and health metrics
 *
 * Uses centralized polling from useAppData instead of its own polling loop.
 */
export default function SyncStatusDashboard() {
  const { status, error, refresh } = useStatus();
  const [showIssuesModal, setShowIssuesModal] = useState(false);

  // Derive loading state from whether we have status data
  const loading = !status;

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatUptime = (timestamp) => {
    if (!timestamp) return null;
    const start = new Date(timestamp);
    const now = new Date();
    const diffMs = now - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return 'Just started';
  };

  if (loading) {
    return (
      <Card className="mb-8">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-dark-500 animate-spin" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-8">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>Failed to load sync status: {error}</span>
        </div>
      </Card>
    );
  }

  const { daemon, metrics, syncIntervalMinutes } = status;
  const lastSync = metrics?.lastSync;

  // Determine overall health
  const getHealthStatus = () => {
    if (!daemon.running) return { status: 'warning', label: 'Daemon Stopped' };
    if (metrics.errorsLast24h > 0 && metrics.successRate < 90) return { status: 'error', label: 'Issues Detected' };
    if (metrics.syncsLast24h === 0) return { status: 'warning', label: 'No Recent Syncs' };
    return { status: 'healthy', label: 'All Systems Go' };
  };

  const health = getHealthStatus();

  const healthColors = {
    healthy: 'bg-green-500/20 border-green-500/30 text-green-400',
    warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400'
  };

  const healthIcons = {
    healthy: CheckCircle,
    warning: AlertTriangle,
    error: XCircle
  };

  const HealthIcon = healthIcons[health.status];

  return (
    <Card className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/20 rounded-lg">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-dark-50">Sync Status</h2>
            <p className="text-sm text-dark-500">System health and recent activity</p>
          </div>
        </div>

        {/* Health Badge - clickable when issues detected */}
        {health.status === 'error' ? (
          <button
            onClick={() => setShowIssuesModal(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${healthColors[health.status]} hover:bg-red-500/30 transition-colors cursor-pointer`}
          >
            <HealthIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{health.label}</span>
          </button>
        ) : (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${healthColors[health.status]}`}>
            <HealthIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{health.label}</span>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Daemon Status */}
        <div className="p-4 bg-dark-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-dark-500" />
            <span className="text-sm text-dark-500">Daemon</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${daemon.running ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className={`font-semibold ${daemon.running ? 'text-green-400' : 'text-red-400'}`}>
              {daemon.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          {daemon.running && daemon.uptime && (
            <p className="text-xs text-dark-600 mt-1">
              Uptime: {formatUptime(daemon.uptime)}
            </p>
          )}
        </div>

        {/* Last Check & Last Sync */}
        <div className="p-4 bg-dark-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-dark-500" />
            <span className="text-sm text-dark-500">Last Check</span>
          </div>
          <p className="font-semibold text-dark-50">
            {formatRelativeTime(status.lastCheckAt)}
          </p>
          {lastSync?.timestamp && (
            <p className="text-xs text-dark-600 mt-1" title={`Items synced: ${lastSync.processed || 0}`}>
              Last activity: {formatRelativeTime(lastSync.timestamp)}
            </p>
          )}
        </div>

        {/* 24h Activity */}
        <div className="p-4 bg-dark-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-dark-500" />
            <span className="text-sm text-dark-500">24h Activity</span>
          </div>
          <p className="font-semibold text-dark-50">
            {metrics.syncsLast24h} syncs
          </p>
          <p className="text-xs text-dark-600 mt-1">
            {metrics.itemsLast24h} items total
          </p>
        </div>

        {/* Success Rate */}
        <div className="p-4 bg-dark-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-dark-500" />
            <span className="text-sm text-dark-500">Success Rate</span>
          </div>
          <p className={`font-semibold ${
            metrics.successRate >= 95 ? 'text-green-400' :
            metrics.successRate >= 80 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {metrics.successRate}%
          </p>
          {metrics.errorsLast24h > 0 && (
            <button
              onClick={() => setShowIssuesModal(true)}
              className="text-xs text-red-400 mt-1 hover:text-red-300 hover:underline cursor-pointer"
            >
              {metrics.errorsLast24h} errors
            </button>
          )}
        </div>
      </div>

      {/* Sync Interval Info */}
      <div className="flex items-center justify-between pt-4 border-t border-dark-700">
        <p className="text-sm text-dark-500">
          Auto-sync interval: <span className="text-dark-300">{syncIntervalMinutes} minutes</span>
        </p>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Issues Modal */}
      <IssuesModal
        isOpen={showIssuesModal}
        onClose={() => setShowIssuesModal(false)}
      />
    </Card>
  );
}
