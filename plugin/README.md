# NSMA Companion

Claude Code plugin for per-project triage — bridges Notion's NSM Inbox with your local development workflow.

## What It Does

- **SessionStart hook** — fires on every Claude Code session start: auto-imports project config, syncs with Notion, mechanically classifies bug-family items, lists ideation items for triage
- **`/nsma-setup`** — bootstraps a project for use with NSMA (creates `.nsma-plugin.json`, prompts directory structure, registers in Notion)
- **`/nsma-complete`** — marks a task done (moves file to `processed/`, updates Notion status to Done)
- **MCP server** — provides `record_triage_decision` tool so Claude can write triage decisions back to Notion during a session

## Prerequisites

| Requirement | Source |
|---|---|
| `NSMA_NOTION_TOKEN` | Notion integration secret |
| `NSMA_NOTION_INBOX_DB_ID` | Notion database ID for the NSM Inbox |
| `NSMA_NOTION_PROJECT_SLUGS_PAGE_ID` | (Optional) Existing NSM Project Slugs page ID |

The Notion token is **never persisted to disk** — it stays in the environment variable only, so it cannot accidentally end up in your project's git history.

**Notion Database Properties** — your NSM Inbox database must have these properties for the plugin's mechanical classification and triage write-back to work:

| Property | Type | Required |
|---|---|---|
| `Project` | Select | Yes |
| `Status` | Select | Yes |
| `Type` | Select | Yes |
| `Assigned Phase` | Select | Yes |
| `Priority` | Select | Yes |
| `Affected Module` | Select | No (optional for corrections) |
| `Analysis Notes` | Rich Text | No (written by triage) |

## Installation

Install the MCP server dependencies first:

```bash
cd path/to/Nsma/plugin && npm install
```

Then launch Claude Code with the `--plugin-dir` flag pointing at the plugin directory inside the NSMA repo:

```bash
claude --plugin-dir ./path/to/Nsma/plugin
```

**Important:** The plugin imports shared library code from `../../lib/` (relative to the plugin directory). It must stay inside the NSMA repo structure — copying it to `~/.claude/skills/` or elsewhere will break these imports. Standalone distribution would require bundling the shared libraries or publishing them as separate packages with a marketplace.

## Per-Project Setup

1. Ensure the environment variables are set
2. Create a `.nsma-config.md` (or `PERSPECTIVE.md`) in your project root defining phases and modules
3. Run `/nsma-setup` in Claude Code within the project

This creates:

```
your-project/
├── .nsma-plugin.json          # Plugin runtime config
├── prompts/
│   ├── pending/               # Active tasks
│   ├── processed/             # Completed tasks
│   ├── archived/              # Skipped/closed items
│   └── deferred/              # Postponed items
└── .nsma-config.md            # Phase/module definitions
```

`.nsma-plugin.json` schema:

```json
{
  "projectSlug": "myproject",
  "ideationMethod": "brainstorming",
  "notionInboxDatabaseId": "db-abc123",
  "notionProjectSlugsPageId": "page-xyz",
  "taskOutputPath": "prompts/pending",
  "taskProcessedPath": "prompts/processed",
  "unattendedThresholdHours": 24
}
```

## Daily Usage

### Session Start (Automatic)

When you open a Claude Code session:

1. The hook reads `.nsma-plugin.json` and auto-imports your project config
2. It queries Notion for inbox items tagged with your project slug and status "Not started"
3. **Bug-family items** (Bug Fix, Documentation, Security Fix, Technical Debt) are mechanically classified with phase assignment and written to both Notion and `prompts/pending/` — no interaction needed
4. **Ideation items** (Feature, Improvement, Research/Spike, etc.) are listed for you to triage
5. Failed writes from previous sessions are automatically retried (stale-write recovery)
6. `prompts/processed/` files not yet confirmed Done in Notion get a safety-net scan

### Triaging Ideation Items

For each ideation item listed at session start:

1. Run `superpowers:brainstorming` (or use Claude Code's plan mode, depending on config)
2. After deciding the item's phase, priority, and module, call the `record_triage_decision` MCP tool
3. The tool writes the decision to Notion and generates the task file in `prompts/pending/`

### Completing a Task

```
/nsma-complete <filename>
```

This:
1. Reads `notion_page_id` from the task file's frontmatter
2. Updates the Notion item's Status to "Done"
3. Moves the file from `prompts/pending/` to `prompts/processed/`

## Slash Commands

### `/nsma-setup`

Bootstraps the project for NSMA. See [Per-Project Setup](#per-project-setup).

### `/nsma-complete`

```
/nsma-complete [filename or item title]
```

If no argument is given, lists pending files and asks you to pick one.

## MCP Tools

### `record_triage_decision`

Writes a triage decision to Notion and generates the local task file.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `itemId` | string | Notion page ID |
| `phase` | string | Assigned phase name |
| `module` | string (optional) | Affected module (if correcting the original) |
| `type` | string (optional) | Item type (if reclassifying) |
| `priority` | string | Low, Medium, High, Critical |
| `rationale` | string | Reason for the decision |

**Behavior:**
- Writes the task file to `prompts/pending/` first (so a Notion failure leaves a recoverable state)
- Then updates the Notion page with Assigned Phase, Priority, Status (→ "In progress"), and Analysis Notes
- If the Notion write fails, returns `{ success: false }` but the local file exists for retry next session

## File Structure

```
plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                     # MCP server launcher config
├── package.json                  # Standalone dependencies
├── commands/
│   ├── nsma-setup.md             # /nsma-setup slash command
│   └── nsma-complete.md          # /nsma-complete slash command
├── hooks/
│   ├── hooks.json                # Hook registration (SessionStart)
│   └── session-start.js          # Hook implementation
├── lib/
│   ├── prompt-generator.js       # Task file generation with phase/effort/deps
│   ├── routing.js                # Bug vs ideation split, stale-write detection
│   └── format-listing.js         # Ideation queue formatting
├── mcp-server/
│   ├── index.js                  # MCP server entry (stdio transport)
│   └── record-triage-decision.js # Decision write-back logic
└── scripts/
    ├── setup.js                  # /nsma-setup bootstrap
    └── complete.js               # /nsma-complete handler
```

## Architecture

### Write Ordering (Finding 6)

The `recordTriageDecision` function writes the **local file first**, then updates Notion. This avoids the stranded state where Notion says "In progress" but no local file exists. If the Notion write fails, the file already exists on disk and the item will be retried next session via stale-write recovery.

### Stale-Write Recovery (Task 6)

At session start, the hook scans `prompts/pending/` for task files whose `notion_page_id` doesn't yet have an "In progress" status on Notion (indicating a prior write failure). It reconstructs the original triage decision from the file's frontmatter and retries the Notion update.

### Safety-Net Scan (Task 7)

The hook also scans `prompts/processed/` for files not yet marked `synced_to_notion: true`. For each, it checks if the Notion item is already Done — if not, it marks it Done. It then writes the `synced_to_notion` marker so future sessions skip the Notion round-trip.

### Phase Assignment

1. **Module-phase mapping** (highest priority) — if the item's module maps to a specific phase
2. **Keyword matching** — checks the item title/description against phase keywords
3. **Default fallback** — first phase or "Backlog"

During live triage, the human-assigned phase (`assignedPhase`) takes precedence over the keyword classifier (fix for Finding 2).

## Testing

```bash
# From the Nsma repo root:
npx vitest run __tests__/plugin/

# Or with the UI:
npx vitest --ui
```

**Coverage:** 10 test files, 55 tests

| Area | Test File | Tests |
|---|---|---|
| Prompt generation | `__tests__/plugin/lib/prompt-generator.test.ts` | 9 |
| Routing & stale detection | `__tests__/plugin/lib/routing.test.ts` | 8 |
| Format listing | `__tests__/plugin/lib/format-listing.test.ts` | 5 |
| Decision roundtrip | `__tests__/plugin/lib/decision-roundtrip.test.ts` | 1 |
| Record triage decision | `__tests__/plugin/mcp-server/record-triage-decision.test.ts` | 9 |
| Session start hook | `__tests__/plugin/hooks/session-start.test.ts` | 11 |
| Setup script | `__tests__/plugin/scripts/setup.test.ts` | 10 |
| Complete script | `__tests__/plugin/scripts/complete.test.ts` | 2 |

Tests use dependency injection (mock `writeFile`, `rename`, `readFile`, `mkdir`) and mock the global `fetch` for Notion API calls. Real filesystem operations use temporary directories that are cleaned up after each test.
