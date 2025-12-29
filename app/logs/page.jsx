'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, Info, Filter, ArrowDown, ArrowUp, RotateCw, ChevronRight, Download, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

// Log level configuration
const LOG_LEVELS = {
  all: { label: 'All Levels', icon: Filter, color: 'text-dark-400' },
  info: { label: 'Info', icon: Info, color: 'text-blue-400' },
  warn: { label: 'Warning', icon: AlertTriangle, color: 'text-amber-400' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-400' }
};

// View mode options
const VIEW_MODES = {
  flat: 'Chronological',
  grouped: 'By Category'
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('all');
  const [retrying, setRetrying] = useState(null); // projectId being retried
  const [viewMode, setViewMode] = useState('grouped'); // 'flat' or 'grouped'
  const [expandedCategories, setExpandedCategories] = useState({
    imported: true,
    updated: true,
    errors: true
  });

  const loadLogs = useCallback(async () => {
    try {
      const levelParam = levelFilter !== 'all' ? `&level=${levelFilter}` : '';
      const res = await fetch(`/api/logs?limit=50${levelParam}`);
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  useEffect(() => {
    loadLogs();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const handleRetry = async (projectId) => {
    setRetrying(projectId);
    try {
      const res = await fetch('/api/logs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('Retry failed:', data.error);
      }

      // Reload logs to show new result
      await loadLogs();
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      setRetrying(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Get error count - handles both number and array of error objects
  const getErrorCount = (log) => {
    if (typeof log.errors === 'number') return log.errors;
    if (Array.isArray(log.errors)) return log.errors.length;
    if (typeof log.failed === 'number') return log.failed;
    return 0;
  };

  // Group logs by category (each log can appear in multiple categories)
  const categorizedLogs = useMemo(() => ({
    imported: logs.filter(l => l.imported > 0),
    updated: logs.filter(l => l.updated > 0),
    errors: logs.filter(l => getErrorCount(l) > 0)
  }), [logs]);

  // Category definitions for rendering
  const categories = [
    { id: 'imported', label: 'Imported', icon: Download, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    { id: 'updated', label: 'Updated', icon: RefreshCw, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    { id: 'errors', label: 'Errors', icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' }
  ];

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Get icon and color based on log level
  const getLogIcon = (log) => {
    const level = log.level || 'info';

    if (level === 'error' || getErrorCount(log) > 0) {
      return <XCircle className="text-red-400 mt-1" size={20} />;
    }
    if (level === 'warn') {
      return <AlertTriangle className="text-amber-400 mt-1" size={20} />;
    }
    return <CheckCircle className="text-green-400 mt-1" size={20} />;
  };

  // Calculate processed count from imported + updated (fix for legacy logs)
  const getProcessedCount = (log) => {
    if (log.processed !== undefined) return log.processed;
    return (log.imported || 0) + (log.updated || 0);
  };

  // Get operation badge with directional indicator
  const getOperationBadge = (log) => {
    const operation = log.operation || (log.action === 'reverse-sync' ? 'reverse-sync' : 'sync');
    const variants = {
      'sync': {
        label: 'Notion → Files',
        variant: 'info',
        icon: <ArrowDown size={12} className="inline mr-1" />
      },
      'reverse-sync': {
        label: 'Files → Notion',
        variant: 'secondary',
        icon: <ArrowUp size={12} className="inline mr-1" />
      },
      'expand': { label: 'AI Expand', variant: 'success', icon: null },
      'import': { label: 'Import', variant: 'warning', icon: null }
    };
    const config = variants[operation] || variants.sync;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}{config.label}
      </Badge>
    );
  };

  if (loading) {
    return <div className="text-dark-500">Loading...</div>;
  }

  return (
    <>
      <Header
        title="Sync Logs"
        description="View recent synchronization history and activity"
      />

      {/* Filters and View Mode */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-dark-400">Filter:</label>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {Object.entries(LOG_LEVELS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-dark-400">View:</label>
          <div className="flex bg-dark-800 rounded-lg p-1">
            {Object.entries(VIEW_MODES).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setViewMode(value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === value
                    ? 'bg-accent text-white'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={levelFilter !== 'all' ? `No ${levelFilter} logs` : "No sync logs yet"}
          description={levelFilter !== 'all'
            ? `No logs with level "${levelFilter}" found. Try selecting a different filter.`
            : "Logs will appear here after your first sync operation"
          }
        />
      ) : viewMode === 'grouped' ? (
        /* Grouped View */
        <div className="space-y-6">
          {categories.map(cat => {
            const categoryLogs = categorizedLogs[cat.id];
            if (categoryLogs.length === 0) return null;

            const Icon = cat.icon;
            return (
              <div key={cat.id} className={`rounded-xl border border-dark-700/50 ${cat.bgColor}`}>
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <ChevronRight
                    size={20}
                    className={`text-dark-400 transition-transform duration-200 ${
                      expandedCategories[cat.id] ? 'rotate-90' : ''
                    }`}
                  />
                  <Icon size={20} className={cat.color} />
                  <span className={`text-lg font-semibold ${cat.color}`}>
                    {cat.label}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {categoryLogs.length}
                  </Badge>
                </button>

                {expandedCategories[cat.id] && (
                  <div className="px-4 pb-4 space-y-3">
                    {categoryLogs.map((log, index) => (
                      <LogCard
                        key={`${cat.id}-${index}`}
                        log={log}
                        getLogIcon={getLogIcon}
                        getOperationBadge={getOperationBadge}
                        getProcessedCount={getProcessedCount}
                        getErrorCount={getErrorCount}
                        formatDate={formatDate}
                        handleRetry={handleRetry}
                        retrying={retrying}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat/Chronological View */
        <div className="space-y-4">
          {logs.map((log, index) => (
            <LogCard
              key={index}
              log={log}
              getLogIcon={getLogIcon}
              getOperationBadge={getOperationBadge}
              getProcessedCount={getProcessedCount}
              getErrorCount={getErrorCount}
              formatDate={formatDate}
              handleRetry={handleRetry}
              retrying={retrying}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Extracted LogCard component for reusability
function LogCard({ log, getLogIcon, getOperationBadge, getProcessedCount, getErrorCount, formatDate, handleRetry, retrying }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          {getLogIcon(log)}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-dark-50">
                {log.projectName}
              </h3>
              {getOperationBadge(log)}
            </div>
            {log.message && (
              <p className="text-sm text-dark-300 mb-2">
                {log.message}
              </p>
            )}
            <p className="text-sm text-dark-500 mb-2">
              {formatDate(log.timestamp)}
            </p>
            <div className="flex flex-wrap gap-3">
              {getProcessedCount(log) > 0 && (
                <Badge variant="success">
                  {getProcessedCount(log)} processed
                </Badge>
              )}
              {log.imported > 0 && (
                <Badge variant="info">
                  {log.imported} imported
                </Badge>
              )}
              {log.updated > 0 && (
                <Badge variant="secondary">
                  {log.updated} updated
                </Badge>
              )}
              {(getErrorCount(log) > 0 || log.failed > 0) && (
                <Badge variant="danger">
                  {getErrorCount(log) || log.failed} errors
                </Badge>
              )}
            </div>
            {log.items && log.items.length > 0 && (
              <div className="mt-3 text-sm text-dark-400">
                <p className="font-medium mb-1">Items:</p>
                <ul className="list-disc list-inside space-y-1">
                  {log.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Show structured error details if present */}
            {log.details && (
              <details className="mt-3 text-sm">
                <summary className="text-dark-400 cursor-pointer hover:text-dark-300">
                  Error Details
                </summary>
                <pre className="mt-2 p-3 bg-dark-900 rounded text-red-400 overflow-x-auto text-xs whitespace-pre-wrap">
                  {log.details.message}
                  {log.details.items && `\n\n${log.details.items}`}
                  {log.details.stack && `\n\n${log.details.stack}`}
                </pre>
              </details>
            )}
            {/* Fallback: Show errors array if no details but errors exist */}
            {!log.details && Array.isArray(log.errors) && log.errors.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="text-dark-400 cursor-pointer hover:text-dark-300">
                  Failed Items ({log.errors.length})
                </summary>
                <ul className="mt-2 p-3 bg-dark-900 rounded text-red-400 text-xs space-y-1">
                  {log.errors.map((err, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-dark-500">{err.file || err.filename}:</span>
                      <span>{err.error || err.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {/* Show updated items for successful reverse-sync */}
            {(log.operation === 'reverse-sync' || log.action === 'reverse-sync') && log.updatedItems?.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="text-dark-400 cursor-pointer hover:text-dark-300">
                  Updated Items ({log.updatedItems.length})
                </summary>
                <ul className="mt-2 p-3 bg-dark-900 rounded text-green-400 text-xs space-y-1">
                  {log.updatedItems.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-dark-500">{item.file}:</span>
                      <span>→ {item.status}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Retry button for failed reverse syncs */}
            {(log.operation === 'reverse-sync' || log.action === 'reverse-sync') &&
             log.failed > 0 &&
             log.projectId && (
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRetry(log.projectId)}
                  disabled={retrying === log.projectId}
                  className="flex items-center gap-2"
                >
                  <RotateCw size={14} className={retrying === log.projectId ? 'animate-spin' : ''} />
                  {retrying === log.projectId ? 'Retrying...' : 'Retry Failed Sync'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
