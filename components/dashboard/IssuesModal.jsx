'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  FileWarning,
  ShieldAlert,
  WifiOff,
  Database
} from 'lucide-react';
import Modal from '../ui/Modal';

// Troubleshooting recommendations based on error patterns
const TROUBLESHOOTING = {
  permission: {
    icon: ShieldAlert,
    title: 'Permission Denied',
    hint: 'Check file permissions and ensure NSMA has write access to the project folder.',
    actions: ['Verify folder permissions', 'Check Notion token validity']
  },
  rate_limit: {
    icon: Clock,
    title: 'API Rate Limited',
    hint: 'Notion API rate limit reached. Wait a few minutes before retrying.',
    actions: ['Wait 1-2 minutes', 'Consider reducing sync frequency']
  },
  not_found: {
    icon: FileWarning,
    title: 'Resource Not Found',
    hint: 'The file or Notion page no longer exists.',
    actions: ['Verify project paths', 'Check if Notion page was deleted']
  },
  network: {
    icon: WifiOff,
    title: 'Network Error',
    hint: 'Connection to Notion API failed.',
    actions: ['Check internet connection', 'Verify Notion service status']
  },
  parse: {
    icon: Database,
    title: 'Parse Error',
    hint: 'Failed to parse file or response data.',
    actions: ['Check file format and syntax', 'Verify YAML frontmatter']
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Unknown Error',
    hint: 'An unexpected error occurred.',
    actions: ['Check logs for details', 'Try manual sync']
  }
};

function getErrorCategory(error) {
  const msg = (error.message || error.error || '').toLowerCase();

  if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('403') || msg.includes('401')) {
    return 'permission';
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
    return 'rate_limit';
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('enoent')) {
    return 'not_found';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('connection')) {
    return 'network';
  }
  if (msg.includes('parse') || msg.includes('syntax') || msg.includes('json') || msg.includes('yaml')) {
    return 'parse';
  }
  return 'unknown';
}

function groupErrors(logs) {
  const groups = {};

  for (const log of logs) {
    const key = log.projectName || 'Unknown Project';
    if (!groups[key]) {
      groups[key] = {
        projectName: key,
        projectId: log.projectId,
        errors: [],
        operations: new Set()
      };
    }
    groups[key].errors.push(log);
    groups[key].operations.add(log.operation);
  }

  return Object.values(groups).sort((a, b) => b.errors.length - a.errors.length);
}

function ErrorCard({ log }) {
  const [expanded, setExpanded] = useState(false);
  const category = getErrorCategory(log);
  const troubleshoot = TROUBLESHOOTING[category];
  const TroubleIcon = troubleshoot.icon;

  const timestamp = new Date(log.timestamp);
  const timeAgo = getTimeAgo(timestamp);

  return (
    <div className="p-3 bg-dark-800/50 rounded-lg border border-dark-700">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-1.5 bg-red-500/20 rounded">
          <TroubleIcon className="w-4 h-4 text-red-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-dark-100 font-medium truncate">
            {log.message || troubleshoot.title}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dark-500">
            <span className="px-1.5 py-0.5 bg-dark-700 rounded">{log.operation}</span>
            <span>{timeAgo}</span>
          </div>
        </div>

        <button className="p-1 text-dark-400 hover:text-dark-200">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* Error details */}
          {log.details && (
            <div className="p-2 bg-red-500/10 rounded text-xs font-mono text-red-300 overflow-x-auto">
              {log.details.message || JSON.stringify(log.details, null, 2)}
            </div>
          )}

          {/* Item errors */}
          {Array.isArray(log.errors) && log.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-dark-400 font-medium">Failed items:</p>
              {log.errors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-xs text-dark-300 pl-2">
                  • {err.file || err.item || 'Unknown'}: {err.error}
                </p>
              ))}
              {log.errors.length > 5 && (
                <p className="text-xs text-dark-500 pl-2">+ {log.errors.length - 5} more</p>
              )}
            </div>
          )}

          {/* Troubleshooting hint */}
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded">
            <p className="text-xs text-amber-300 font-medium mb-1">Troubleshooting:</p>
            <p className="text-xs text-amber-200/70">{troubleshoot.hint}</p>
            <ul className="mt-2 space-y-0.5">
              {troubleshoot.actions.map((action, i) => (
                <li key={i} className="text-xs text-amber-200/60 flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-amber-400 rounded-full" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectErrorGroup({ group, onRetry, retrying }) {
  const [expanded, setExpanded] = useState(true);
  const hasReverseSyncErrors = group.operations.has('reverse-sync');

  return (
    <div className="border border-dark-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-dark-800/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <button className="p-1 text-dark-400 hover:text-dark-200">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div>
            <p className="text-sm font-medium text-dark-100">{group.projectName}</p>
            <p className="text-xs text-dark-500">
              {group.errors.length} error{group.errors.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {hasReverseSyncErrors && group.projectId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry(group.projectId);
            }}
            disabled={retrying === group.projectId}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded disabled:opacity-50 transition-colors"
          >
            {retrying === group.projectId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Retry
          </button>
        )}
      </div>

      {expanded && (
        <div className="p-3 space-y-2 bg-dark-900/50">
          {group.errors.map((log, i) => (
            <ErrorCard key={i} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function IssuesModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [page, setPage] = useState(1);
  const [retrySuccess, setRetrySuccess] = useState(null);
  const pageSize = 20;

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/logs?level=warn&limit=100');
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      // Filter for actual errors (warn and error levels only)
      const errorLogs = (data.logs || []).filter(log =>
        log.level === 'warn' || log.level === 'error'
      );
      setLogs(errorLogs);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 30000); // Auto-refresh every 30s
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchLogs]);

  const handleRetry = async (projectId) => {
    setRetrying(projectId);
    setRetrySuccess(null);
    try {
      const res = await fetch('/api/logs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      if (res.ok) {
        setRetrySuccess(projectId);
        setTimeout(() => setRetrySuccess(null), 3000);
        fetchLogs(); // Refresh after retry
      }
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetrying(null);
    }
  };

  const groupedErrors = groupErrors(logs);
  const totalErrors = logs.length;
  const totalPages = Math.ceil(groupedErrors.length / pageSize);
  const paginatedGroups = groupedErrors.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issues Detected"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-sm text-dark-500">
            {totalErrors} issue{totalErrors !== 1 ? 's' : ''} in last 24 hours
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 text-dark-200 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <a
              href="/logs"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors"
            >
              View All Logs
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      }
    >
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-dark-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-green-500/10 rounded-full mb-4">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-dark-100 mb-2">No Issues Found</h3>
          <p className="text-dark-500">All systems are running smoothly.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Retry success message */}
          {retrySuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Retry initiated successfully
            </div>
          )}

          {/* Error groups */}
          <div className="space-y-3">
            {paginatedGroups.map((group, i) => (
              <ProjectErrorGroup
                key={i}
                group={group}
                onRetry={handleRetry}
                retrying={retrying}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-dark-700">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-dark-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
