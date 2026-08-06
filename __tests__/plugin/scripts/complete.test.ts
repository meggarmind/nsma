import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotionClient } from '@/lib/notion-client';
import { completeTask } from '@/plugin/scripts/complete';

describe('completeTask', () => {
  const client = new NotionClient('fake-token');
  let rename: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    rename = vi.fn().mockResolvedValue(undefined);
  });

  it('reads notion_page_id from the file, marks the item Done, and moves the file', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any);

    const readFile = vi.fn().mockResolvedValue('---\nnotion_page_id: page-123\nproject: nsma\n---\n\nBody');

    const result = await completeTask('/project/prompts/pending/task.md', {
      notionClient: client,
      promptsProcessedDir: '/project/prompts/processed',
      rename,
      readFile
    });

    expect(result.success).toBe(true);

    const updateCall = vi.mocked(fetch).mock.calls[0];
    expect(updateCall[0]).toContain('/pages/page-123');
    const updateBody = JSON.parse((updateCall[1] as any).body);
    expect(updateBody.properties['Status']).toEqual({ select: { name: 'Done' } });

    const calls = rename.mock.calls;
    expect(calls[0][0]).toBe('/project/prompts/pending/task.md');
    expect(calls[0][1]).toMatch(/processed[\\/]task\.md$/);
  });

  it('reports a mismatch instead of moving the file when no notion_page_id is present', async () => {
    const readFile = vi.fn().mockResolvedValue('---\nproject: nsma\n---\n\nBody with no id');

    const result = await completeTask('/project/prompts/pending/task.md', {
      notionClient: client,
      promptsProcessedDir: '/project/prompts/processed',
      rename,
      readFile
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('notion_page_id');
    expect(rename).not.toHaveBeenCalled();
  });
});
