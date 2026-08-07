import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotionClient } from '@/lib/notion-client';
import { parseArgs, buildPluginConfig, setupProject } from '@/plugin/scripts/setup';

describe('parseArgs', () => {
  it('parses key=value pairs from argv', () => {
    const result = parseArgs(['--slug=myproject', '--ideation-method=brainstorming', '--extra=value']);
    expect(result).toEqual({
      slug: 'myproject',
      'ideation-method': 'brainstorming',
      extra: 'value'
    });
  });

  it('returns an empty object for an empty array', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('ignores arguments that do not match the --key=value pattern', () => {
    const result = parseArgs(['--slug=test', 'positional', '-f', '--flag']);
    expect(result).toEqual({ slug: 'test' });
  });

  it('handles values containing = signs', () => {
    const result = parseArgs(['--url=https://example.com/path?key=value']);
    expect(result).toEqual({ url: 'https://example.com/path?key=value' });
  });
});

describe('buildPluginConfig', () => {
  it('builds a complete plugin config object', () => {
    const config = buildPluginConfig('myproject', 'brainstorming', 'db-abc', 'page-xyz');
    expect(config).toEqual({
      projectSlug: 'myproject',
      ideationMethod: 'brainstorming',
      notionInboxDatabaseId: 'db-abc',
      notionProjectSlugsPageId: 'page-xyz',
      taskOutputPath: 'prompts/pending',
      taskProcessedPath: 'prompts/processed',
      unattendedThresholdHours: 24
    });
  });

  it('handles null projectSlugsPageId', () => {
    const config = buildPluginConfig('myproject', 'plan-mode', 'db-abc', null);
    expect(config.notionProjectSlugsPageId).toBeNull();
    expect(config.taskProcessedPath).toBe('prompts/processed');
  });
});

describe('setupProject', () => {
  const client = new NotionClient('fake-token');

  let tmpDir: string;

  beforeEach(async () => {
    vi.mocked(fetch).mockReset();
    tmpDir = await mkdtemp(join(tmpdir(), 'nsma-setup-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function createConfigFile(dir: string) {
    await writeFile(join(dir, 'PERSPECTIVE.md'), [
      '## Development Phases',
      '',
      '### Phase 1: Foundation',
      '- **ID**: foundation',
      '- **Keywords**: setup, config',
      '- **Priority**: 1',
      '',
      '### Backlog',
      '- **Priority**: 99',
      '',
      '## Modules',
      '',
      '### Core Platform',
      '- **ID**: core',
      '- **Paths**:',
      '  - lib/',
      '- **Phase**: Phase 1: Foundation'
    ].join('\n'));
  }

  function fakeOkResponse(json = {}) {
    return { ok: true, status: 200, headers: new Map(), json: async () => json } as any;
  }

  function mockManyOkResponses(...jsons: any[]) {
    for (const json of jsons) {
      vi.mocked(fetch).mockResolvedValueOnce(fakeOkResponse(json));
    }
  }

  it('creates prompts directories, writes .nsma-plugin.json, and upserts Notion slugs page', async () => {
    await createConfigFile(tmpDir);
    mockManyOkResponses(
      { results: [] },                                      // search for "NSM Project Slugs"
      { id: 'db-abc123', parent: { type: 'page_id', page_id: 'parent-123' } },  // getDatabase
      { id: 'new-page-456' },                               // createPage
      { results: [], has_more: false },                     // clearPage getPageBlocks
      {}                                                     // appendBlocks
    );

    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const mkdirFn = vi.fn().mockResolvedValue(undefined);

    const result = await setupProject({
      slug: 'myproject',
      ideationMethod: 'brainstorming',
      notionToken: 'fake-token',
      inboxDbId: 'db-abc123',
      projectSlugsPageId: null,
      cwd: tmpDir,
      writeFile: writeFileFn,
      mkdir: mkdirFn,
      notionClient: client
    });

    expect(result.pageId).toBe('new-page-456');
    expect(result.pluginConfig.projectSlug).toBe('myproject');
    expect(result.pluginConfig.ideationMethod).toBe('brainstorming');
    expect(result.pluginConfig.taskOutputPath).toBe('prompts/pending');
    expect(result.pluginConfig.taskProcessedPath).toBe('prompts/processed');
    expect(result.pluginConfig.unattendedThresholdHours).toBe(24);

    const expectedDirs = ['prompts/pending', 'prompts/processed', 'prompts/archived', 'prompts/deferred'];
    for (const dir of expectedDirs) {
      expect(mkdirFn).toHaveBeenCalledWith(join(tmpDir, dir), { recursive: true });
    }

    expect(writeFileFn).toHaveBeenCalledOnce();
    const [configPath, configContent] = writeFileFn.mock.calls[0];
    expect(configPath).toBe(join(tmpDir, '.nsma-plugin.json'));
    expect(JSON.parse(configContent)).toEqual(result.pluginConfig);

    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/search');
  });

  it('does not call mkdir for directories that already exist', async () => {
    await createConfigFile(tmpDir);
    mockManyOkResponses(
      { results: [] },
      { id: 'db-existing', parent: { type: 'page_id', page_id: 'parent' } },
      { id: 'page-existing' },
      { results: [], has_more: false },
      {}
    );

    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const mkdirFn = vi.fn().mockResolvedValue(undefined);

    await setupProject({
      slug: 'existing',
      ideationMethod: 'plan-mode',
      notionToken: 'fake-token',
      inboxDbId: 'db-existing',
      projectSlugsPageId: null,
      cwd: tmpDir,
      writeFile: writeFileFn,
      mkdir: mkdirFn,
      notionClient: client
    });

    expect(mkdirFn).toHaveBeenCalledTimes(4);
  });

  it('passes an existing projectSlugsPageId through to upsert', async () => {
    await createConfigFile(tmpDir);
    mockManyOkResponses(
      { results: [], has_more: false },  // getPageBlocks for existing page
      { results: [], has_more: false },  // clearPage getPageBlocks
      {}                                   // appendBlocks
    );

    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const mkdirFn = vi.fn().mockResolvedValue(undefined);

    const result = await setupProject({
      slug: 'myproject',
      ideationMethod: 'brainstorming',
      notionToken: 'fake-token',
      inboxDbId: 'db-abc',
      projectSlugsPageId: 'existing-slugs-page',
      cwd: tmpDir,
      writeFile: writeFileFn,
      mkdir: mkdirFn,
      notionClient: client
    });

    expect(result.pageId).toBe('existing-slugs-page');
  });

  it('fails when upsertProjectSlugsPage throws', async () => {
    await createConfigFile(tmpDir);
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Notion API unavailable'));

    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    const mkdirFn = vi.fn().mockResolvedValue(undefined);

    await expect(setupProject({
      slug: 'failproject',
      ideationMethod: 'brainstorming',
      notionToken: 'fake-token',
      inboxDbId: 'db-fail',
      projectSlugsPageId: null,
      cwd: tmpDir,
      writeFile: writeFileFn,
      mkdir: mkdirFn,
      notionClient: client
    })).rejects.toThrow('Notion API unavailable');

    expect(writeFileFn).not.toHaveBeenCalled();
  });
});
