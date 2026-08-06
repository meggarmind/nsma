# NSMA Shared Notion Client Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `NotionClient` out of `lib/notion.js` into a standalone `lib/notion-client/` module with test coverage, so both the NSMA dashboard and the future NSMA Companion plugin can import the same client without duplication.

**Architecture:** Move the existing `NotionClient` class verbatim into `lib/notion-client/index.js` (unchanged behavior, one import-path fix for `retry.js`), add unit tests it currently has none of, then repoint all 14 existing consumers at the new location and delete the old file.

**Tech Stack:** Node.js ESM, Vitest (`happy-dom` environment, `global.fetch` pre-mocked in `__tests__/setup.ts`), existing `lib/retry.js` (unchanged, stays shared with `lib/prompt-expander.js` and `lib/feature-dev-enhancer.js`).

## Global Constraints

- This is part of Approach 1 from `docs/superpowers/specs/2026-08-06-nsma-companion-plugin-design.md`: same repo, shared Notion client extracted, no separate package/repo.
- `lib/retry.js` does NOT move — it's shared by non-Notion consumers (`lib/prompt-expander.js`, `lib/feature-dev-enhancer.js`) and stays at its current path.
- Notion property names referenced in code (`Idea/Todo`, `Type`, `Affected Module`, `Suggested Phase`, `Assigned Phase`, `Status`, `Priority`, `Project`, `Detailed Description`, `Captured Date`, `Hydrated`) are case-sensitive and must be preserved exactly — they are literal Notion database property names, not identifiers we control.
- Follow existing test conventions: Vitest, files at `__tests__/**/*.test.{ts,tsx}`, `@/` path alias (`@/*` → repo root, defined in `tsconfig.json` and `jsconfig.json`), `global.fetch` is already `vi.fn()` from `__tests__/setup.ts` — do not re-stub it, just configure/reset it per test.
- No placeholders: every step below contains real, runnable code.

---

### Task 1: Extract `NotionClient` into `lib/notion-client/` with test coverage

**Files:**
- Create: `lib/notion-client/index.js`
- Create: `__tests__/lib/notion-client.test.ts`
- Read (source of the move, do not modify yet): `lib/notion.js`

**Interfaces:**
- Produces: `NotionClient` class exported from `lib/notion-client/index.js`, with the same public API as today's `lib/notion.js`: constructor `(token)`, instance methods `request(method, endpoint, body?)`, `queryDatabase(databaseId, projectSlug?, status?)`, `getPageBlocks(pageId)`, `updatePage(pageId, properties)`, `blocksToMarkdown(blocks)`, `extractRichText(richTextArray)`, `syncProjectOptionsToDatabase(databaseId, projectSlugs)`, `syncSelectOptionsToDatabase(databaseId, propertyName, optionNames)`, `updateItemProject(pageId, projectSlug)`, `listDatabases()`, `findPageByTitle(title)`, `getDatabase(databaseId)`, `createPage(parentPageId, title)`, `createDatabasePage(databaseId, title)`, `clearPageContent(pageId)`, `appendBlocks(pageId, blocks)`, `syncProjectSlugsPage(databaseId, projects, existingPageId?)`, and static method `NotionClient.parseItem(page)`.

- [ ] **Step 1: Write failing tests for the new module's pure functions and API behavior**

Create `__tests__/lib/notion-client.test.ts`:

```ts
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
      isHydrated: true
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notion-client'` (the module doesn't exist yet).

- [ ] **Step 3: Create `lib/notion-client/index.js` by moving the client**

Copy the full contents of `lib/notion.js` (523 lines, the `NotionClient` class and its methods, unchanged) into the new file `lib/notion-client/index.js`, with exactly one edit: the import on line 1 changes from a same-directory reference to a parent-directory reference, since the file is now one level deeper:

```js
import { withRetry, fetchWithRetryInfo } from '../retry.js';
```

Everything else in the file — every method body, the static `parseItem`, `blocksToMarkdown`, `extractRichText` — is copied verbatim, no logic changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/notion-client/index.js __tests__/lib/notion-client.test.ts
git commit -m "feat: extract NotionClient into lib/notion-client with test coverage"
```

---

### Task 2: Repoint all consumers at `lib/notion-client` and remove the old file

**Files:**
- Modify: `cli/index.js:7`
- Modify: `lib/wizard.js:8`
- Modify: `lib/processor.js:4`
- Modify: `app/api/settings/sync-projects/route.js:3`
- Modify: `app/api/settings/notion-databases/route.js:3`
- Modify: `app/api/projects/[id]/route.js:3`
- Modify: `app/api/inbox/bulk/route.js:3`
- Modify: `app/api/inbox/[itemId]/archive/route.js:3`
- Modify: `app/api/projects/[id]/reverse-sync/route.js:3`
- Modify: `app/api/inbox/[itemId]/delete/route.js:3`
- Modify: `app/api/projects/route.js:3`
- Modify: `app/api/inbox/[itemId]/assign/route.js:3`
- Modify: `app/api/projects/register/route.js:6`
- Modify: `app/api/logs/retry/route.js:3`
- Delete: `lib/notion.js`

**Interfaces:**
- Consumes: `NotionClient` from Task 1's `lib/notion-client/index.js` (same class, same public API — no call-site code changes needed beyond the import line).

- [ ] **Step 1: Update the two `lib/`-relative imports**

In `lib/wizard.js:8` and `lib/processor.js:4`, change:

```js
import { NotionClient } from './notion.js';
```

to:

```js
import { NotionClient } from './notion-client/index.js';
```

- [ ] **Step 2: Update the CLI's relative import**

In `cli/index.js:7`, change:

```js
import { NotionClient } from '../lib/notion.js';
```

to:

```js
import { NotionClient } from '../lib/notion-client/index.js';
```

- [ ] **Step 3: Update the 11 alias-based imports in `app/api/`**

In each of these files, change the import line from `import { NotionClient } from '@/lib/notion';` to `import { NotionClient } from '@/lib/notion-client';` (the `@/` alias resolves the directory's `index.js` automatically, same as it resolved `notion.js` before):

- `app/api/settings/sync-projects/route.js:3`
- `app/api/settings/notion-databases/route.js:3`
- `app/api/projects/[id]/route.js:3`
- `app/api/inbox/bulk/route.js:3`
- `app/api/inbox/[itemId]/archive/route.js:3`
- `app/api/projects/[id]/reverse-sync/route.js:3`
- `app/api/inbox/[itemId]/delete/route.js:3`
- `app/api/projects/route.js:3`
- `app/api/inbox/[itemId]/assign/route.js:3`
- `app/api/projects/register/route.js:6`
- `app/api/logs/retry/route.js:3`

- [ ] **Step 4: Delete the old file**

```bash
rm lib/notion.js
```

- [ ] **Step 5: Verify nothing still references the old path**

Run: `grep -rn "lib/notion'" --include="*.js" . ; grep -rn "from '@/lib/notion'" --include="*.js" .`
Expected: no output (both searches return zero matches — everything now points at `notion-client`).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests (Button, Input, Modal, and the new notion-client tests) still green.

- [ ] **Step 7: Verify the app builds**

Run: `npm run build`
Expected: build succeeds with no module-resolution errors. (If this hits the same `${PORT:-3100}`-style Windows/npm-script issue seen with `npm run dev`, run `npx next build` directly instead — that issue is specific to the `dev`/`start` scripts' shell substitution, not `build`.)

- [ ] **Step 8: Commit**

```bash
git add cli/index.js lib/wizard.js lib/processor.js app/api
git rm lib/notion.js
git commit -m "refactor: repoint all consumers at lib/notion-client, remove lib/notion.js"
```
