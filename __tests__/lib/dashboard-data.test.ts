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
