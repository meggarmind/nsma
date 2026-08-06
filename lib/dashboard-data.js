import { NotionClient } from './notion-client/index.js';
import { getSettings } from './storage.js';

const CACHE_TTL_MS = 25000;

let cache = null; // { data: { projects, items }, timestamp: number }

/**
 * Clear the module-level cache. Exported for test isolation only.
 */
export function _resetCache() {
  cache = null;
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
 * @returns {Promise<{projects: Array, items: Array}>}
 */
export async function fetchRaw({ forceRefresh = false } = {}) {
  if (!forceRefresh && cache && isFresh(cache.timestamp)) {
    return cache.data;
  }

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
    return data;
  } catch (error) {
    if (cache) {
      return cache.data;
    }
    throw error;
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
