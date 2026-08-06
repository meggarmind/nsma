import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { splitByType, getPendingPageIds, findStaleWrites, loadDecisionFromPendingFile } from '@/plugin/lib/routing';

describe('splitByType', () => {
  it('routes Bug Fix, Documentation, Security Fix, and Technical Debt to bugItems', () => {
    const items = [
      { pageId: 'a', type: 'Bug Fix' },
      { pageId: 'b', type: 'Documentation' },
      { pageId: 'c', type: 'Security Fix' },
      { pageId: 'd', type: 'Technical Debt' },
      { pageId: 'e', type: 'Feature' },
      { pageId: 'f', type: 'Improvement' },
      { pageId: 'g', type: 'Research/Spike' }
    ];

    const { bugItems, ideationItems } = splitByType(items as any);

    expect(bugItems.map(i => i.pageId)).toEqual(['a', 'b', 'c', 'd']);
    expect(ideationItems.map(i => i.pageId)).toEqual(['e', 'f', 'g']);
  });

  it('handles an empty list', () => {
    expect(splitByType([])).toEqual({ bugItems: [], ideationItems: [] });
  });
});

describe('getPendingPageIds', () => {
  it('extracts notion_page_id from frontmatter across all .md files in the directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nsma-routing-test-'));
    try {
      await writeFile(join(dir, 'task-one.md'), '---\nnotion_page_id: page-aaa\nproject: nsma\n---\n\nBody');
      await writeFile(join(dir, 'task-two.md'), '---\nnotion_page_id: page-bbb\nproject: nsma\n---\n\nBody');
      await writeFile(join(dir, 'not-a-task.txt'), 'notion_page_id: page-ccc');

      const ids = await getPendingPageIds(dir);

      expect(ids).toEqual(new Set(['page-aaa', 'page-bbb']));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty set when the directory does not exist', async () => {
    const ids = await getPendingPageIds('/nonexistent/path/for/sure');
    expect(ids).toEqual(new Set());
  });
});

describe('findStaleWrites', () => {
  it('separates items whose pageId is already present in prompts/pending from the rest', () => {
    const items = [
      { pageId: 'page-aaa', title: 'Already written' },
      { pageId: 'page-zzz', title: 'Not yet written' }
    ];
    const pendingPageIds = new Set(['page-aaa']);

    const { stale, remaining } = findStaleWrites(items as any, pendingPageIds);

    expect(stale.map(i => i.pageId)).toEqual(['page-aaa']);
    expect(remaining.map(i => i.pageId)).toEqual(['page-zzz']);
  });
});

describe('loadDecisionFromPendingFile', () => {
  it('returns the correctly parsed decision from a file with full frontmatter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nsma-routing-decision-test-'));
    try {
      await writeFile(
        join(dir, 'task-one.md'),
        '---\nnotion_page_id: page-aaa\nproject: nsma\nphase: Phase 1: Foundation\nmodule: Core Platform\ntype: Feature\npriority: High\n---\n\nBody'
      );

      const decision = await loadDecisionFromPendingFile(dir, 'page-aaa');

      expect(decision).toEqual({
        phase: 'Phase 1: Foundation',
        module: 'Core Platform',
        type: 'Feature',
        priority: 'High',
        rationale: 'Recovered after a previous write failure — see the task file for full context.'
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an incomplete object (missing fields undefined) when the matching file lacks phase or priority', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nsma-routing-decision-test-'));
    try {
      await writeFile(
        join(dir, 'task-two.md'),
        '---\nnotion_page_id: page-bbb\nproject: nsma\nmodule: Core Platform\ntype: Feature\n---\n\nBody'
      );

      const decision = await loadDecisionFromPendingFile(dir, 'page-bbb');

      expect(decision).toEqual({
        phase: undefined,
        module: 'Core Platform',
        type: 'Feature',
        priority: undefined,
        rationale: 'Recovered after a previous write failure — see the task file for full context.'
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when no file matches the given notion_page_id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nsma-routing-decision-test-'));
    try {
      await writeFile(join(dir, 'task-three.md'), '---\nnotion_page_id: page-ccc\nproject: nsma\nphase: Backlog\npriority: Low\n---\n\nBody');

      const decision = await loadDecisionFromPendingFile(dir, 'page-does-not-exist');

      expect(decision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
