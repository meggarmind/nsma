import { NotionClient } from './notion-client/index.js';
import { getSettings } from './storage.js';

const CACHE_TTL_MS = 25000;

let cache = null; // { data: { projects, items }, timestamp: number }
let inflight = null; // in-flight fetch promise, deduped across concurrent callers

/**
 * Clear the module-level cache. Exported for test isolation only.
 */
export function _resetCache() {
  cache = null;
  inflight = null;
}

function isFresh(timestamp) {
  return Date.now() - timestamp < CACHE_TTL_MS;
}

async function fetchProjectList(client, settings) {
  if (!settings.projectSlugsPageId) {
    return [];
  }

  const pageBlocks = await client.getPageBlocks(settings.projectSlugsPageId);
  const tableBlock = pageBlocks.find(b => b.type === 'table');
  if (!tableBlock) {
    return [];
  }

  const rows = await client.getPageBlocks(tableBlock.id);
  return NotionClient.parseProjectSlugsTable(rows);
}

/**
 * Fetch the raw Notion state (project list + every Inbox item) that every
 * dashboard read-view function derives from. Cached with a short TTL so
 * multiple pages/tabs share one Notion round-trip. On a failed refetch,
 * serves stale cached data rather than blanking the dashboard — only
 * throws if there has never been a successful fetch.
 * @param {{forceRefresh?: boolean}} options
 * @returns {Promise<{projects: Array, items: Array, fetchedAt: string, stale: boolean}>}
 */
export async function fetchRaw({ forceRefresh = false } = {}) {
  if (!forceRefresh && cache && isFresh(cache.timestamp)) {
    return { ...cache.data, fetchedAt: new Date(cache.timestamp).toISOString(), stale: false };
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const settings = await getSettings();
    if (!settings.notionToken || !settings.notionDatabaseId) {
      throw new Error('Notion integration not configured');
    }

    const client = new NotionClient(settings.notionToken);

    try {
      const [projects, itemPages] = await Promise.all([
        fetchProjectList(client, settings),
        client.queryAllItems(settings.notionDatabaseId)
      ]);

      const items = itemPages.map(page => NotionClient.parseItem(page));
      const data = { projects, items };
      cache = { data, timestamp: Date.now() };
      return { ...data, fetchedAt: new Date(cache.timestamp).toISOString(), stale: false };
    } catch (error) {
      if (cache) {
        console.warn(`fetchRaw: refetch failed, serving stale cached data: ${error.message}`);
        return { ...cache.data, fetchedAt: new Date(cache.timestamp).toISOString(), stale: true };
      }
      throw error;
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const STATUS_TO_KEY = {
  'Not started': 'notStarted',
  'In progress': 'inProgress',
  'Done': 'done',
  'Blocked': 'blocked',
  'Deferred': 'deferred'
};

function emptyStatusCounts() {
  return { notStarted: 0, inProgress: 0, done: 0, blocked: 0, deferred: 0 };
}

/**
 * The project list (from NSM Project Slugs) merged with each project's
 * item counts by status (from NSM Inbox), replacing the old file-derived
 * {pending, processed, deferred, archived} buckets.
 * @param {{forceRefresh?: boolean}} options
 * @returns {Promise<Array<{name: string, slug: string, modules: string, phases: string, stats: object}>>}
 */
export async function getDashboardProjects(options = {}) {
  const { projects, items } = await fetchRaw(options);

  return projects.map(project => {
    const stats = emptyStatusCounts();
    for (const item of items) {
      if (item.project !== project.slug) continue;
      const key = STATUS_TO_KEY[item.status];
      if (key) stats[key]++;
    }
    return { ...project, stats };
  });
}

/**
 * Items whose Project value doesn't match any known project slug.
 * @param {{forceRefresh?: boolean}} options
 * @returns {Promise<Array>}
 */
export async function getUnassignedItems(options = {}) {
  const { projects, items } = await fetchRaw(options);
  const knownSlugs = new Set(projects.map(p => p.slug));
  return items.filter(item => !item.project || !knownSlugs.has(item.project));
}

function countBy(items, field) {
  const counts = {};
  for (const item of items) {
    const value = item[field] || 'Unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

/**
 * Distributions by Type/Priority/Status and a per-project comparison,
 * computed live from Notion. Replaces the old sync-run-based analytics —
 * there is no equivalent to time-series/sync-frequency metrics anymore.
 * @param {{forceRefresh?: boolean}} options
 * @returns {Promise<{byType: Array, byPriority: Array, byStatus: Array, projectComparison: Array}>}
 */
export async function getAnalyticsData(options = {}) {
  const { projects, items } = await fetchRaw(options);

  const byType = countBy(items, 'type');
  const byPriority = countBy(items, 'priority');
  const byStatus = countBy(items, 'status');

  const projectComparison = projects
    .map(project => {
      const stats = emptyStatusCounts();
      let total = 0;
      for (const item of items) {
        if (item.project !== project.slug) continue;
        total++;
        const key = STATUS_TO_KEY[item.status];
        if (key) stats[key]++;
      }
      return { name: project.name, slug: project.slug, total, ...stats };
    })
    .sort((a, b) => b.total - a.total);

  return { byType, byPriority, byStatus, projectComparison };
}

/**
 * Items with a Processed Date set, most-recent-first — feeds the
 * repurposed Logs page's classification-activity view.
 * @param {{forceRefresh?: boolean}} options
 * @returns {Promise<Array>}
 */
export async function getActivityFeed(options = {}) {
  const { items } = await fetchRaw(options);
  return items
    .filter(item => item.processedDate)
    .sort((a, b) => new Date(b.processedDate).getTime() - new Date(a.processedDate).getTime());
}
