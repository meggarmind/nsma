# NSMA Companion Plugin — Design

**Date:** 2026-08-06
**Status:** Approved (pending final spec review)

## Problem

NSMA today is a single web dashboard + background daemon that centrally polls Notion's `NSM Inbox` database, mechanically assigns phase/effort via keyword matching (`lib/prompt-generator.js`), and writes generated task files into each registered project's `prompts/pending/` folder over the local filesystem. This central daemon has no access to any individual project's real context — its codebase, current architecture, in-flight plans, or the developer's actual judgment about urgency — so its classification is a shallow approximation.

The intended workflow is different: each Claude Code project should pull its own tagged items from `NSM Inbox`, reason about them with real in-project context (via `superpowers:brainstorming` or another ideation method), and only then decide phase/urgency/ordering. NSMA's job should be to track and visualize the resulting state across all projects, not to make the triage decisions itself.

## Goals

- Move per-project triage (ideation, classification, task-file generation) into a per-project Claude Code plugin that runs with real project context.
- Make Notion (`NSM Inbox` + `NSM Project Slugs`) the single source of truth for project registration and item state.
- Reduce NSMA to a read-only, cross-project dashboard with no local filesystem access to any project.
- Catch items that sit unattended for too long, even outside an active Claude Code session, without doing unattended classification.

## Non-goals

- Concurrent-session conflict handling (two terminals open on the same project) — out of scope for v1.
- Automatic classification with no human involved (background watcher never classifies, only flags).
- NSMA visibility into projects that override their Notion source — that's an accepted, deliberate opt-out.

## Architecture

Two artifacts in the same repository (`nsma`), both built on one shared Notion client:

```
nsma/
├── lib/notion-client/     # extracted, shared: paginated NotionClient, property parsing
├── app/ + lib/ (pruned)   # NSMA dashboard — read-only
└── plugin/                # NSMA Companion — installed per-project
```

Notion (`NSM Inbox` database + `NSM Project Slugs` page) is the only durable state for project registration and item status. Neither the dashboard nor the plugin keeps a local JSON registry of projects.

## Component: shared Notion client (`lib/notion-client/`)

Extracted from today's `lib/notion.js`. Provides paginated queries, rate limiting, and property parsing/serialization. Used read-only by the dashboard; used read+write by the plugin.

## Component: NSMA Companion plugin (`plugin/`)

- **`.claude-plugin/plugin.json`** — manifest (`nsma-companion`).
- **`hooks/hooks.json`** — wires `SessionStart` (matcher `startup|clear|compact`) to the plugin's entry point, following the cross-platform wrapper pattern used by the `superpowers` plugin (`run-hook.cmd` dispatching to a Node script), rather than a bash-only script — this repo has already hit a Windows/bash-script-portability issue once (`npm run dev`'s `${PORT:-3100}` failing under `cmd.exe`), so the plugin must not repeat it.
- **`commands/nsma-setup`** — one-time setup command. Reads `.nsma-config.md` if present (existing NSMA convention for phases/modules), otherwise prompts interactively. Writes/creates the project's entry in `NSM Project Slugs` (Name, Slug, Modules, Phases). Writes the local plugin config file.
- **`commands/nsma-complete`** — explicit completion command the developer runs when a task is done: moves the file to `prompts/processed/` and writes `Status → Done` to the Notion item immediately.
- **`.nsma-plugin.json`** (project-root config, written by setup) — `projectSlug`, `ideationMethod` (`"brainstorming" | "plan-mode" | <other>`, fixed default chosen at setup), optional `notionInboxDatabaseId` / `notionProjectSlugsPageId` overrides, local task-output path (default `prompts/pending/`, reusing the existing folder convention), `unattendedThresholdHours` (default 24) for the background watcher.
- **Ideation dispatcher** — given `ideationMethod`, invokes the corresponding skill/mode for each non-bug item. Bug-type items (`Bug Fix`, `Documentation`, `Security Fix`, `Technical Debt`) skip ideation entirely and go straight to classification + file generation, same rule NSMA uses today.
- **Notion write-back client** — applies the triage outcome to the source item: `Assigned Phase`, `Affected Module`, `Type` (if reclassified), `Priority`, `Status`, `Analysis Notes` (rationale).
- **Task-file writer** — reuses the existing frontmatter+markdown shape `lib/prompt-generator.js` produces today, so downstream tooling that understands that shape keeps working unchanged.
- **Background watch process** (`nsma-plugin watch`, or an OS scheduler invoking it — systemd user timer / `launchd` / Windows Task Scheduler depending on platform, matching the mechanism NSMA's own daemon already established) — polls this project's slice of `NSM Inbox` on an interval, flags items past an "unattended" threshold with a lightweight marker (not full classification), and fires an OS notification. Never runs ideation or writes classification — that stays exclusively in the interactive SessionStart flow, so there is exactly one place classification decisions get made.

## Data flow

### A. SessionStart (interactive)

1. Session starts in a project with the plugin installed → hook fires.
2. Plugin reads `.nsma-plugin.json` (slug, ideation method, overrides).
3. **Config sync**: diff local `.nsma-config.md` (Modules/Phases) against the project's current `NSM Project Slugs` entry; push updates if changed.
4. Query `NSM Inbox` (or override DB) filtered to `Project = <slug>`, `Status != Done`, including anything the background watcher flagged since the last session.
5. Split by type: bug-family types → step 7 directly; everything else → ideation queue.
6. For each queued item, invoke the configured ideation method live with the developer to determine phase/module fit and urgency (immediate/urgent, user-determined, or fits an existing plan phase).
7. Write back `Assigned Phase`, `Affected Module`, `Type` (if corrected), `Priority`, `Status → In progress`, `Analysis Notes` to the Notion item. `Suggested Phase` (the original human-authored capture field) is never written by the plugin — only `Assigned Phase` (the plugin's computed output) is.
8. Generate the local task file (`prompts/pending/<slug>.md`).
9. Developer works the file. On completion, they run `/nsma-complete` → immediate move + Notion `Status → Done`. As a safety net, every SessionStart also scans `prompts/processed/` for files whose Notion item isn't yet `Done` and syncs them then, covering any missed confirmations.

### B. Background watch (no session required)

1. `nsma-plugin watch` ticks on an interval (OS-scheduled).
2. Queries the same `NSM Inbox` slice for this project.
3. Finds items past the unattended threshold with no flag yet.
4. Adds a lightweight, clearly-marked flag to `Analysis Notes` (e.g. prefixed `⏳ Unattended since <date>`, distinct from the full triage rationale SessionStart writes) + fires an OS notification.
5. Does not classify or run ideation — those items get picked up by flow A next session. When SessionStart's ideation flow processes a flagged item, its full rationale write overwrites the watcher's provisional flag — SessionStart is always authoritative over the background watcher.

## NSMA dashboard changes

**Removed:**
- `lib/processor.js`, `lib/prompt-generator.js`, `lib/reverse-sync.js`, `lib/file-scanner.js`, `lib/wizard.js`, `lib/config-watcher.js`'s prompts-watching.
- Project CRUD UI: "New Project" wizard, phase/module editor, `app/projects/[id]/`.
- `projects.json` local registry, `cli/index.js` sync commands, systemd `notion-sync`/`nsma-daemon` services.
- `hooks/session-start.sh` (superseded by the plugin's own hook).

**Kept / repurposed:**
- Dashboard shell, `StatsOverview`, `ProjectCard` — now driven by a live query joining `NSM Project Slugs` (project list) with `NSM Inbox` grouped by `Project`/`Status` (counts), instead of local JSON + file scans.
- Settings page — trimmed to the Notion token; default DB/page IDs shown read-only.
- **Unassigned-items Inbox view** (`app/inbox/`) — unchanged in concept: items with no/unrecognized `Project` tag still need a human to assign one. This remains the one place NSMA still writes to Notion (setting `Project`); everything else is read-only.
- **Logs page** — repurposed from sync-run history (no longer exists) into a classification-activity feed, derived from each item's `Processed Date` / `Analysis Notes` across projects.
- **Analytics page** — kept, re-pointed at live Notion queries instead of local sync stats.

## Override behavior

A project's plugin may be configured with a different `notionInboxDatabaseId` / `notionProjectSlugsPageId` than the shared defaults. This is a deliberate opt-out: NSMA only knows about the canonical shared database/page, so an overridden project becomes invisible to the central dashboard. This is accepted, not treated as a gap to close.

## Error handling

- Notion API failure during SessionStart: never hard-fail the session — log a warning, skip the query, let the developer proceed. Missed items are picked up next successful session start.
- Notion write-back fails after ideation decided: the local task file is still generated (work isn't blocked by a transient outage); the plugin retries the write on next session start rather than silently dropping a decision that came from a real conversation.
- Background watcher failure (network, scheduler misfire): fails silently to a log file, no notification spam — the next tick catches up.
- Concurrent sessions on the same project: out of scope for v1, single active session assumed.

## Scope note for implementation planning

This spec covers one coherent system, but it has several tightly-coupled parts (shared client → write-back client → ideation flow) and one more loosely-coupled part (dashboard pruning, which only depends on the shared client existing). The implementation plan should phase this — e.g. shared client extraction first, then plugin SessionStart flow, then background watcher, then dashboard rework — rather than attempting it as one pass. This is a planning/sequencing concern for `writing-plans`, not a reason to split this into multiple specs.

## Testing

- Shared Notion client: keep/extend existing pagination + rate-limit tests.
- Plugin: unit-test the deterministic parts — config diffing, Notion write-back payload construction, task-file generation, and bug-vs-ideation routing. Ideation itself is a live skill invocation, not something to unit test.
- Dashboard: shift existing Vitest coverage from "did processor.js write the right file" to "does the stats aggregation correctly group live Notion query results by project/status."

## Decisions log (from brainstorming session)

| # | Question | Decision |
|---|---|---|
| 1 | Who generates the local task file? | The plugin, per-project, with real context — not NSMA's central daemon. |
| 2 | Does NSMA keep any local filesystem role? | No — 100% Notion-API-driven. |
| 3 | How is ideation method chosen? | Fixed default per project, set at plugin setup. |
| 4 | What does the plugin write back to a Notion item? | Assigned Phase, Affected Module, Type, Priority, Status. |
| 5 | Is override-caused dashboard invisibility acceptable? | Yes, deliberate opt-out. |
| 6 | Build approach? | Same repo, shared Notion client extracted, plugin as new package, obsolete dashboard code pruned. |
| 7 | Routine check outside a session — what should it do? | Flag + notify, never classify. |
| 8 | Where does the routine check live? | Per-project, owned by each plugin install (not centralized in NSMA). |
| 9 | How does Notion get marked Done on completion? | Explicit `/nsma-complete` command, with a SessionStart safety-net scan as backup. |
| 10 | Fate of Logs/Analytics pages? | Logs repurposed into a classification-activity feed; Analytics kept, re-pointed at live Notion data. |
