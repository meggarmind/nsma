# NSMA Companion Plugin — SessionStart Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NSMA Companion Claude Code plugin's interactive SessionStart flow — a hook that queries this project's slice of `NSM Inbox`, mechanically classifies and files bug-type items, surfaces everything else for live brainstorming, and an MCP tool that writes the resulting decision back to Notion and generates the local task file.

**Architecture:** A `SessionStart` hook (`plugin/hooks/session-start.js`) does all proactive reading — config sync, Notion query, bug fast-path — and prints the non-bug item queue as text into session context with a directive to run ideation then call an MCP tool. The MCP tool (`record_triage_decision`, `plugin/mcp-server/`) is the only write path, invoked live after a brainstorming conversation concludes. Both share plugin-local logic (`plugin/lib/`) and the already-extracted `lib/notion-client`.

**Tech Stack:** Node.js ESM, Vitest (existing conventions from Plan 1: `__tests__/**/*.test.{ts,tsx}`, `@/` alias, `global.fetch` pre-mocked in `__tests__/setup.ts`), `@modelcontextprotocol/sdk` + `zod` (new dependencies, added in Task 5).

## Global Constraints

- This is Plan 2 of 4 from `docs/superpowers/specs/2026-08-06-nsma-companion-plugin-design.md`, refined by `docs/superpowers/specs/2026-08-06-nsma-companion-plugin-sessionstart-design.md`. Scope is the interactive SessionStart flow only — no background watcher (Plan 3), no NSMA dashboard changes (Plan 4).
- The write-back mechanism is a bundled MCP tool (`record_triage_decision`), not a slash command. It performs the Notion write AND local task-file generation in one call.
- Bug-family types (`Bug Fix`, `Documentation`, `Security Fix`, `Technical Debt`) skip live ideation entirely and go through a mechanical classifier, ported from `lib/prompt-generator.js`'s `determinePhase()` (module-phase mapping first, then keyword match against title+description, then default to first phase or "Backlog").
- The hook does all proactive reading (config sync, query, bug fast-path, full non-bug listing). The MCP server exposes exactly one tool — no read-side MCP tools in this plan.
- `Suggested Phase` (the original human-authored capture field) is never written by the plugin — only `Assigned Phase` is.
- `syncProjectSlugsPage()` (existing, from Plan 1) overwrites the entire `NSM Project Slugs` table with whatever project list it's given — it must never be called with only one project's data when other projects' rows already exist on that page, or those rows are destroyed. Any code that updates this project's row must first read and merge with existing rows.
- Reuse existing, already-working code rather than reimplementing: `lib/config-parser.js` (parses `.nsma-config.md`, zero NSMA-dashboard dependencies) and `lib/notion-client` (Task 1 of the overarching plan — done, tested, merged) are both imported as-is via relative path.
- Notion property names are case-sensitive and must be preserved exactly: `Idea/Todo`, `Type`, `Affected Module`, `Suggested Phase`, `Assigned Phase`, `Status`, `Priority`, `Project`, `Detailed Description`, `Captured Date`, `Hydrated`.
- Follow existing test conventions: Vitest, `__tests__/**/*.test.{ts,tsx}`, `@/` path alias, `global.fetch` is already `vi.fn()` from `__tests__/setup.ts` — configure/reset it per test, never re-stub it.
- No placeholders: every step below contains real, runnable code.

---

### Task 1: Relocate and adapt `PromptGenerator` into the plugin

**Files:**
- Create: `plugin/lib/prompt-generator.js`
- Test: `__tests__/plugin/lib/prompt-generator.test.ts`
- Read (source of the move, do not modify): `lib/prompt-generator.js`

**Interfaces:**
- Produces: `PromptGenerator` class, constructor `(project, settings)` where `project` is `{ slug, name, phases, modules, modulePhaseMapping }` and `settings` is `{ successCriteriaTemplate? }`. Instance methods: `determinePhase(item)`, `getRelatedFiles(moduleName)`, `estimateEffort(item)`, `identifyDependencies(item)`, `generateFilename(item, phase)`, `generate(item, pageContent = null)` returning `{ content, filename, phase, effort, dependencies }`. `item` is the shape `NotionClient.parseItem()` produces (from `lib/notion-client`): `{ pageId, url, title, type, affectedModule, suggestedPhase, status, priority, project, description, capturedDate, assignedPhase, isHydrated }`.

- [ ] **Step 1: Write failing tests for the classifier and generator**

Create `__tests__/plugin/lib/prompt-generator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PromptGenerator } from '@/plugin/lib/prompt-generator';

const project = {
  slug: 'nsma',
  name: 'Nsma',
  phases: [
    { id: 'foundation', name: 'Phase 1: Foundation', keywords: ['database', 'auth', 'setup'] },
    { id: 'ui-ux', name: 'Phase 3: UI/UX', keywords: ['ui', 'component', 'css'] },
    { id: 'backlog', name: 'Backlog', keywords: ['idea', 'future'] }
  ],
  modules: [
    { id: 'core', name: 'Core Platform', filePaths: ['lib/'] }
  ],
  modulePhaseMapping: { core: 'foundation' }
};

describe('PromptGenerator.determinePhase', () => {
  const generator = new PromptGenerator(project, {});

  it('uses module-phase mapping when the item has a mapped module', () => {
    const item = { title: 'Add CSV export', description: 'export button', affectedModule: 'Core Platform' };
    expect(generator.determinePhase(item)).toBe('Phase 1: Foundation');
  });

  it('falls back to keyword matching when the module is unmapped', () => {
    const item = { title: 'Redesign the settings page css', description: 'polish the ui', affectedModule: 'Unknown Module' };
    expect(generator.determinePhase(item)).toBe('Phase 3: UI/UX');
  });

  it('defaults to the first phase when nothing matches', () => {
    const item = { title: 'Totally unrelated item', description: 'no keywords here', affectedModule: 'Unknown Module' };
    expect(generator.determinePhase(item)).toBe('Phase 1: Foundation');
  });

  it('defaults to Backlog when the project has no phases', () => {
    const emptyGenerator = new PromptGenerator({ ...project, phases: [] }, {});
    const item = { title: 'Anything', description: 'anything', affectedModule: '' };
    expect(emptyGenerator.determinePhase(item)).toBe('Backlog');
  });
});

describe('PromptGenerator.generate', () => {
  const generator = new PromptGenerator(project, {});
  const item = {
    pageId: 'page-123',
    url: 'https://notion.so/page-123',
    title: 'Add CSV export',
    type: 'Feature',
    affectedModule: 'Core Platform',
    priority: 'Medium',
    description: 'Export analytics data as CSV',
    capturedDate: '2026-01-01T00:00:00.000Z',
    isHydrated: false
  };

  it('includes correct frontmatter fields', () => {
    const { content } = generator.generate(item);
    expect(content).toContain('notion_page_id: page-123');
    expect(content).toContain('project: nsma');
    expect(content).toContain('phase: Phase 1: Foundation');
    expect(content).toContain('type: Feature');
  });

  it('directs completion to /nsma-complete instead of a manual Notion update', () => {
    const { content, filename } = generator.generate(item);
    expect(content).toContain(`/nsma-complete ${filename}`);
    expect(content).not.toContain('mcp__notion__notion-update-page');
  });

  it('uses the item description as the objective when not hydrated', () => {
    const { content } = generator.generate(item);
    expect(content).toContain('## Objective');
    expect(content).toContain('Export analytics data as CSV');
  });

  it('uses provided page content as the body when hydrated', () => {
    const hydratedItem = { ...item, isHydrated: true };
    const { content } = generator.generate(hydratedItem, '## Custom Body\nFull page content here.');
    expect(content).toContain('## Custom Body');
    expect(content).toContain('Full page content here.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/plugin/lib/prompt-generator.test.ts`
Expected: FAIL — `Cannot find module '@/plugin/lib/prompt-generator'` (the module doesn't exist yet).

- [ ] **Step 3: Create `plugin/lib/prompt-generator.js`**

Copy the full contents of `lib/prompt-generator.js` into the new file, with exactly one change — replace the "Completion Actions" section inside `generate()`. The original reads:

```js
    content += `

---

## Success Criteria
${successCriteria}

## Completion Actions
After completing this task, update Notion status:

\`\`\`
mcp__notion__notion-update-page
page_id: ${item.pageId}
command: update_properties
properties:
  Status: Done
  Processed Date: [today's date]
  Analysis Notes: "Completed by Claude Code on [date]"
\`\`\`

Then move this file to \`processed/\`:
\`\`\`bash
mv prompts/pending/${filename} prompts/processed/
\`\`\`

---
*From mobile capture: ${item.capturedDate}*
*Notion: ${item.url}*
`;
```

Replace it with:

```js
    content += `

---

## Success Criteria
${successCriteria}

## Completion Actions
When this task is done, run:

\`\`\`
/nsma-complete ${filename}
\`\`\`

This moves the file to \`processed/\` and marks the Notion item Done automatically.

---
*From mobile capture: ${item.capturedDate}*
*Notion: ${item.url}*
`;
```

Everything else in the file — `determinePhase`, `getRelatedFiles`, `estimateEffort`, `identifyDependencies`, `generateFilename`, and the rest of `generate` — is copied verbatim.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/plugin/lib/prompt-generator.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/prompt-generator.js __tests__/plugin/lib/prompt-generator.test.ts
git commit -m "feat: relocate PromptGenerator into plugin, adapt completion flow to /nsma-complete"
```

---

### Task 2: Extend `lib/notion-client` with a safe Project Slugs upsert

**Files:**
- Modify: `lib/notion-client/index.js`
- Modify: `__tests__/lib/notion-client.test.ts`

**Interfaces:**
- Consumes: `NotionClient.getPageBlocks(pageId)`, `NotionClient.prototype.syncProjectSlugsPage(databaseId, projects, existingPageId)` (both from Task 1 of the overarching plan, already merged).
- Produces: static `NotionClient.parseProjectSlugsTable(rows)` — given an array of `table_row` block objects (Notion API shape, header row included), returns `Array<{ name, slug, modules, phases }>` for all rows except the header. Instance method `upsertProjectSlugsPage(databaseId, project, existingPageId = null)` where `project` is `{ name, slug, modules, phases }` — returns whatever `syncProjectSlugsPage` returns (`{ pageId, created }`).

- [ ] **Step 1: Write failing tests**

Add to `__tests__/lib/notion-client.test.ts` (append; do not remove existing `describe` blocks):

```ts
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
```

This test file also needs `NotionClient` imported already (it is, from Task 1) — no new import line needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: FAIL — `NotionClient.parseProjectSlugsTable is not a function` and `client.upsertProjectSlugsPage is not a function`.

- [ ] **Step 3: Add the two methods to `lib/notion-client/index.js`**

Add this static method to the `NotionClient` class, near the existing `static parseItem(page)` method:

```js
  /**
   * Parse a NSM Project Slugs page's table rows (as returned by getPageBlocks on the table block's id)
   * into structured project entries, skipping the header row.
   * @param {Array} rows - table_row block objects
   * @returns {Array<{name: string, slug: string, modules: string, phases: string}>}
   */
  static parseProjectSlugsTable(rows) {
    const cellText = (cells, i) => cells?.[i]?.[0]?.plain_text || '';

    return rows.slice(1).map(row => {
      const cells = row.table_row?.cells || [];
      return {
        name: cellText(cells, 0),
        slug: cellText(cells, 1),
        modules: cellText(cells, 2),
        phases: cellText(cells, 3)
      };
    });
  }
```

Add this instance method, near the existing `syncProjectSlugsPage` method:

```js
  /**
   * Safely update this project's row on the NSM Project Slugs page without
   * clobbering other projects' rows. syncProjectSlugsPage() overwrites the
   * entire table with whatever list it's given, so this reads the current
   * table first, merges this project's row in (replacing any existing row
   * with the same slug), and writes the full merged list back.
   * @param {string} databaseId - The NSM Inbox database ID (to find parent, if creating)
   * @param {{name: string, slug: string, modules: string, phases: string}} project
   * @param {string|null} existingPageId
   * @returns {Promise<{pageId: string, created: boolean}>}
   */
  async upsertProjectSlugsPage(databaseId, project, existingPageId = null) {
    let existingProjects = [];

    if (existingPageId) {
      const pageBlocks = await this.getPageBlocks(existingPageId);
      const tableBlock = pageBlocks.find(b => b.type === 'table');
      if (tableBlock) {
        const rows = await this.getPageBlocks(tableBlock.id);
        existingProjects = NotionClient.parseProjectSlugsTable(rows);
      }
    }

    const withoutThisProject = existingProjects.filter(p => p.slug !== project.slug);
    const mergedProjects = [...withoutThisProject, project];

    return this.syncProjectSlugsPage(databaseId, mergedProjects, existingPageId);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/lib/notion-client.test.ts`
Expected: PASS — all tests green (the 3 new `upsertProjectSlugsPage` tests, the 1 new `parseProjectSlugsTable` test, plus the 7 existing tests from Plan 1).

- [ ] **Step 5: Commit**

```bash
git add lib/notion-client/index.js __tests__/lib/notion-client.test.ts
git commit -m "feat: add safe read-merge-write upsert for the Project Slugs page"
```

---

### Task 3: Bug-vs-ideation routing and stale-write detection

**Files:**
- Create: `plugin/lib/routing.js`
- Test: `__tests__/plugin/lib/routing.test.ts`

**Interfaces:**
- Produces: `splitByType(items)` → `{ bugItems: Array, ideationItems: Array }`, where `items` are `NotionClient.parseItem()`-shaped objects and the split is on `item.type`. `getPendingPageIds(promptsPendingDir)` → `Promise<Set<string>>`, reading `notion_page_id` frontmatter from every `.md` file in the given directory. `findStaleWrites(items, pendingPageIds)` → `{ stale: Array, remaining: Array }`, where `pendingPageIds` is a `Set<string>` (as returned by `getPendingPageIds`) and `stale` is every item whose `pageId` is already present in that set.

- [ ] **Step 1: Write failing tests**

Create `__tests__/plugin/lib/routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { splitByType, getPendingPageIds, findStaleWrites } from '@/plugin/lib/routing';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/plugin/lib/routing.test.ts`
Expected: FAIL — `Cannot find module '@/plugin/lib/routing'`.

- [ ] **Step 3: Create `plugin/lib/routing.js`**

```js
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const BUG_FAMILY_TYPES = ['Bug Fix', 'Documentation', 'Security Fix', 'Technical Debt'];

/**
 * Split items into the mechanical (bug-family) fast path and the live-ideation queue.
 * @param {Array<{type: string}>} items
 * @returns {{bugItems: Array, ideationItems: Array}}
 */
export function splitByType(items) {
  const bugItems = [];
  const ideationItems = [];

  for (const item of items) {
    if (BUG_FAMILY_TYPES.includes(item.type)) {
      bugItems.push(item);
    } else {
      ideationItems.push(item);
    }
  }

  return { bugItems, ideationItems };
}

/**
 * Read notion_page_id frontmatter from every .md file in a prompts/pending-style directory.
 * @param {string} promptsPendingDir
 * @returns {Promise<Set<string>>}
 */
export async function getPendingPageIds(promptsPendingDir) {
  if (!existsSync(promptsPendingDir)) {
    return new Set();
  }

  const files = await readdir(promptsPendingDir);
  const ids = new Set();

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const content = await readFile(join(promptsPendingDir, file), 'utf-8');
    const match = content.match(/^notion_page_id:\s*(.+)$/m);
    if (match) {
      ids.add(match[1].trim());
    }
  }

  return ids;
}

/**
 * Separate items that already have a local task file (Notion write must have
 * failed previously) from items that genuinely still need triage.
 * @param {Array<{pageId: string}>} items
 * @param {Set<string>} pendingPageIds
 * @returns {{stale: Array, remaining: Array}}
 */
export function findStaleWrites(items, pendingPageIds) {
  const stale = [];
  const remaining = [];

  for (const item of items) {
    if (pendingPageIds.has(item.pageId)) {
      stale.push(item);
    } else {
      remaining.push(item);
    }
  }

  return { stale, remaining };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/plugin/lib/routing.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/routing.js __tests__/plugin/lib/routing.test.ts
git commit -m "feat: add bug-vs-ideation routing and stale-write detection"
```

---

### Task 4: Triage decision write-back logic

**Files:**
- Create: `plugin/mcp-server/record-triage-decision.js`
- Test: `__tests__/plugin/mcp-server/record-triage-decision.test.ts`

**Interfaces:**
- Consumes: `NotionClient` (`lib/notion-client`, constructor `(token)`, methods `updatePage(pageId, properties)` and static `parseItem(page)`, plus a `request('GET', '/pages/{id}')`-shaped read used internally — call `client.request('GET', \`/pages/${itemId}\`)` directly, since there is no dedicated `getPage` wrapper), `PromptGenerator` (`plugin/lib/prompt-generator.js`, Task 1: constructor `(project, settings)`, method `generate(item, pageContent)`).
- Produces: `function buildTriageProperties(decision)` — pure, returns the Notion properties object for a given decision (used both here and by Task 6's stale-write retry, so a retry re-sends the full decision rather than just `Status`). `async function recordTriageDecision(decision, deps)` where `decision` is `{ itemId, phase, module?, type?, priority, rationale }` and `deps` is `{ notionClient, project, settings, writeFile }` (`writeFile` injected for testability — defaults to `fs/promises`'s `writeFile` when not provided). Returns `{ success: true, notionUrl, filePath }` or `{ success: false, error }` (never throws — errors are caught and returned so the MCP tool layer can report them without crashing the server).

- [ ] **Step 1: Write failing tests**

Create `__tests__/plugin/mcp-server/record-triage-decision.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/plugin/mcp-server/record-triage-decision.test.ts`
Expected: FAIL — `Cannot find module '@/plugin/mcp-server/record-triage-decision'`.

- [ ] **Step 3: Create `plugin/mcp-server/record-triage-decision.js`**

```js
import { writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { PromptGenerator } from '../lib/prompt-generator.js';

/**
 * Apply a live triage decision: write the properties to Notion and generate
 * the local task file. Never throws — failures are returned as
 * { success: false, error } so the MCP tool layer can report them cleanly.
 *
 * @param {{itemId: string, phase: string, module?: string, type?: string, priority: string, rationale: string}} decision
 * @param {{notionClient: NotionClient, project: object, settings: object, writeFile?: Function}} deps
 * @returns {Promise<{success: true, notionUrl: string, filePath: string} | {success: false, error: string}>}
 */
/**
 * Build the Notion properties payload for a triage decision. Pure function —
 * shared between the live write-back path (below) and the SessionStart
 * hook's stale-write retry path (Task 6), so a retry re-sends the full
 * decision, not just Status.
 * @param {{phase: string, module?: string, type?: string, priority: string, rationale: string}} decision
 * @returns {object} Notion properties object, ready for NotionClient.updatePage
 */
export function buildTriageProperties(decision) {
  const properties = {
    'Assigned Phase': { select: { name: decision.phase } },
    'Priority': { select: { name: decision.priority } },
    'Status': { select: { name: 'In progress' } },
    'Analysis Notes': { rich_text: [{ text: { content: decision.rationale } }] }
  };
  if (decision.module) {
    properties['Affected Module'] = { select: { name: decision.module } };
  }
  if (decision.type) {
    properties['Type'] = { select: { name: decision.type } };
  }
  return properties;
}

export async function recordTriageDecision(decision, deps) {
  const { notionClient, project, settings } = deps;
  const writeFile = deps.writeFile || fsWriteFile;

  let page;
  try {
    page = await notionClient.request('GET', `/pages/${decision.itemId}`);
  } catch (error) {
    return { success: false, error: `Could not read item ${decision.itemId}: ${error.message}` };
  }

  const item = NotionClient.parseItem(page);
  const properties = buildTriageProperties(decision);

  let notionError = null;
  try {
    await notionClient.updatePage(decision.itemId, properties);
  } catch (error) {
    notionError = error.message;
  }

  const generator = new PromptGenerator(project, settings);
  const generated = generator.generate({
    ...item,
    assignedPhase: decision.phase,
    affectedModule: decision.module || item.affectedModule,
    type: decision.type || item.type,
    priority: decision.priority
  });

  const promptsPendingDir = join(process.cwd(), 'prompts', 'pending');
  if (!existsSync(promptsPendingDir)) {
    await mkdir(promptsPendingDir, { recursive: true });
  }
  const filePath = join(promptsPendingDir, generated.filename);
  await writeFile(filePath, generated.content);

  if (notionError) {
    return { success: false, error: `Task file written, but Notion update failed: ${notionError}` };
  }

  return { success: true, notionUrl: item.url, filePath };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/plugin/mcp-server/record-triage-decision.test.ts`
Expected: PASS — all 7 tests green (2 for `buildTriageProperties`, 5 for `recordTriageDecision`).

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-server/record-triage-decision.js __tests__/plugin/mcp-server/record-triage-decision.test.ts
git commit -m "feat: implement triage decision write-back (Notion update + task file generation)"
```

---

### Task 5: MCP server wiring

**Files:**
- Modify: `package.json`
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/.mcp.json`
- Create: `plugin/mcp-server/index.js`

**Interfaces:**
- Consumes: `recordTriageDecision` (Task 4), `NotionClient` (`lib/notion-client`), `ConfigParser` (`lib/config-parser.js`, existing — method `autoImport()` returns `{ phases, modules, modulePhaseMapping }`).
- Produces: an MCP server process, launched by Claude Code as `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/index.js`, exposing one tool: `record_triage_decision`.

This task has no new unit tests. The transport wiring is integration code — per the spec, "the MCP transport wiring... [is an] integration concern, verified by using them, not asserted on in tests." Verification here is a syntax/import check plus a manual smoke test once the plugin is actually installed into a project (outside this plan's automated suite).

- [ ] **Step 1: Add the MCP SDK dependency**

In `package.json`, add to `"dependencies"` (keep alphabetical order with the existing entries):

```json
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.24.1",
```

Run: `npm install`
Expected: install succeeds, `node_modules/@modelcontextprotocol/sdk` and `node_modules/zod` exist.

- [ ] **Step 2: Verify the installed SDK's server API matches what this task assumes**

Run: `cat node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts | head -40` (or open that file) and confirm `McpServer` exists with a `registerTool(name, config, handler)` method, and that `node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.d.ts` exports `StdioServerTransport`. If the installed version's API differs from Step 3 below (method renamed, config shape changed), adjust Step 3's code to match what's actually installed — the tool's name, schema, and behavior are fixed by this plan; only the SDK registration call syntax may need to track the installed version.

- [ ] **Step 3: Create the plugin manifest and MCP declaration**

Create `plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "nsma-companion",
  "version": "0.1.0",
  "description": "Per-project triage companion for the NSM Inbox: brainstorms non-bug items with real project context, classifies bug items mechanically, and keeps Notion in sync.",
  "author": {
    "name": "Jimi Adewole"
  },
  "license": "MIT",
  "keywords": ["nsma", "notion", "triage", "brainstorming"]
}
```

Create `plugin/.mcp.json`:

```json
{
  "mcpServers": {
    "nsma-companion": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/index.js"]
    }
  }
}
```

- [ ] **Step 4: Create the MCP server entry point**

Create `plugin/mcp-server/index.js`:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';
import { recordTriageDecision } from './record-triage-decision.js';

async function loadPluginConfig() {
  const configPath = join(process.cwd(), '.nsma-plugin.json');
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const pluginConfig = await loadPluginConfig();
  const notionToken = process.env.NSMA_NOTION_TOKEN;
  if (!notionToken) {
    console.error('NSMA_NOTION_TOKEN is not set — the nsma-companion MCP server cannot start.');
    process.exit(1);
  }
  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());
  const { phases, modules, modulePhaseMapping } = await parser.autoImport();
  const project = {
    slug: pluginConfig.projectSlug,
    name: pluginConfig.projectName || pluginConfig.projectSlug,
    phases,
    modules,
    modulePhaseMapping
  };

  const server = new McpServer({ name: 'nsma-companion', version: '0.1.0' });

  server.registerTool(
    'record_triage_decision',
    {
      description: 'Record the outcome of a live triage conversation: writes the decision back to the Notion item and generates the local task file.',
      inputSchema: {
        itemId: z.string().describe('Notion page ID, from the SessionStart listing'),
        phase: z.string().describe('Assigned Phase name'),
        module: z.string().optional().describe('Affected Module, only if the conversation corrected it'),
        type: z.string().optional().describe('Reclassified Type, only if the conversation corrected it'),
        priority: z.enum(['Critical', 'High', 'Medium', 'Low', 'Nice to Have']),
        rationale: z.string().describe('Short paragraph: why this priority/phase')
      }
    },
    async (args) => {
      const result = await recordTriageDecision(args, { notionClient, project, settings: {} });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('nsma-companion MCP server failed to start:', error);
  process.exit(1);
});
```

- [ ] **Step 5: Verify the file is syntactically valid**

Run: `node --check plugin/mcp-server/index.js`
Expected: no output, exit code 0 (this checks syntax only — it does not execute `main()`, since the server would otherwise hang waiting on stdio; full functional verification happens once the plugin is installed into a real project in a later session).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json plugin/.claude-plugin/plugin.json plugin/.mcp.json plugin/mcp-server/index.js
git commit -m "feat: wire up the nsma-companion MCP server (record_triage_decision)"
```

---

### Task 6: SessionStart hook

**Files:**
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/hooks/session-start.js`
- Create: `plugin/hooks/run-hook.cmd`
- Create: `plugin/lib/format-listing.js`
- Test: `__tests__/plugin/lib/format-listing.test.ts`

**Interfaces:**
- Consumes: `NotionClient` (`lib/notion-client`), `ConfigParser` (`lib/config-parser.js`), `PromptGenerator` (Task 1), `splitByType`/`getPendingPageIds`/`findStaleWrites` (Task 3), `recordTriageDecision`/`buildTriageProperties` (Task 4 — `buildTriageProperties` reused directly for the stale-write retry path, so a retry re-sends the full decision, not just `Status`), `NotionClient.upsertProjectSlugsPage` (Task 2).
- Produces: `formatIdeationListing(items)` → `string` (the testable text-formatting piece). The hook script itself (`session-start.js`) is orchestration, verified manually — same rationale as Task 5's MCP wiring.

- [ ] **Step 1: Write failing tests for the listing formatter**

Create `__tests__/plugin/lib/format-listing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatIdeationListing } from '@/plugin/lib/format-listing';

describe('formatIdeationListing', () => {
  it('lists each item with its Notion page ID, type, module, priority, and description', () => {
    const items = [
      {
        pageId: 'page-123',
        title: 'Add CSV export',
        type: 'Feature',
        affectedModule: 'Analytics',
        priority: 'Medium',
        description: 'Export analytics data as CSV'
      }
    ];

    const text = formatIdeationListing(items as any);

    expect(text).toContain('Add CSV export');
    expect(text).toContain('page-123');
    expect(text).toContain('Feature');
    expect(text).toContain('Analytics');
    expect(text).toContain('Medium');
    expect(text).toContain('Export analytics data as CSV');
  });

  it('ends with a directive to run ideation then call record_triage_decision', () => {
    const text = formatIdeationListing([{ pageId: 'p', title: 't', type: 'Feature', affectedModule: '', priority: 'Low', description: '' }] as any);

    expect(text).toContain('superpowers:brainstorming');
    expect(text).toContain('record_triage_decision');
  });

  it('returns an empty-queue message when there are no items', () => {
    expect(formatIdeationListing([])).toContain('No items need triage');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/plugin/lib/format-listing.test.ts`
Expected: FAIL — `Cannot find module '@/plugin/lib/format-listing'`.

- [ ] **Step 3: Create `plugin/lib/format-listing.js`**

```js
/**
 * Format the non-bug item queue as text for SessionStart hook output.
 * @param {Array<{pageId: string, title: string, type: string, affectedModule: string, priority: string, description: string}>} items
 * @returns {string}
 */
export function formatIdeationListing(items) {
  if (items.length === 0) {
    return 'No items need triage.';
  }

  const lines = ['The following items need triage this session:', ''];

  for (const item of items) {
    lines.push(`- **${item.title}** (${item.pageId})`);
    lines.push(`  Type: ${item.type} | Module: ${item.affectedModule || 'none'} | Priority: ${item.priority}`);
    lines.push(`  ${item.description || '(no description)'}`);
    lines.push('');
  }

  lines.push(
    'For each item above, run superpowers:brainstorming (or plan mode, per this project\'s configured ideation method) ' +
    'to determine urgency and phase fit, then call the record_triage_decision MCP tool with your conclusion.'
  );

  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/plugin/lib/format-listing.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Create the hook wiring**

Create `plugin/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "shell": "bash",
            "async": false
          }
        ]
      }
    ]
  }
}
```

Create `plugin/hooks/run-hook.cmd` (cross-platform wrapper — dispatches to Node regardless of host shell, following the `superpowers` plugin's own pattern):

```bat
@echo off
node "%~dp0%1.js" %2 %3 %4 %5
```

- [ ] **Step 6: Create the hook logic**

Create `plugin/hooks/session-start.js`:

```js
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';
import { PromptGenerator } from '../lib/prompt-generator.js';
import { splitByType, getPendingPageIds, findStaleWrites } from '../lib/routing.js';
import { formatIdeationListing } from '../lib/format-listing.js';
import { recordTriageDecision, buildTriageProperties } from '../mcp-server/record-triage-decision.js';

/**
 * Find the pending file for a given Notion page ID and pull the frontmatter
 * fields needed to reconstruct a full triage decision for a retry — the
 * original write's rationale text isn't preserved locally, so a retry uses
 * a fixed placeholder for it rather than losing the rest of the decision.
 */
async function loadDecisionFromPendingFile(promptsPendingDir, pageId) {
  const files = await readdir(promptsPendingDir);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(promptsPendingDir, file), 'utf-8');
    if (!content.includes(`notion_page_id: ${pageId}`)) continue;

    const field = (name) => content.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
    return {
      phase: field('phase'),
      module: field('module'),
      type: field('type'),
      priority: field('priority'),
      rationale: 'Recovered after a previous write failure — see the task file for full context.'
    };
  }
  return null;
}

async function loadPluginConfig() {
  const configPath = join(process.cwd(), '.nsma-plugin.json');
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(await readFile(configPath, 'utf-8'));
}

async function run() {
  const pluginConfig = await loadPluginConfig();
  if (!pluginConfig) {
    console.log('NSMA Companion not set up for this project — run /nsma-setup.');
    return;
  }

  const notionToken = process.env.NSMA_NOTION_TOKEN;
  if (!notionToken) {
    console.warn('⚠️ NSMA_NOTION_TOKEN is not set — skipping this session\'s Notion sync.');
    return;
  }

  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());

  let phases = [];
  let modules = [];
  let modulePhaseMapping = {};

  try {
    ({ phases, modules, modulePhaseMapping } = await parser.autoImport());

    const modulesText = modules.map(m => m.name).join(', ');
    const phasesText = phases.map(p => p.name).join(', ');
    await notionClient.upsertProjectSlugsPage(
      pluginConfig.notionProjectSlugsDatabaseId || pluginConfig.notionInboxDatabaseId,
      { name: pluginConfig.projectName || pluginConfig.projectSlug, slug: pluginConfig.projectSlug, modules: modulesText, phases: phasesText },
      pluginConfig.notionProjectSlugsPageId || null
    );
  } catch (error) {
    console.warn(`⚠️ Config sync failed, continuing with last-known config: ${error.message}`);
  }

  const project = { slug: pluginConfig.projectSlug, name: pluginConfig.projectName || pluginConfig.projectSlug, phases, modules, modulePhaseMapping };

  let items = [];
  try {
    const inboxDbId = pluginConfig.notionInboxDatabaseId;
    const pages = await notionClient.queryDatabase(inboxDbId, pluginConfig.projectSlug, 'Not started');
    items = pages.map(page => NotionClient.parseItem(page));
  } catch (error) {
    console.warn(`⚠️ Notion query failed, skipping this session's listing: ${error.message}`);
  }

  const promptsPendingDir = join(process.cwd(), pluginConfig.taskOutputPath || 'prompts/pending');
  const pendingPageIds = await getPendingPageIds(promptsPendingDir);
  const { stale, remaining } = findStaleWrites(items, pendingPageIds);

  for (const item of stale) {
    console.log(`🔄 Retrying stale Notion write for "${item.title}"...`);
    const decision = await loadDecisionFromPendingFile(promptsPendingDir, item.pageId);
    if (!decision || !decision.phase || !decision.priority) {
      console.warn(`  Could not reconstruct the original decision from the local file — skipping retry.`);
      continue;
    }
    const properties = buildTriageProperties(decision);
    await notionClient.updatePage(item.pageId, properties).catch(err => {
      console.warn(`  Still failing: ${err.message}`);
    });
  }

  const { bugItems, ideationItems } = splitByType(remaining);

  const generator = new PromptGenerator(project, {});
  for (const item of bugItems) {
    const phase = generator.determinePhase(item);
    await recordTriageDecision(
      { itemId: item.pageId, phase, priority: item.priority || 'Medium', rationale: 'Bug-family item — mechanically classified, no live ideation needed.' },
      { notionClient, project, settings: {} }
    );
    console.log(`✅ [EXECUTE] ${item.title} (${item.type}, mechanically classified to ${phase})`);
  }

  console.log('');
  console.log(formatIdeationListing(ideationItems));

  const promptsProcessedDir = join(process.cwd(), 'prompts/processed');
  if (existsSync(promptsProcessedDir)) {
    const processedIds = await getPendingPageIds(promptsProcessedDir);
    for (const pageId of processedIds) {
      try {
        const page = await notionClient.request('GET', `/pages/${pageId}`);
        const item = NotionClient.parseItem(page);
        if (item.status !== 'Done') {
          await notionClient.updatePage(pageId, { 'Status': { select: { name: 'Done' } } });
          console.log(`✅ Synced missed completion: ${item.title}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not verify processed item ${pageId}: ${error.message}`);
      }
    }
  }
}

run().catch((error) => {
  console.error('NSMA Companion session-start hook failed:', error);
});
```

- [ ] **Step 7: Verify the hook script is syntactically valid**

Run: `node --check plugin/hooks/session-start.js`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add plugin/hooks/hooks.json plugin/hooks/session-start.js plugin/hooks/run-hook.cmd plugin/lib/format-listing.js __tests__/plugin/lib/format-listing.test.ts
git commit -m "feat: implement SessionStart hook orchestration"
```

---

### Task 7: Slash commands (`/nsma-setup`, `/nsma-complete`)

**Files:**
- Create: `plugin/commands/nsma-setup.md`
- Create: `plugin/scripts/setup.js`
- Create: `plugin/commands/nsma-complete.md`
- Create: `plugin/scripts/complete.js`
- Test: `__tests__/plugin/scripts/complete.test.ts`

**Interfaces:**
- Consumes: `NotionClient.upsertProjectSlugsPage` (Task 2), `getPendingPageIds` (Task 3, reused to locate the target file's `notion_page_id`).
- Produces: `async function completeTask(filePath, deps)` where `deps = { notionClient, promptsPendingDir, promptsProcessedDir, rename }` (`rename` injected for testability, defaults to `fs/promises`'s `rename`). Returns `{ success: true, notionUrl } | { success: false, error }`.

- [ ] **Step 1: Write failing tests for `scripts/complete.js`'s core logic**

Create `__tests__/plugin/scripts/complete.test.ts`:

```ts
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

    expect(rename).toHaveBeenCalledWith('/project/prompts/pending/task.md', '/project/prompts/processed/task.md');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/plugin/scripts/complete.test.ts`
Expected: FAIL — `Cannot find module '@/plugin/scripts/complete'`.

- [ ] **Step 3: Create `plugin/scripts/complete.js`**

```js
import { readFile as fsReadFile, rename as fsRename } from 'fs/promises';
import { basename, join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';

/**
 * Move a completed task file to processed/ and mark its Notion item Done.
 * @param {string} filePath - full path to the file in prompts/pending/
 * @param {{notionClient: NotionClient, promptsProcessedDir: string, rename?: Function, readFile?: Function}} deps
 * @returns {Promise<{success: true, notionUrl?: string} | {success: false, error: string}>}
 */
export async function completeTask(filePath, deps) {
  const { notionClient, promptsProcessedDir } = deps;
  const readFile = deps.readFile || fsReadFile;
  const rename = deps.rename || fsRename;

  const content = await readFile(filePath, 'utf-8');
  const match = content.match(/^notion_page_id:\s*(.+)$/m);
  if (!match) {
    return { success: false, error: `No notion_page_id found in frontmatter of ${filePath}` };
  }

  const pageId = match[1].trim();

  try {
    await notionClient.updatePage(pageId, { 'Status': { select: { name: 'Done' } } });
  } catch (error) {
    return { success: false, error: `Notion update failed: ${error.message}` };
  }

  const destination = join(promptsProcessedDir, basename(filePath));
  await rename(filePath, destination);

  return { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/plugin/scripts/complete.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Create `plugin/scripts/setup.js`**

```js
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { NotionClient } from '../../lib/notion-client/index.js';
import { ConfigParser } from '../../lib/config-parser.js';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, 'ideation-method': ideationMethod } = args;

  if (!slug || !ideationMethod) {
    console.error('Usage: setup.js --slug=<project-slug> --ideation-method=<brainstorming|plan-mode>');
    process.exit(1);
  }

  const notionToken = process.env.NSMA_NOTION_TOKEN;
  const inboxDbId = process.env.NSMA_NOTION_INBOX_DB_ID;
  const projectSlugsPageId = process.env.NSMA_NOTION_PROJECT_SLUGS_PAGE_ID || null;

  if (!notionToken || !inboxDbId) {
    console.error('NSMA_NOTION_TOKEN and NSMA_NOTION_INBOX_DB_ID must be set in the environment.');
    process.exit(1);
  }

  const notionClient = new NotionClient(notionToken);
  const parser = new ConfigParser(process.cwd());
  const { phases, modules } = await parser.autoImport();

  const modulesText = modules.map(m => m.name).join(', ');
  const phasesText = phases.map(p => p.name).join(', ');

  const { pageId } = await notionClient.upsertProjectSlugsPage(
    inboxDbId,
    { name: slug, slug, modules: modulesText, phases: phasesText },
    projectSlugsPageId
  );

  // notionToken is deliberately NOT persisted here — it stays in the
  // NSMA_NOTION_TOKEN environment variable only, so it never ends up
  // committed to the project's git history via .nsma-plugin.json.
  const pluginConfig = {
    projectSlug: slug,
    ideationMethod,
    notionInboxDatabaseId: inboxDbId,
    notionProjectSlugsPageId: pageId,
    taskOutputPath: 'prompts/pending',
    unattendedThresholdHours: 24
  };

  const promptsDirs = ['prompts/pending', 'prompts/processed', 'prompts/archived', 'prompts/deferred'];
  for (const dir of promptsDirs) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true });
    }
  }

  await writeFile(join(process.cwd(), '.nsma-plugin.json'), JSON.stringify(pluginConfig, null, 2));

  console.log(`✅ NSMA Companion set up for "${slug}" (ideation method: ${ideationMethod}).`);
  console.log(`   Project Slugs page: ${pageId}`);
}

main().catch((error) => {
  console.error('nsma-setup failed:', error);
  process.exit(1);
});
```

- [ ] **Step 6: Verify `setup.js` is syntactically valid**

Run: `node --check plugin/scripts/setup.js`
Expected: no output, exit code 0.

- [ ] **Step 7: Create the two slash command files**

Create `plugin/commands/nsma-setup.md`:

```markdown
---
description: Set up the NSMA Companion plugin for this project
---

# NSMA Companion Setup

1. Check whether `.nsma-plugin.json` already exists in the project root. If it does, confirm with the developer before continuing (setup will overwrite it).

2. Look for `.nsma-config.md` (or the other supported config filenames `ConfigParser` checks: `.nsma/config.md`, `PERSPECTIVE.md`, `ARCHITECTURE.md`, `PROJECT_CONFIG.md`). If none exist, have a natural conversation with the developer to define this project's development phases and modules, then write a `.nsma-config.md` in the project root following the existing format (see `.nsma-config.example.md` in the NSMA repo for the exact structure: `## Development Phases` with `### Phase Name` sections containing `**ID**`, `**Description**`, `**Keywords**`, `**Priority**`; `## Modules` with `### Module Name` sections containing `**ID**`, `**Paths**`, `**Phase**`).

3. Determine the project slug: default to a kebab-case version of the current directory name, and confirm it with the developer — this must exactly match the value used to tag this project's items in the `NSM Inbox` database's `Project` field.

4. Ask the developer which ideation method this project should use by default: `brainstorming` (runs `superpowers:brainstorming` on each non-bug item) or `plan-mode` (uses Claude Code's built-in plan mode instead). This choice is fixed per project until setup is re-run.

5. Ensure `NSMA_NOTION_TOKEN` and `NSMA_NOTION_INBOX_DB_ID` are set in the environment (ask the developer where to find these if not already configured — typically the same Notion integration token and database ID used by the NSMA dashboard). Optionally `NSMA_NOTION_PROJECT_SLUGS_PAGE_ID` if the page already exists and its ID is known.

6. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js --slug=<slug> --ideation-method=<method>`

7. Report the result to the developer, including the `NSM Project Slugs` page link.
```

Create `plugin/commands/nsma-complete.md`:

```markdown
---
description: Mark a task complete, moving it to processed/ and updating Notion
argument-hint: <filename or item title>
---

# NSMA Task Complete

The developer has finished a task and wants to mark it done.

1. If `$ARGUMENTS` is empty or doesn't clearly match a file, list the `.md` files in `prompts/pending/` and ask the developer which one they mean.

2. Once resolved to a specific file path, run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/complete.js <resolved-file-path>`

3. Report success (the file moved to `prompts/processed/`, Notion marked Done) or the specific error if it failed — e.g. if the file's Notion item no longer exists, tell the developer and ask how they want to proceed rather than silently leaving the file in place.
```

- [ ] **Step 8: Commit**

```bash
git add plugin/commands/nsma-setup.md plugin/commands/nsma-complete.md plugin/scripts/setup.js plugin/scripts/complete.js __tests__/plugin/scripts/complete.test.ts
git commit -m "feat: add /nsma-setup and /nsma-complete slash commands"
```
