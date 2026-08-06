import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, writeFile as fsWriteFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotionClient } from '@/lib/notion-client';
import { recordTriageDecision, buildTriageProperties } from '@/plugin/mcp-server/record-triage-decision';
import { loadDecisionFromPendingFile } from '@/plugin/lib/routing';

/**
 * End-to-end "seam" test for Finding 2: recordTriageDecision must generate a
 * local task file whose frontmatter reflects the human triage decision
 * (item.assignedPhase), not PromptGenerator's keyword-classifier guess. The
 * SessionStart hook's stale-write retry reads that frontmatter back via
 * loadDecisionFromPendingFile and re-sends it to Notion via
 * buildTriageProperties — if the file ever records the classifier's guess
 * instead of the real decision, a retry silently overwrites the correct
 * Notion state with the wrong one. This test walks the full loop and would
 * have caught that regression.
 */
describe('triage decision round-trip (record -> file -> reload -> Notion properties)', () => {
  const project = {
    slug: 'nsma',
    name: 'Nsma',
    // The module-phase mapping below would make PromptGenerator's classifier
    // (determinePhase) resolve this item to "Phase 1: Foundation" — a
    // *different* phase than the human decision below ("Phase 3: UI/UX").
    phases: [
      { id: 'foundation', name: 'Phase 1: Foundation', keywords: [] },
      { id: 'ui-ux', name: 'Phase 3: UI/UX', keywords: [] }
    ],
    modules: [
      { id: 'core', name: 'Core Platform', filePaths: ['lib/'] },
      { id: 'api', name: 'API', filePaths: ['api/'] }
    ],
    modulePhaseMapping: { core: 'foundation' }
  };

  function fakePage() {
    return {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      created_time: '2026-01-01T00:00:00.000Z',
      properties: {
        'Idea/Todo': { type: 'title', title: [{ plain_text: 'Add CSV export' }] },
        'Type': { type: 'select', select: { name: 'Feature' } },
        'Affected Module': { type: 'select', select: { name: 'Core Platform' } },
        'Detailed Description': { type: 'rich_text', rich_text: [{ plain_text: 'Export analytics as CSV' }] }
      }
    };
  }

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('preserves the human triage decision through file write -> reload -> Notion properties, not the classifier guess', async () => {
    const client = new NotionClient('fake-token');

    // The human decision, reached during live triage — deliberately
    // different from what PromptGenerator.determinePhase would compute
    // from the item's module-phase mapping (Phase 1: Foundation).
    const originalDecision = {
      itemId: 'page-123',
      phase: 'Phase 3: UI/UX',
      module: 'API',
      type: 'Technical Debt',
      priority: 'High',
      rationale: 'Corrected during live triage discussion.'
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => fakePage() } as any) // read
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any); // updatePage

    let capturedContent = '';
    const captureWriteFile = vi.fn(async (_filePath: string, content: string) => {
      capturedContent = content;
    });

    // Step 1: record the decision, capturing the generated file content
    // instead of touching disk.
    const result = await recordTriageDecision(originalDecision, {
      notionClient: client,
      project,
      settings: {},
      writeFile: captureWriteFile
    });

    expect(result.success).toBe(true);
    expect(capturedContent).toBeTruthy();

    const dir = await mkdtemp(join(tmpdir(), 'nsma-decision-roundtrip-'));
    try {
      // Step 2: write the captured content to a real temp file.
      const filePath = join(dir, 'task.md');
      await fsWriteFile(filePath, capturedContent);

      // Step 3: reload the decision from that file, exactly as the
      // stale-write retry path in session-start.js does.
      const reloadedDecision = await loadDecisionFromPendingFile(dir, 'page-123');
      expect(reloadedDecision).not.toBeNull();

      // Step 4: build the Notion properties payload from the reloaded decision.
      const properties = buildTriageProperties(reloadedDecision as any);

      // Step 5: the reloaded/rebuilt properties must match the ORIGINAL
      // decision passed to recordTriageDecision — not the classifier's guess.
      expect(properties['Assigned Phase']).toEqual({ select: { name: originalDecision.phase } });
      expect(properties['Affected Module']).toEqual({ select: { name: originalDecision.module } });
      expect(properties['Type']).toEqual({ select: { name: originalDecision.type } });
      expect(properties['Priority']).toEqual({ select: { name: originalDecision.priority } });

      // Sanity check: prove this isn't accidentally passing because the
      // classifier's guess happens to equal the decision.
      expect(originalDecision.phase).not.toBe('Phase 1: Foundation');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
