# NSMA Companion Plugin — SessionStart Flow Design

**Date:** 2026-08-06
**Status:** Approved (pending final spec review)
**Scope:** Plan 2 of 4 from the overarching design (`docs/superpowers/specs/2026-08-06-nsma-companion-plugin-design.md`) — the plugin's interactive SessionStart flow: setup, ideation dispatch, write-back, task-file generation, bug-vs-ideation routing. Explicitly excludes the background watcher (Plan 3) and NSMA dashboard pruning (Plan 4).

## Problem

The overarching design established that per-project triage must move into a per-project Claude Code plugin, using `superpowers:brainstorming` (or another ideation method) with real project context, rather than NSMA's central, keyword-only classification. This spec works out the actual mechanics: a `SessionStart` hook is a one-shot script that runs once and exits — it cannot stay "alive" through a live brainstorming conversation and then wake up to write the result to Notion. Something has to bridge the hook's one-shot execution and the live, multi-turn ideation conversation that follows it.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How does a triage decision get written back after a live brainstorming conversation? | A bundled MCP tool (`record_triage_decision`), not a follow-up slash command — structured, typed, returns a real result rather than relying on the agent correctly formatting a command. |
| 2 | Does the write-back tool also generate the local task file? | Yes, one combined call — writes Notion properties and generates the task file atomically, so a decision can't get half-applied. |
| 3 | How do bug-type items (which skip live ideation) get Assigned Phase/Affected Module? | Port the existing deterministic classifier from `lib/prompt-generator.js`'s `determinePhase()` (module-phase mapping first, then keyword match, then default to first phase/"Backlog") into the plugin. |
| 4 | How much should the SessionStart hook do proactively vs. defer to on-demand MCP tools? | The hook does all the reading — config sync, query, bug fast-path, and prints the full non-bug item listing directly into session context. The MCP server exposes exactly one tool: the write-back. No read-side MCP tools in this plan. |

## Architecture

```
plugin/
├── .claude-plugin/plugin.json    # manifest (name: nsma-companion)
├── .mcp.json                     # declares the record_triage_decision MCP server (auto-discovered, no explicit reference needed in plugin.json — confirmed via the canvas-apps plugin's .mcp.json / plugin.json pair as a real-world reference)
├── mcp-server/index.js           # the MCP server process (stdio, Node)
├── hooks/hooks.json              # wires SessionStart (matcher startup|clear|compact)
├── hooks/session-start.js        # the hook's actual logic (Node)
├── hooks/run-hook.cmd            # cross-platform wrapper, mirrors the superpowers plugin's own pattern — this repo already hit a Windows/bash-script-portability failure once (npm run dev's ${PORT:-3100} under cmd.exe) and must not repeat it here
├── commands/nsma-setup.md        # slash command
├── commands/nsma-complete.md     # slash command
├── scripts/setup.js              # mechanical work behind /nsma-setup
├── scripts/complete.js           # mechanical work behind /nsma-complete
└── lib/                          # plugin-local logic: classifier, write-back builder, task-file writer
```

`.mcp.json` content (mirrors the real-world `canvas-apps` plugin example read during this brainstorm):
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

Reused as-is via relative import across the repo (same pattern as the dashboard already uses):
- `lib/notion-client` (Task 1 of this overarching plan — done, tested, merged).
- `lib/config-parser.js` — already exists, zero NSMA-dashboard-specific dependencies, parses `.nsma-config.md` into `{ phases, modules, modulePhaseMapping }` exactly as needed here.
- The frontmatter+markdown shape from `lib/prompt-generator.js` — relocated into the plugin's `lib/`, since it also has no dashboard-specific dependencies.

## SessionStart hook flow (`hooks/session-start.js`)

Runs on every `SessionStart` (matcher `startup|clear|compact`):

1. **Locate config.** Check for `.nsma-plugin.json` in the project root. If absent, print a one-line notice ("NSMA Companion not set up — run `/nsma-setup`") and exit cleanly — no Notion calls, no error.
2. **Config sync.** Run `ConfigParser.autoImport()` against `.nsma-config.md`, diff the resulting `phases`/`modules` against what's currently on this project's `NSM Project Slugs` entry (via `lib/notion-client`), push updates if changed. On failure: log a warning and continue with the last-known config rather than blocking the hook.
3. **Query.** `NotionClient.queryDatabase(inboxDbId, projectSlug, 'Not started')` (or the configured override IDs from `.nsma-plugin.json`). On failure: log a warning, skip the listing, let the developer proceed — never hard-fail the session.
4. **Stale-write cross-reference.** Before splitting by type, cross-reference query results against `notion_page_id` frontmatter already present in `prompts/pending/`. A match means a decision was already made locally but the Notion write didn't stick (a prior `record_triage_decision` call succeeded locally but failed remotely) — silently retry *only* the write-back for that item (reusing the write-back builder directly, no live decision needed) rather than re-queuing it for ideation.
5. **Split by type.** Remaining items: `Bug Fix | Documentation | Security Fix | Technical Debt` → bug fast path; everything else → ideation queue.
6. **Bug fast path** (mechanical, no MCP round-trip). For each bug item: run the ported classifier to get `Assigned Phase`, using the item's *existing* `Affected Module` as an input (never inventing one — that field is either already human-set at capture time or left blank). Write `Assigned Phase`, `Status → In progress` to Notion directly, generate the task file, done.
7. **Non-bug listing.** For each remaining item, print title, Notion page ID, type, module, priority, and description into the hook's stdout. Close with an explicit directive: *"For each item above, run `superpowers:brainstorming` (or plan mode, per this project's configured ideation method) to determine urgency and phase fit, then call the `record_triage_decision` MCP tool with your conclusion."*
8. **Completion safety-net scan.** Check `prompts/processed/` for files whose `notion_page_id` frontmatter doesn't match a Notion item already `Done`; for each, write `Status → Done` directly (covers missed `/nsma-complete` runs).

Steps 2, 3, 4, 6, and 8 are deterministic and unit-testable. Step 7 is formatted text — tested only for "did it include the right fields," not logic. Step 1's config-presence check keeps the hook a no-op on any project that hasn't run `/nsma-setup`, since this plugin is opt-in per project.

## MCP server (`mcp-server/index.js`)

A stdio MCP server, started once per session, reading `.nsma-plugin.json` and running `ConfigParser.autoImport()` once at startup for the same project context the hook used.

**Tool: `record_triage_decision`**

Input schema:
```json
{
  "itemId": "string (Notion page ID, from the hook's listing)",
  "phase": "string (Assigned Phase name)",
  "module": "string (Affected Module — optional, only if the conversation corrected it)",
  "type": "string (optional, only if reclassified: Feature | Improvement | Bug Fix | Technical Debt | Documentation | Research/Spike)",
  "priority": "string (Critical | High | Medium | Low | Nice to Have)",
  "rationale": "string (short paragraph — why this priority/phase, written into Analysis Notes as an audit trail)"
}
```

Behavior, in order:
1. Fetch the item's current state from Notion (`NotionClient` read) to confirm it still exists and get `title`/`type`/`description` for file generation.
2. Write back to the Notion item: `Assigned Phase`, `Affected Module` (only if provided), `Type` (only if provided), `Priority`, `Status → In progress`, `Analysis Notes: rationale`. `Suggested Phase` (the original human-authored capture field) is never written.
3. Generate the local task file (`prompts/pending/<slug>.md`) via the relocated `prompt-generator.js`-derived writer.
4. Return `{ success: true, notionUrl, filePath }` or `{ success: false, error }`. The error path is what step 4 of the hook flow (stale-write cross-reference) depends on for its retry-on-next-session behavior.

This is the only tool the server exposes in this plan — reads stay in the hook's one-shot text output (Decision #4).

## Slash commands

Both gather anything requiring judgment conversationally, then delegate mechanical work (file writes, Notion calls) to a bundled Node script — deterministic operations stay out of LLM-generated output.

**`/nsma-setup`** (`commands/nsma-setup.md`):
1. Check for an existing `.nsma-plugin.json`; if present, confirm before overwriting.
2. Run `ConfigParser.findConfigFiles()`. If `.nsma-config.md` is missing, walk the developer through defining phases/modules conversationally and write a fresh file in the existing format before continuing.
3. Determine the project slug — default to a kebab-case of the directory name, confirm with the developer (this must exactly match `NSM Inbox`'s `Project` filter values).
4. Ask the developer to pick the ideation method for this project (`brainstorming` | `plan-mode` | other) — fixed per project, per the overarching design's decision.
5. Invoke `node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js --slug=<slug> --ideation-method=<method>`, which writes/creates the `NSM Project Slugs` entry (Name, Slug, Modules, Phases) and writes `.nsma-plugin.json` with the gathered values plus defaults (`unattendedThresholdHours: 24`, task-output path `prompts/pending/`).

**`/nsma-complete`** (`commands/nsma-complete.md`, takes `$ARGUMENTS` — a filename or item title):
1. If the argument is ambiguous or omitted and multiple files exist in `prompts/pending/`, ask which one before proceeding.
2. Invoke `node ${CLAUDE_PLUGIN_ROOT}/scripts/complete.js <resolved-file-path>` — reads the file's `notion_page_id` frontmatter, moves it to `prompts/processed/`, writes `Status → Done`.

## Error handling

- No `.nsma-plugin.json` → hook exits cleanly, no Notion calls.
- Notion query/config-sync failure → log a warning, skip that step, never hard-fail the session.
- `record_triage_decision` Notion write fails → local file still generated; next session's stale-write cross-reference (hook step 4) silently retries the write, not the whole decision.
- `/nsma-complete` on a file with no matching Notion item (deleted upstream) → report the mismatch to the developer rather than silently failing the move.
- Concurrent sessions on the same project: out of scope for v1, per the overarching design.

## Testing

Unit-testable pieces only — the MCP transport wiring and hook stdout formatting are integration concerns, verified by using them, not asserted on in tests:

- Ported classifier: module-mapping-first, keyword-fallback, default-to-Backlog paths.
- Config diff (local `.nsma-config.md` vs. Notion's current select options): detects additions, no-ops when unchanged.
- `record_triage_decision`'s Notion-properties payload construction: with and without optional `module`/`type` corrections.
- Task-file writer: generated frontmatter+markdown matches expected shape for given inputs.
- Bug-vs-ideation routing: type-string matched against the bug-family list.
- Stale-write cross-reference: a `prompts/pending/` file's `notion_page_id` matching a still-`Not started` query result triggers a write-only retry, not re-queuing for ideation.
