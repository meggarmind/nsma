import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { addSyncedMarker, loadPluginConfig } from '@/plugin/hooks/session-start';

describe('addSyncedMarker', () => {
  const frontmatter = '---\nnotion_page_id: page-123\nproject: nsma\nphase: Phase 1: Foundation\npriority: High\n---\n\n# Task Body\n';

  it('inserts synced_to_notion: true after the opening --- delimiter in frontmatter', () => {
    const result = addSyncedMarker(frontmatter);
    expect(result).toContain('synced_to_notion: true');
    expect(result.indexOf('synced_to_notion: true')).toBeLessThan(result.indexOf('notion_page_id'));
  });

  it('does not insert a duplicate marker when synced_to_notion: true is already present', () => {
    const alreadySynced = '---\nsynced_to_notion: true\nnotion_page_id: page-123\n---\n\n# Already synced';
    const result = addSyncedMarker(alreadySynced);
    expect((result.match(/synced_to_notion:\s*true\s*$/gm) || []).length).toBe(1);
  });

  it('returns the original content unchanged when synced_to_notion: true already exists', () => {
    const content = '---\nsynced_to_notion: true\nnotion_page_id: page-123\n---\n\nBody';
    expect(addSyncedMarker(content)).toBe(content);
  });

  it('handles windows-style line endings (\\r\\n)', () => {
    const windowsContent = '---\r\nnotion_page_id: page-123\r\npriority: High\r\n---\r\n\r\n# Task Body\r\n';
    const result = addSyncedMarker(windowsContent);
    expect(result).toContain('synced_to_notion: true');
    expect(result).toContain('\r\n');
  });

  it('handles content with no frontmatter (no opening ---)', () => {
    const noFrontmatter = '# Just a title\n\nSome body text';
    const result = addSyncedMarker(noFrontmatter);
    expect(result).toBe(noFrontmatter);
  });

  it('handles empty content', () => {
    expect(addSyncedMarker('')).toBe('');
  });

  it('does not match synced_to_notion: false as already-synced', () => {
    const content = '---\nsynced_to_notion: false\nnotion_page_id: page-123\n---\n\nBody';
    const result = addSyncedMarker(content);
    expect((result.match(/synced_to_notion:\s*true\s*$/gm) || []).length).toBe(1);
  });
});

describe('loadPluginConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nsma-session-start-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when .nsma-plugin.json does not exist in cwd', async () => {
    const result = await loadPluginConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('returns the parsed plugin config when the file exists', async () => {
    const config = {
      projectSlug: 'myproject',
      ideationMethod: 'brainstorming',
      notionInboxDatabaseId: 'db-abc123',
      notionProjectSlugsPageId: 'page-xyz',
      taskOutputPath: 'prompts/pending',
      taskProcessedPath: 'prompts/processed',
      unattendedThresholdHours: 24
    };
    await writeFile(join(tmpDir, '.nsma-plugin.json'), JSON.stringify(config));

    const result = await loadPluginConfig(tmpDir);
    expect(result).toEqual(config);
  });

  it('returns the parsed config even when taskProcessedPath is missing (older configs)', async () => {
    const config = {
      projectSlug: 'legacy',
      ideationMethod: 'plan-mode',
      notionInboxDatabaseId: 'db-legacy',
      taskOutputPath: 'prompts/pending',
      unattendedThresholdHours: 24
    };
    await writeFile(join(tmpDir, '.nsma-plugin.json'), JSON.stringify(config));

    const result = await loadPluginConfig(tmpDir);
    expect(result.projectSlug).toBe('legacy');
    expect(result.taskProcessedPath).toBeUndefined();
  });

  it('defaults to process.cwd() when no cwd argument is given', async () => {
    const result = await loadPluginConfig();
    expect(result).toBeNull();
  });
});
