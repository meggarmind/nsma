import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotionClient } from '@/lib/notion-client';
import { recordTriageDecision, buildTriageProperties } from '@/plugin/mcp-server/record-triage-decision';

const project = {
  slug: 'nsma',
  name: 'Nsma',
  phases: [{ id: 'foundation', name: 'Phase 1: Foundation', keywords: [] }],
  modules: [{ id: 'core', name: 'Core Platform', filePaths: ['lib/'] }],
  modulePhaseMapping: {}
};

function fakePage(overrides = {}) {
  return {
    id: 'page-123',
    url: 'https://notion.so/page-123',
    created_time: '2026-01-01T00:00:00.000Z',
    properties: {
      'Idea/Todo': { type: 'title', title: [{ plain_text: 'Add CSV export' }] },
      'Type': { type: 'select', select: { name: 'Feature' } },
      'Affected Module': { type: 'select', select: { name: 'Core Platform' } },
      'Detailed Description': { type: 'rich_text', rich_text: [{ plain_text: 'Export analytics as CSV' }] },
      ...overrides
    }
  };
}

describe('buildTriageProperties', () => {
  it('includes the full property set used both for a fresh write and a stale-write retry', () => {
    const properties = buildTriageProperties({
      phase: 'Phase 1: Foundation',
      module: 'API',
      type: 'Technical Debt',
      priority: 'High',
      rationale: 'Reclassified after discussion.'
    });

    expect(properties).toEqual({
      'Assigned Phase': { select: { name: 'Phase 1: Foundation' } },
      'Priority': { select: { name: 'High' } },
      'Status': { select: { name: 'In progress' } },
      'Analysis Notes': { rich_text: [{ text: { content: 'Reclassified after discussion.' } }] },
      'Affected Module': { select: { name: 'API' } },
      'Type': { select: { name: 'Technical Debt' } }
    });
  });

  it('omits Affected Module and Type when not provided', () => {
    const properties = buildTriageProperties({
      phase: 'Phase 1: Foundation',
      priority: 'Medium',
      rationale: 'No corrections needed.'
    });

    expect(properties['Affected Module']).toBeUndefined();
    expect(properties['Type']).toBeUndefined();
  });
});

describe('recordTriageDecision', () => {
  const client = new NotionClient('fake-token');
  let writeFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    writeFile = vi.fn().mockResolvedValue(undefined);
  });

  it('writes Assigned Phase, Priority, Status, and Analysis Notes, and generates the task file', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => fakePage() } as any) // read
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any); // updatePage

    const result = await recordTriageDecision(
      { itemId: 'page-123', phase: 'Phase 1: Foundation', priority: 'High', rationale: 'Blocks the next release.' },
      { notionClient: client, project, settings: {}, writeFile }
    );

    expect(result.success).toBe(true);

    const updateCall = vi.mocked(fetch).mock.calls[1];
    const updateBody = JSON.parse((updateCall[1] as any).body);
    expect(updateBody.properties['Assigned Phase']).toEqual({ select: { name: 'Phase 1: Foundation' } });
    expect(updateBody.properties['Priority']).toEqual({ select: { name: 'High' } });
    expect(updateBody.properties['Status']).toEqual({ select: { name: 'In progress' } });
    expect(updateBody.properties['Analysis Notes']).toEqual({ rich_text: [{ text: { content: 'Blocks the next release.' } }] });
    expect(updateBody.properties['Suggested Phase']).toBeUndefined();

    expect(writeFile).toHaveBeenCalledOnce();
    const [filePath, content] = writeFile.mock.calls[0];
    expect(String(filePath)).toContain('prompts/pending');
    expect(content).toContain('notion_page_id: page-123');
  });

  it('includes Affected Module and Type only when provided (a correction)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => fakePage() } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any);

    await recordTriageDecision(
      { itemId: 'page-123', phase: 'Phase 1: Foundation', module: 'API', type: 'Technical Debt', priority: 'Medium', rationale: 'Reclassified after discussion.' },
      { notionClient: client, project, settings: {}, writeFile }
    );

    const updateBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body);
    expect(updateBody.properties['Affected Module']).toEqual({ select: { name: 'API' } });
    expect(updateBody.properties['Type']).toEqual({ select: { name: 'Technical Debt' } });
  });

  it('omits Affected Module and Type when not provided', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => fakePage() } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any);

    await recordTriageDecision(
      { itemId: 'page-123', phase: 'Phase 1: Foundation', priority: 'Medium', rationale: 'No corrections needed.' },
      { notionClient: client, project, settings: {}, writeFile }
    );

    const updateBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as any).body);
    expect(updateBody.properties['Affected Module']).toBeUndefined();
    expect(updateBody.properties['Type']).toBeUndefined();
  });

  it('still generates the local file when the Notion write fails, and returns success: false', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => fakePage() } as any) // read succeeds
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'server error' } as any) // update fails
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'server error' } as any)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'server error' } as any)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'server error' } as any);

    vi.useFakeTimers();
    const promise = recordTriageDecision(
      { itemId: 'page-123', phase: 'Phase 1: Foundation', priority: 'High', rationale: 'Urgent.' },
      { notionClient: client, project, settings: {}, writeFile }
    );
    await vi.advanceTimersByTimeAsync(30000);
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(writeFile).toHaveBeenCalledOnce();
  });

  it('returns success: false without writing a file when the item cannot be read', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null }, text: async () => 'not found' } as any);

    const result = await recordTriageDecision(
      { itemId: 'missing-page', phase: 'Phase 1: Foundation', priority: 'High', rationale: 'N/A' },
      { notionClient: client, project, settings: {}, writeFile }
    );

    expect(result.success).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
