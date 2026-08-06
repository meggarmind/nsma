import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotionClient } from '@/lib/notion-client';

describe('NotionClient.parseItem', () => {
  it('parses a fully populated page into a structured item', () => {
    const page = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      created_time: '2026-01-01T00:00:00.000Z',
      properties: {
        'Idea/Todo': { type: 'title', title: [{ plain_text: 'Add CSV export' }] },
        'Type': { type: 'select', select: { name: 'Feature' } },
        'Affected Module': { type: 'select', select: { name: 'Analytics' } },
        'Suggested Phase': { type: 'select', select: { name: 'Phase 2' } },
        'Assigned Phase': { type: 'select', select: { name: 'Phase 1' } },
        'Status': { type: 'select', select: { name: 'Not started' } },
        'Priority': { type: 'select', select: { name: 'Medium' } },
        'Project': { type: 'select', select: { name: 'nsma' } },
        'Detailed Description': { type: 'rich_text', rich_text: [{ plain_text: 'Export analytics data as CSV' }] },
        'Captured Date': { created_time: '2026-01-02T00:00:00.000Z' },
        'Hydrated': { checkbox: true }
      }
    };

    const item = NotionClient.parseItem(page as any);

    expect(item).toEqual({
      pageId: 'page-123',
      url: 'https://notion.so/page-123',
      title: 'Add CSV export',
      type: 'Feature',
      affectedModule: 'Analytics',
      suggestedPhase: 'Phase 2',
      status: 'Not started',
      priority: 'Medium',
      project: 'nsma',
      description: 'Export analytics data as CSV',
      capturedDate: '2026-01-02T00:00:00.000Z',
      assignedPhase: 'Phase 1',
      isHydrated: true,
      processedDate: null,
      analysisNotes: ''
    });
  });

  it('falls back to page.created_time when Captured Date is missing, and defaults isHydrated to false', () => {
    const page = {
      id: 'page-456',
      url: 'https://notion.so/page-456',
      created_time: '2026-01-01T00:00:00.000Z',
      properties: {
        'Idea/Todo': { type: 'title', title: [{ plain_text: 'Untitled capture' }] }
      }
    };

    const item = NotionClient.parseItem(page as any);

    expect(item.capturedDate).toBe('2026-01-01T00:00:00.000Z');
    expect(item.isHydrated).toBe(false);
  });
});

describe('NotionClient.blocksToMarkdown', () => {
  const client = new NotionClient('fake-token');

  it('renders heading, list, to-do, and code blocks to markdown', () => {
    const blocks = [
      { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Overview' }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'First point' }] } },
      { type: 'to_do', to_do: { rich_text: [{ plain_text: 'Ship it' }], checked: true } },
      { type: 'code', code: { rich_text: [{ plain_text: 'npm test' }], language: 'bash' } }
    ];

    const markdown = client.blocksToMarkdown(blocks as any);

    expect(markdown).toBe(
      '## Overview\n\n- First point\n\n- [x] Ship it\n\n```bash\nnpm test\n```'
    );
  });

  it('applies bold/italic/code annotations from extractRichText', () => {
    const blocks = [
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { plain_text: 'bold', annotations: { bold: true } },
            { plain_text: ' and ', annotations: {} },
            { plain_text: 'code', annotations: { code: true } }
          ]
        }
      }
    ];

    expect(client.blocksToMarkdown(blocks as any)).toBe('**bold** and `code`');
  });
});

describe('NotionClient.request retry behavior', () => {
  const client = new NotionClient('fake-token');

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once on a 429 and succeeds on the second attempt', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'rate limited'
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'ok' })
      } as any);

    const promise = client.request('GET', '/test');
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toEqual({ result: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a 400 client error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: async () => 'bad request'
    } as any);

    await expect(client.request('GET', '/test')).rejects.toThrow('HTTP 400');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('NotionClient.queryDatabase pagination', () => {
  const client = new NotionClient('fake-token');

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('follows next_cursor until has_more is false', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 'a' }, { id: 'b' }],
          has_more: true,
          next_cursor: 'cursor-2'
        })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 'c' }],
          has_more: false,
          next_cursor: null
        })
      } as any);

    const results = await client.queryDatabase('db-1', 'nsma', 'Not started');

    expect(results).toHaveLength(3);
    expect(results.map((r: any) => r.id)).toEqual(['a', 'b', 'c']);

    const secondCallBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body as string);
    expect(secondCallBody.start_cursor).toBe('cursor-2');
  });
});

describe('NotionClient.parseProjectSlugsTable', () => {
  it('skips the header row and extracts the four columns from each data row', () => {
    const rows = [
      {
        type: 'table_row',
        table_row: { cells: [
          [{ plain_text: 'Project Name' }], [{ plain_text: 'Slug' }], [{ plain_text: 'Modules' }], [{ plain_text: 'Phases' }]
        ] }
      },
      {
        type: 'table_row',
        table_row: { cells: [
          [{ plain_text: 'Residio' }], [{ plain_text: 'residio' }], [{ plain_text: 'Core, API' }], [{ plain_text: 'Phase 1, Phase 2' }]
        ] }
      },
      {
        type: 'table_row',
        table_row: { cells: [
          [{ plain_text: 'Nsma' }], [{ plain_text: 'nsma' }], [{ plain_text: 'Core Platform' }], [{ plain_text: 'Phase 1: Foundation' }]
        ] }
      }
    ];

    expect(NotionClient.parseProjectSlugsTable(rows)).toEqual([
      { name: 'Residio', slug: 'residio', modules: 'Core, API', phases: 'Phase 1, Phase 2' },
      { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }
    ]);
  });
});

describe('NotionClient.upsertProjectSlugsPage', () => {
  const client = new NotionClient('fake-token');

  it('merges this project into existing rows without dropping other projects', async () => {
    vi.spyOn(client, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'page-1') {
        return [{ id: 'table-1', type: 'table', table: {} }] as any;
      }
      if (id === 'table-1') {
        return [
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Project Name' }], [{ plain_text: 'Slug' }], [{ plain_text: 'Modules' }], [{ plain_text: 'Phases' }]] } },
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Residio' }], [{ plain_text: 'residio' }], [{ plain_text: 'Core' }], [{ plain_text: 'Phase 1' }]] } }
        ] as any;
      }
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
    const syncSpy = vi.spyOn(client, 'syncProjectSlugsPage').mockResolvedValue({ pageId: 'page-1', created: false });

    await client.upsertProjectSlugsPage('db-1', { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }, 'page-1');

    expect(syncSpy).toHaveBeenCalledWith('db-1', [
      { name: 'Residio', slug: 'residio', modules: 'Core', phases: 'Phase 1' },
      { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }
    ], 'page-1');
  });

  it('replaces an existing row for the same slug rather than duplicating it', async () => {
    vi.spyOn(client, 'getPageBlocks').mockImplementation(async (id: string) => {
      if (id === 'page-1') return [{ id: 'table-1', type: 'table', table: {} }] as any;
      if (id === 'table-1') {
        return [
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Project Name' }], [{ plain_text: 'Slug' }], [{ plain_text: 'Modules' }], [{ plain_text: 'Phases' }]] } },
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'Nsma Old Name' }], [{ plain_text: 'nsma' }], [{ plain_text: 'Old Module' }], [{ plain_text: 'Old Phase' }]] } }
        ] as any;
      }
      throw new Error(`unexpected getPageBlocks id: ${id}`);
    });
    const syncSpy = vi.spyOn(client, 'syncProjectSlugsPage').mockResolvedValue({ pageId: 'page-1', created: false });

    await client.upsertProjectSlugsPage('db-1', { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }, 'page-1');

    expect(syncSpy).toHaveBeenCalledWith('db-1', [
      { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }
    ], 'page-1');
  });

  it('writes just this project when no page exists yet', async () => {
    const syncSpy = vi.spyOn(client, 'syncProjectSlugsPage').mockResolvedValue({ pageId: 'new-page', created: true });

    await client.upsertProjectSlugsPage('db-1', { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }, null);

    expect(syncSpy).toHaveBeenCalledWith('db-1', [
      { name: 'Nsma', slug: 'nsma', modules: 'Core Platform', phases: 'Phase 1: Foundation' }
    ], null);
  });
});

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
