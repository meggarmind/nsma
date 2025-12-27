import { getLogs, getProjects, getInboxItems } from './storage.js';
import { ITEM_TYPES } from './constants.js';
import { CHART_COLORS } from './chart-colors.js';

/**
 * Filter logs by date range
 * @param {Array} logs - Array of log entries
 * @param {string} range - '7d', '30d', '90d', or 'all'
 * @returns {Array} - Filtered logs
 */
export function filterLogsByRange(logs, range) {
  if (range === 'all') return logs;

  const days = parseInt(range);
  if (isNaN(days)) return logs;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return logs.filter(log => new Date(log.timestamp) >= cutoff);
}

/**
 * Aggregate logs by day for time-series charts
 * @param {Array} logs - Array of log entries
 * @returns {Array} - Daily aggregates sorted by date
 */
export function aggregateByDay(logs) {
  const grouped = logs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; // YYYY-MM-DD
    if (!acc[date]) {
      acc[date] = { date, syncs: 0, items: 0, errors: 0 };
    }
    acc[date].syncs += 1;
    acc[date].items += log.processed || 0;
    acc[date].errors += log.errors || 0;
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate logs by week for time-series charts
 * @param {Array} logs - Array of log entries
 * @returns {Array} - Weekly aggregates sorted by week
 */
export function aggregateByWeek(logs) {
  const grouped = logs.reduce((acc, log) => {
    const date = new Date(log.timestamp);
    const yearWeek = getWeekNumber(date);
    const week = `${date.getFullYear()}-W${yearWeek.toString().padStart(2, '0')}`;

    if (!acc[week]) {
      acc[week] = { week, syncs: 0, items: 0, errors: 0 };
    }
    acc[week].syncs += 1;
    acc[week].items += log.processed || 0;
    acc[week].errors += log.errors || 0;
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Aggregate items by type for distribution charts
 * @param {Array} inboxItems - Array of inbox items with type field
 * @returns {Array} - Type distribution with colors
 */
export function aggregateByType(inboxItems) {
  const counts = {};

  // Initialize all known types with 0
  ITEM_TYPES.forEach(type => {
    counts[type] = 0;
  });

  inboxItems.forEach(item => {
    const type = item.type || 'Unknown';
    counts[type] = (counts[type] || 0) + 1;
  });

  return Object.entries(counts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: CHART_COLORS[name] || CHART_COLORS.Unknown
    }));
}

/**
 * Aggregate items by priority for distribution charts
 * @param {Array} inboxItems - Array of inbox items with priority field
 * @returns {Array} - Priority distribution with colors
 */
export function aggregateByPriority(inboxItems) {
  const counts = { High: 0, Medium: 0, Low: 0 };

  inboxItems.forEach(item => {
    const priority = item.priority || 'Medium';
    if (counts.hasOwnProperty(priority)) {
      counts[priority]++;
    }
  });

  return Object.entries(counts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: CHART_COLORS[name] || CHART_COLORS.Medium
    }));
}

/**
 * Aggregate project stats for status distribution
 * @param {Array} projects - Array of project objects with stats
 * @returns {Array} - Status distribution with colors
 */
export function aggregateByStatus(projects) {
  const totals = projects.reduce(
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

  return [
    { name: 'Pending', value: totals.pending, color: CHART_COLORS.pending },
    { name: 'Processed', value: totals.processed, color: CHART_COLORS.processed },
    { name: 'Deferred', value: totals.deferred, color: CHART_COLORS.deferred },
    { name: 'Archived', value: totals.archived, color: CHART_COLORS.archived },
  ].filter(item => item.value > 0);
}

/**
 * Get project comparison data for bar charts
 * @param {Array} projects - Array of project objects with stats
 * @returns {Array} - Project comparison data sorted by total items
 */
export function getProjectComparison(projects) {
  return projects
    .filter(p => !p.isSystem) // Exclude system projects like Inbox
    .map(project => {
      const stats = project.stats || {};
      return {
        name: project.name,
        pending: stats.pending || 0,
        processed: stats.processed || 0,
        deferred: stats.deferred || 0,
        archived: stats.archived || 0,
        total: (stats.pending || 0) + (stats.processed || 0) +
               (stats.deferred || 0) + (stats.archived || 0)
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Calculate summary statistics
 * @param {Array} logs - Array of log entries
 * @param {Array} projects - Array of project objects
 * @returns {Object} - Summary KPIs
 */
export function calculateSummary(logs, projects) {
  const totalSyncs = logs.length;
  const totalItemsProcessed = logs.reduce((sum, log) => sum + (log.processed || 0), 0);
  const totalErrors = logs.reduce((sum, log) => sum + (log.errors || 0), 0);

  const avgItemsPerSync = totalSyncs > 0
    ? (totalItemsProcessed / totalSyncs).toFixed(1)
    : '0';

  const errorRate = totalSyncs > 0
    ? ((totalErrors / (totalItemsProcessed + totalErrors)) * 100).toFixed(1)
    : '0';

  // Calculate sync frequency (syncs per day in the range)
  let syncFrequency = '0';
  if (logs.length > 1) {
    const firstLog = new Date(logs[0].timestamp);
    const lastLog = new Date(logs[logs.length - 1].timestamp);
    const daysDiff = Math.max(1, (lastLog - firstLog) / (1000 * 60 * 60 * 24));
    syncFrequency = (totalSyncs / daysDiff).toFixed(1);
  }

  // Find most active project
  const projectSyncs = logs.reduce((acc, log) => {
    const name = log.projectName || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const mostActiveProject = Object.entries(projectSyncs)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None';

  return {
    totalSyncs,
    totalItemsProcessed,
    avgItemsPerSync: parseFloat(avgItemsPerSync),
    errorRate: parseFloat(errorRate),
    syncFrequency: `${syncFrequency}/day`,
    mostActiveProject
  };
}

/**
 * Get complete analytics data
 * @param {string} range - '7d', '30d', '90d', or 'all'
 * @returns {Promise<Object>} - Complete analytics data
 */
export async function getAnalyticsData(range = '30d') {
  const [allLogs, projects, inboxItems] = await Promise.all([
    getLogs(1000),
    getProjects(),
    getInboxItems()
  ]);

  const logs = filterLogsByRange(allLogs, range);

  return {
    timeSeries: {
      daily: aggregateByDay(logs),
      weekly: aggregateByWeek(logs)
    },
    distributions: {
      byType: aggregateByType(inboxItems),
      byPriority: aggregateByPriority(inboxItems),
      byStatus: aggregateByStatus(projects)
    },
    projectComparison: getProjectComparison(projects),
    summary: calculateSummary(logs, projects)
  };
}
