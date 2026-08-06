# NSMA Dashboard Data Layer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, cached, live-Notion data layer (`lib/dashboard-data.js`) that every reworked dashboard page will consume, and delete the subset of dead code that has zero remaining callers today — without breaking `next build` for the pages that haven't been reworked yet.

**Architecture:** Two new small additions to the already-shared `lib/notion-client` (a filter-free paginated query, and two new parsed item fields), one new module (`lib/dashboard-data.js`) that owns a single cached raw Notion fetch and four read-view functions derived from it, and a narrowly-scoped deletion pass covering only files that nothing else currently imports.

**Tech Stack:** Node.js ESM, Vitest (existing conventions: `__tests__/**/*.test.{ts,tsx}`, `@/` alias, `global.fetch` pre-mocked in `__tests__/setup.ts`).

## Global Constraints

- This is the first of several implementation plans under `docs/superpowers/specs/2026-08-06-nsma-dashboard-pruning-design.md` (Plan 4 of the overarching redesign). It covers only the data-layer foundation and genuinely-orphaned deletions — the five page reworks (dashboard, inbox, logs, analytics, settings) are separate future plans.
- **Deletion scope is deliberately narrow.** Only delete a file if nothing else in the current codebase imports it or fetches its route. Files still called by not-yet-reworked pages (`lib/processor.js`, `lib/wizard.js`, `lib/reverse-sync.js`, `lib/file-scanner.js`, `lib/ai-providers.js`, `lib/prompt-expander.js`, `lib/feature-dev-enhancer.js`, `lib/template-generator.js`, `lib/analytics.js`, `lib/daemon-cache.js`, `app/api/projects/register`, `app/api/projects/wizard`, `app/api/projects/[id]/route.js`, `app/api/projects/[id]/refresh`, `app/api/projects/[id]/reverse-sync`, `app/api/sync/*`, `app/api/status`, `app/api/settings/sync-projects`, `app/api/settings/notion-databases`, `app/api/logs/retry`, `components/wizard/AddProjectWizard.jsx`, `components/dashboard/SyncBanner.jsx`, `components/dashboard/SyncStatusDashboard.jsx`, `components/settings/AIConfig.jsx`, `components/settings/TemplateConfig.jsx`, `components/settings/SyncConfig.jsx`, `app/_components/BulkActionBar.tsx`, `hooks/useSyncEvents.tsx`) are explicitly **out of scope** — they get deleted alongside the page-rework plan that removes their last caller.
- `NSMA_NOTION_TOKEN`/settings-based Notion access follows the existing `lib/storage.js` `getSettings()` pattern (`settings.notionToken`, `settings.notionDatabaseId`) — this is the dashboard's own settings storage, unrelated to the Companion plugin's `.nsma-plugin.json`.
- Notion property names are case-sensitive and must be preserved exactly: `Idea/Todo`, `Type`, `Affected Module`, `Suggested Phase`, `Assigned Phase`, `Status`, `Priority`, `Project`, `Detailed Description`, `Captured Date`, `Hydrated`, `Processed Date`, `Analysis Notes`.
- Status values from Notion are exactly: `Not started`, `In progress`, `Done`, `Blocked`, `Deferred`.
- Follow existing test conventions: Vitest, `__tests__/**/*.test.{ts,tsx}`, `@/` path alias, `global.fetch` is already `vi.fn()` from `__tests__/setup.ts` — configure/reset it per test, never re-stub it.
- No placeholders: every step below contains real, runnable code.

---

### Task 1: Extend `lib/notion-client` — `queryAllItems` and two new `parseItem` fields

**Files:**
- Modify: `lib/notion-client/index.js`
- Modify: `__tests__/lib/notion-client.test.ts`

**Interfaces:**
- Produces: `NotionClient.prototype.queryAllItems(databaseId)` — paginated fetch of every item in a database with no `filter` in the request body at all (unlike `queryDatabase`, which always filters to one status). Returns the same shape as `queryDatabase`: an array of raw Notion page objects. `NotionClient.parseItem(page)` gains two new fields: `processedDate` (from the `Processed Date` property, `date` type — `props['Processed Date']?.date?.start || null`) and `analysisNotes` (from the `Analysis Notes` property, `rich_text` type, using the same `getText` helper already used for `description`).

- [ ] **Step 1: Write failing tests**

Add to `__tests__/lib/notion-client.test.ts` (append; do not remove existing `describe` blocks):

```ts
describe('NotionClient.queryAllItems', () => {
  const client = new NotionClient('fake-token');

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('paginates through all items with no status or project filter', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 'a' }], has_more: true, next_cursor: 'cursor-2' })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 'b' }], has_more: false, next_cursor: null })
      } as any);

    const results = await client.queryAllItems('db-1');

    expect(results.map((r: any) => r.id)).toEqual(['a', 'b']);

    const firstBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body as string);
    expect(firstBody.filter).toBeUndefined();
    expect(firstBody.page_size).toBe(100);

    const secondBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body as string);
    expect(secondBody.start_cursor).toBe('cursor-2');
  });

  it('returns an empty array when the database has no items', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], has_more: false, next_cursor: null })
    } as any);

    const results = await client.queryAllItems('db-1');

    expect(results).toEqual([]);
  });
});

describe('NotionClient.parseItem — Processed Date and Analysis Notes', () => {
  it('extracts processedDate and analysisNotes when present', () => {
    const page = {
      id: 'page-789',
      url: 'https://notion.so/page-789',
      created_time: '2026-01-01T00:00:00.000Z',
      properties: {
        'Idea/Todo': { type: 'title', title: [{ plain_text: 'Done thing' }] },
        'Processed Date': { type: 'date', date: { start: '2026-01-05' } },
        'Analysis Notes': { type: 'rich_text', rich_text: [{ plain_text: 'Completed by Claude Code.' }] }
      }
    };

    const item = NotionClient.parseItem(page as any);

    expect(item.processedDate).toBe('2026-01-05');
    expect(item.analysisNotes).toBe('Completed by Claude Code.');
  });

  it('defaults processedDate to null and analysisNotes to empty string when absent', () => {
    const page = {
      id: 'page-999',
      url: 'https://notion.so/page-999',
      created_time: '2026-01-01T00:00:00.000Z',
      properties: {
        'Idea/Todo': { type: 'title', title: [{ plain_text: 'New thing' }] }
      }
    };

    const item = NotionClient.parseItem(page as any);

    expect(item.processedDate).toBeNull();
    expect(item.analysisNotes).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: FAIL — `client.queryAllItems is not a function`, and the two new `parseItem` assertions fail (`processedDate`/`analysisNotes` are `undefined`).

- [ ] **Step 3: Add `queryAllItems` to `lib/notion-client/index.js`**

Add this instance method, near the existing `queryDatabase` method:

```js
  /**
   * Query every item in a database with no filter at all (all statuses, all
   * projects) — used by the dashboard, which needs to see the full picture
   * rather than one status slice at a time like queryDatabase() does.
   * @param {string} databaseId
   * @returns {Promise<Array>}
   */
  async queryAllItems(databaseId) {
    const allResults = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) {
        body.start_cursor = cursor;
      }

      const result = await this.request('POST', `/databases/${databaseId}/query`, body);
      allResults.push(...(result.results || []));

      hasMore = result.has_more || false;
      cursor = result.next_cursor;
    }

    return allResults;
  }
```

- [ ] **Step 4: Add the two new fields to `parseItem`**

In the `static parseItem(page)` method, change the returned object from:

```js
    return {
      pageId: page.id,
      url: page.url,
      title: getText(props['Idea/Todo'] || props['Title'] || props['Name']),
      type: getSelect(props['Type']),
      affectedModule: getSelect(props['Affected Module']),
      suggestedPhase: getSelect(props['Suggested Phase']),
      status: getSelect(props['Status']),
      priority: getSelect(props['Priority']),
      project: getSelect(props['Project']),
      description: getText(props['Detailed Description'] || props['Description']),
      capturedDate: props['Captured Date']?.created_time || page.created_time,
      assignedPhase: getSelect(props['Assigned Phase']),
      // Handle checkbox, select, or status property types for Hydrated field
      isHydrated: props['Hydrated']?.checkbox === true ||
                  getSelect(props['Hydrated']) === 'Yes' ||
                  props['Hydrated']?.status?.name === 'Yes'
    };
```

to:

```js
    return {
      pageId: page.id,
      url: page.url,
      title: getText(props['Idea/Todo'] || props['Title'] || props['Name']),
      type: getSelect(props['Type']),
      affectedModule: getSelect(props['Affected Module']),
      suggestedPhase: getSelect(props['Suggested Phase']),
      status: getSelect(props['Status']),
      priority: getSelect(props['Priority']),
      project: getSelect(props['Project']),
      description: getText(props['Detailed Description'] || props['Description']),
      capturedDate: props['Captured Date']?.created_time || page.created_time,
      assignedPhase: getSelect(props['Assigned Phase']),
      // Handle checkbox, select, or status property types for Hydrated field
      isHydrated: props['Hydrated']?.checkbox === true ||
                  getSelect(props['Hydrated']) === 'Yes' ||
                  props['Hydrated']?.status?.name === 'Yes',
      processedDate: props['Processed Date']?.date?.start || null,
      analysisNotes: getText(props['Analysis Notes'])
    };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: PASS — all tests green (2 new `queryAllItems` tests, 2 new `parseItem` tests, plus the 11 existing tests).

- [ ] **Step 6: Commit**

```bash
git add lib/notion-client/index.js __tests__/lib/notion-client.test.ts
git commit -m "feat: add queryAllItems and Processed Date/Analysis Notes parsing to NotionClient"
```

---

### Task 2: `lib/dashboard-data.js` — cached raw fetch and `getDashboardProjects`

**Files:**
- Create: `lib/dashboard-data.js`
- Modify: `lib/constants.js`
- Test: `__tests__/lib/dashboard-data.test.ts`

**Interfaces:**
- Consumes: `NotionClient` (`lib/notion-client`: constructor `(token)`, `getPageBlocks(id)`, `queryAllItems(databaseId)`, static `parseItem(page)`, static `parseProjectSlugsTable(rows)`), `getSettings` (`lib/storage.js`, returns `{ notionToken, notionDatabaseId, projectSlugsPageId, ... }`).
- Produces: `async function fetchRaw({ forceRefresh = false } = {})` → `Promise<{ projects: Array<{name,slug,modules,phases}>, items: Array<ParsedItem> }>` (cached, ~25s TTL, serves stale cache on a failed refetch, throws only when there's no cache at all and the fetch fails). `async function getDashboardProjects(options)` → `Promise<Array<{name, slug, modules, phases, stats: {notStarted, inProgress, done, blocked, deferred}}>>`. `function _resetCache()` — exported for test isolation only, clears the module-level cache.

- [ ] **Step 1: Add `projectSlugsPageId` to settings defaults**

In `lib/constants.js`, in `DEFAULT_SETTINGS`, change:

```js
export const DEFAULT_SETTINGS = {
  notionToken: '',
  notionDatabaseId: '',
  registrationToken: '',
```

to:

```js
export const DEFAULT_SETTINGS = {
  notionToken: '',
  notionDatabaseId: '',
  projectSlugsPageId: '',
  registrationToken: '',
```

This field previously had nowhere to live in dashboard settings — it was only ever transiently written by `app/api/settings/sync-projects` (out of scope for deletion in this plan, but the dashboard's read side needs this field regardless of that route's eventual fate).

- [ ] **Step 2: Write failing tests**

Create `__tests__/lib/dashboard-data.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotionClient } from '@/lib/notion-client';
import { getSettings } from '@/lib/storage';

vi.mock('@/lib/storage', () => ({
  getSettings: vi.fn()
}));

import { fetchRaw, getDashboardProjects, _resetCache } from '@/lib/dashboard-data';

const baseSettings = {
  notionToken: 'fake-token',
  notionDatabaseId: 'db-1',
  projectSlugsPageId: 'slugs-page-1'
};

function tableBlocks() {
  return [
    { id: 'table-1', type: 'table', table: {} }
  ];
}

function tableRows() {
  return [
    { type: 'table_row', table_row: { cells: [[{ plain_text: 'Project Name' }], [{ plain_text: 'Slug' }], [{ plain_text: 'Modules' }], [{ plain_text: 'Phases' }]] } },
    { type: 'table_row', table_row: { cells: [[{ plain_text: 'Nsma' }], [{ plain_text: 'nsma' }], [{ plain_text: 'Core Platform' }], [{ plain_text: 'Phase 1: Foundation' }]] } }
  ];
}

function fakePage(overrides = {}) {
  return {
    id: 'page-1',
    url: 'https://notion.so/page-1',
    created_time: '2026-01-01T00:00:00.000Z',
    properties: {
      'Idea/Todo': { type: 'title', title: [{ plain_text: 'Item' }] },
      'Status': { type: 'select', select: { name: 'Not started' } },
      'Project': { type: 'select', select: { name: 'nsma' } },
      ...overrides
    }
  };
}

describe('fetchRaw', () => {
  let getPageBlocksSpy: ReturnType<typeof vi.spyOn>;
  let queryAllItemsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetCache();
    vi.mocked(getSettings).mockResolvedValue(baseSettings as any);
    getPageBlocksSpy = vi.spyOn(NotionClient.prototype, 'getPageBlocks');
    queryAllItemsSpy = vi.spyOn(NotionClient.prototype, 'queryAllItems');
    getPageBlocksSpy.mockImplementation(async (id: string) => {
      if (id === 'slugs-page-1') return tableBlocks() as any;
      if (id === 'table-1') return tableRows() as any;
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
    queryAllItemsSpy.mockResolvedValue([fakePage()] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fetches and parses projects and items on first call', async () => {
    const data = await fetchRaw();

    expect(data.projects).toEqual([{ name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }]);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].title).toBe('Item');
    expect(queryAllItemsSpy).toHaveBeenCalledWith('db-1');
  });

  it('serves cached data on a second call within the TTL, without refetching', async () => {
    await fetchRaw();
    await fetchRaw();

    expect(queryAllItemsSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache TTL expires', async () => {
    vi.useFakeTimers();
    await fetchRaw();

    vi.advanceTimersByTime(30000);
    await fetchRaw();

    expect(queryAllItemsSpy).toHaveBeenCalledTimes(2);
  });

  it('serves stale cached data when a refetch fails, rather than throwing', async () => {
    vi.useFakeTimers();
    await fetchRaw();

    vi.advanceTimersByTime(30000);
    queryAllItemsSpy.mockRejectedValueOnce(new Error('Notion API down'));

    const data = await fetchRaw();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].title).toBe('Item');
  });

  it('throws when there is no cache yet and the fetch fails', async () => {
    queryAllItemsSpy.mockRejectedValueOnce(new Error('Notion API down'));

    await expect(fetchRaw()).rejects.toThrow('Notion API down');
  });

  it('throws a clear error when Notion is not configured', async () => {
    vi.mocked(getSettings).mockResolvedValue({ notionToken: '', notionDatabaseId: '' } as any);

    await expect(fetchRaw()).rejects.toThrow('Notion integration not configured');
  });

  it('returns an empty project list without erroring when projectSlugsPageId is not set', async () => {
    vi.mocked(getSettings).mockResolvedValue({ notionToken: 'fake-token', notionDatabaseId: 'db-1', projectSlugsPageId: '' } as any);

    const data = await fetchRaw();

    expect(data.projects).toEqual([]);
    expect(getPageBlocksSpy).not.toHaveBeenCalled();
  });
});

describe('getDashboardProjects', () => {
  beforeEach(() => {
    _resetCache();
    vi.mocked(getSettings).mockResolvedValue(baseSettings as any);
    vi.spyOn(NotionClient.prototype, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'slugs-page-1') return tableBlocks() as any;
      if (id === 'table-1') return tableRows() as any;
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups items by project and counts them by status', async () => {
    vi.spyOn(NotionClient.prototype, 'queryAllItems').mockResolvedValue([
      fakePage({ 'Status': { type: 'select', select: { name: 'Not started' } }, 'Project': { type: 'select', select: { name: 'nsma' } } }),
      fakePage({ 'Status': { type: 'select', select: { name: 'Done' } }, 'Project': { type: 'select', select: { name: 'nsma' } } }),
      fakePage({ 'Status': { type: 'select', select: { name: 'Done' } }, 'Project': { type: 'select', select: { name: 'other-project' } } })
    ] as any);

    const projects = await getDashboardProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].slug).toBe('nsma');
    expect(projects[0].stats).toEqual({ notStarted: 1, inProgress: 0, done: 1, blocked: 0, deferred: 0 });
  });

  it('returns zeroed stats for a project with no items', async () => {
    vi.spyOn(NotionClient.prototype, 'queryAllItems').mockResolvedValue([] as any);

    const projects = await getDashboardProjects();

    expect(projects[0].stats).toEqual({ notStarted: 0, inProgress: 0, done: 0, blocked: 0, deferred: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/dashboard-data.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard-data'`.

- [ ] **Step 4: Create `lib/dashboard-data.js`**

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/dashboard-data.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard-data.js lib/constants.js __tests__/lib/dashboard-data.test.ts
git commit -m "feat: add lib/dashboard-data.js with cached raw fetch and getDashboardProjects"
```

---

### Task 3: `lib/dashboard-data.js` — `getUnassignedItems`, `getAnalyticsData`, `getActivityFeed`

**Files:**
- Modify: `lib/dashboard-data.js`
- Modify: `__tests__/lib/dashboard-data.test.ts`

**Interfaces:**
- Produces: `async function getUnassignedItems(options)` → `Promise<Array<ParsedItem>>` — items whose `project` doesn't match any known slug. `async function getAnalyticsData(options)` → `Promise<{byType, byPriority, byStatus, projectComparison}>` where `byType`/`byPriority`/`byStatus` are `Array<{name: string, value: number}>` and `projectComparison` is `Array<{name, slug, total, notStarted, inProgress, done, blocked, deferred}>` sorted by `total` descending. `async function getActivityFeed(options)` → `Promise<Array<ParsedItem>>` — items with `processedDate` set, sorted most-recent-first.

- [ ] **Step 1: Write failing tests**

Add to `__tests__/lib/dashboard-data.test.ts` (append):

```ts
import { getUnassignedItems, getAnalyticsData, getActivityFeed } from '@/lib/dashboard-data';

describe('getUnassignedItems', () => {
  beforeEach(() => {
    _resetCache();
    vi.mocked(getSettings).mockResolvedValue(baseSettings as any);
    vi.spyOn(NotionClient.prototype, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'slugs-page-1') return tableBlocks() as any;
      if (id === 'table-1') return tableRows() as any;
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns items whose project does not match a known slug', async () => {
    vi.spyOn(NotionClient.prototype, 'queryAllItems').mockResolvedValue([
      fakePage({ 'Project': { type: 'select', select: { name: 'nsma' } } }),
      fakePage({ 'Project': { type: 'select', select: { name: 'unknown-project' } } }),
      fakePage({ 'Project': undefined })
    ] as any);

    const unassigned = await getUnassignedItems();

    expect(unassigned).toHaveLength(2);
    expect(unassigned.map((i: any) => i.project)).toEqual(['unknown-project', '']);
  });
});

describe('getAnalyticsData', () => {
  beforeEach(() => {
    _resetCache();
    vi.mocked(getSettings).mockResolvedValue(baseSettings as any);
    vi.spyOn(NotionClient.prototype, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'slugs-page-1') return tableBlocks() as any;
      if (id === 'table-1') return tableRows() as any;
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
    vi.spyOn(NotionClient.prototype, 'queryAllItems').mockResolvedValue([
      fakePage({ 'Type': { type: 'select', select: { name: 'Feature' } }, 'Priority': { type: 'select', select: { name: 'High' } }, 'Status': { type: 'select', select: { name: 'Not started' } }, 'Project': { type: 'select', select: { name: 'nsma' } } }),
      fakePage({ 'Type': { type: 'select', select: { name: 'Feature' } }, 'Priority': { type: 'select', select: { name: 'Low' } }, 'Status': { type: 'select', select: { name: 'Done' } }, 'Project': { type: 'select', select: { name: 'nsma' } } }),
      fakePage({ 'Type': { type: 'select', select: { name: 'Bug Fix' } }, 'Priority': { type: 'select', select: { name: 'High' } }, 'Status': { type: 'select', select: { name: 'Done' } }, 'Project': { type: 'select', select: { name: 'other-project' } } })
    ] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes distributions by type, priority, and status', async () => {
    const analytics = await getAnalyticsData();

    expect(analytics.byType).toEqual(expect.arrayContaining([
      { name: 'Feature', value: 2 },
      { name: 'Bug Fix', value: 1 }
    ]));
    expect(analytics.byPriority).toEqual(expect.arrayContaining([
      { name: 'High', value: 2 },
      { name: 'Low', value: 1 }
    ]));
    expect(analytics.byStatus).toEqual(expect.arrayContaining([
      { name: 'Not started', value: 1 },
      { name: 'Done', value: 2 }
    ]));
  });

  it('computes project comparison sorted by total descending, only for known projects', async () => {
    const analytics = await getAnalyticsData();

    expect(analytics.projectComparison).toEqual([
      { name: 'Nsma', slug: 'nsma', total: 2, notStarted: 1, inProgress: 0, done: 1, blocked: 0, deferred: 0 }
    ]);
  });
});

describe('getActivityFeed', () => {
  beforeEach(() => {
    _resetCache();
    vi.mocked(getSettings).mockResolvedValue(baseSettings as any);
    vi.spyOn(NotionClient.prototype, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'slugs-page-1') return tableBlocks() as any;
      if (id === 'table-1') return tableRows() as any;
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters to items with a processedDate and sorts most-recent-first', async () => {
    vi.spyOn(NotionClient.prototype, 'queryAllItems').mockResolvedValue([
      fakePage({ 'Idea/Todo': { type: 'title', title: [{ plain_text: 'Older' }] }, 'Processed Date': { type: 'date', date: { start: '2026-01-01' } } }),
      fakePage({ 'Idea/Todo': { type: 'title', title: [{ plain_text: 'Not yet processed' }] } }),
      fakePage({ 'Idea/Todo': { type: 'title', title: [{ plain_text: 'Newer' }] }, 'Processed Date': { type: 'date', date: { start: '2026-01-10' } } })
    ] as any);

    const feed = await getActivityFeed();

    expect(feed.map((i: any) => i.title)).toEqual(['Newer', 'Older']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/dashboard-data.test.ts`
Expected: FAIL — `getUnassignedItems`/`getAnalyticsData`/`getActivityFeed` are not exported.

- [ ] **Step 3: Add the three functions to `lib/dashboard-data.js`**

Append to the end of the file:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/dashboard-data.test.ts`
Expected: PASS — all 14 tests green (9 from Task 2 plus 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard-data.js __tests__/lib/dashboard-data.test.ts
git commit -m "feat: add getUnassignedItems, getAnalyticsData, getActivityFeed to dashboard-data"
```

---

### Task 4: Delete genuinely-orphaned dead code

**Files:**
- Delete: `cli/index.js`
- Modify: `package.json` (remove `sync`/`sync:dry`/`sync:daemon`/`sync:forward`/`reverse-sync`/`reverse-sync:dry` scripts and the `bin` entry)
- Delete: `systemd/notion-sync.service`
- Delete: `systemd/nsma-daemon.service.template`
- Delete: `app/projects/[id]/page.jsx`
- Delete: `components/editor/AIPromptEditor.jsx`
- Delete: `components/editor/BasicSettings.jsx`
- Delete: `components/editor/ConfigImporter.jsx`
- Delete: `components/editor/MappingEditor.jsx`
- Delete: `components/editor/ModuleList.jsx`
- Delete: `components/editor/PhaseList.jsx`
- Delete: `app/api/projects/[id]/import-config/route.js`
- Delete: `app/api/projects/[id]/refresh-config/route.js`
- Delete: `lib/config-watcher.js`

**Interfaces:** None — this task removes code, it doesn't produce anything later tasks consume.

Every file in this list was verified during planning to have zero remaining importers/callers once this task's own deletions are applied together: `components/editor/*` and `app/api/projects/[id]/{import-config,refresh-config}` are reachable only from `app/projects/[id]/page.jsx`; `lib/config-watcher.js` is reachable only from `cli/index.js` and `app/api/projects/[id]/refresh-config`, both deleted in this same task; `cli/index.js` is reachable only via the `package.json` script/bin entries also removed here; the systemd files have no code references at all.

- [ ] **Step 1: Delete the files**

```bash
git rm cli/index.js
git rm systemd/notion-sync.service
git rm systemd/nsma-daemon.service.template
git rm "app/projects/[id]/page.jsx"
git rm components/editor/AIPromptEditor.jsx
git rm components/editor/BasicSettings.jsx
git rm components/editor/ConfigImporter.jsx
git rm components/editor/MappingEditor.jsx
git rm components/editor/ModuleList.jsx
git rm components/editor/PhaseList.jsx
git rm "app/api/projects/[id]/import-config/route.js"
git rm "app/api/projects/[id]/refresh-config/route.js"
git rm lib/config-watcher.js
```

- [ ] **Step 2: Trim `package.json`**

Remove these lines from the `"scripts"` object:

```json
    "sync": "node cli/index.js",
    "sync:dry": "node cli/index.js --dry-run",
    "sync:daemon": "node cli/index.js --daemon",
    "sync:forward": "node cli/index.js --skip-reverse-sync",
    "reverse-sync": "node cli/index.js reverse-sync",
    "reverse-sync:dry": "node cli/index.js reverse-sync --dry-run",
```

Remove the entire `"bin"` block:

```json
  "bin": {
    "notion-sync": "./cli/index.js"
  },
```

- [ ] **Step 3: Verify nothing still references the deleted files**

Run: `grep -rn "cli/index.js\|components/editor/\|config-watcher" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" app lib components hooks cli 2>/dev/null`
Expected: no output (the `cli` directory itself no longer exists, so a literal `cli/index.js` path match would only come from a stray reference elsewhere — there should be none).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the 14 new `dashboard-data` tests and the `notion-client` additions, no regressions. (This does not include a `next build` check — several files that still reference now-orphaned-but-not-yet-deleted code, per this plan's Global Constraints, are expected to keep building fine since none of today's deletions touch anything they import.)

- [ ] **Step 5: Verify the build still succeeds**

Run: `npx next build`
Expected: build succeeds. (Every file deleted in this task was verified during planning to have zero remaining importers, so this should be a clean build — if it fails, that means a caller was missed during planning and must be found via the build's error output before proceeding.)

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: remove cli/index.js, systemd sync services, and the standalone project-editor page"
```
