# NSMA Dashboard Pruning & Rework — Design

**Date:** 2026-08-06
**Status:** Approved (pending final spec review)
**Scope:** Plan 4 of the overarching redesign (`docs/superpowers/specs/2026-08-06-nsma-companion-plugin-design.md`) — reducing NSMA to a read-only, cross-project dashboard driven entirely by live Notion queries. Plan 3 (background watcher) is explicitly skipped for this variation of the system — Plan 4 does not depend on it and nothing here assumes it exists.

## Problem

NSMA's dashboard, API routes, and CLI were all built around a central daemon that owned a local JSON registry (`projects.json`), local sync logs, and local file-scanning for per-project stats. Plan 1 already extracted the shared Notion client; Plan 2 already moved per-project triage into the Companion plugin, which now owns project registration (writing to `NSM Project Slugs`) and item classification directly. What's left in the dashboard — local project storage, sync-run logging, AI-assisted prompt expansion, project self-registration via API — has no remaining purpose once nothing centrally syncs anymore. The actual codebase surface here turned out considerably larger than the overarching design's original "NSMA dashboard changes" sketch anticipated (a full settings tab structure, an AI-provider stack, a chart-heavy analytics module, a self-update/deployment feature, rate limiting, daemon-status caching) — this spec reconciles all of it, not just the originally-sketched subset.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Broad bucketing of what's dead vs. orthogonal vs. kept? | Deployment/self-update + health check stay untouched (orthogonal — they update the dashboard app's own code, unrelated to Notion sync). AI/Template/Sync settings tabs, the AI-provider libs, and the registration-token project-creation flow are all removed as dead code tied to the old central pipeline. |
| 2 | How much to rebuild Analytics? | Rebuild distributions (by type, by priority, by status) and project comparison from live Notion data. Drop everything sync-run-specific (daily/weekly time series, sync frequency, error rate, most-active-project-by-syncs) — no equivalent concept exists anymore. |
| 3 | Keep an active/paused project concept? | Drop it entirely. Every project on the `NSM Project Slugs` page is by definition tracked — there's no central sync to pause. |
| 4 | Refresh/polling strategy against live Notion? | Drop the 5s status poll and daemon-running concept entirely (nothing to detect). Slow the main poll to ~60s; add a short server-side in-memory cache (~20-30s TTL) so multiple open tabs share one Notion round-trip. |
| 5 | Structural approach for the rebuilt data layer? | One shared `lib/dashboard-data.js` module owns all Notion querying, aggregation, and caching. API routes become thin wrappers — not independent per-route Notion queries. |

## Scope reconciliation (discovered during this brainstorm, not in the original sketch)

- `lib/config-watcher.js` — the original overarching spec said "remove its prompts-watching" (implying partial removal). Its actual usage is the old daemon's file-watching *and* the project editor's config-hot-reload route — both consumers are removed by this plan, so the whole file goes, not just part of it.
- `cli/index.js` and its npm scripts (`sync`, `sync:dry`, `sync:daemon`, `sync:forward`, `reverse-sync`, `reverse-sync:dry`) and the `bin` entry in `package.json` lose their entire reason to exist once projects self-manage via their own plugin instance — removed entirely, not previously called out.
- `systemd/notion-sync.service`, `systemd/nsma-daemon.service.template` — removed (the sync daemon they ran no longer exists). `systemd/nsma-web.service.template` stays — it runs the dashboard itself, unrelated to sync.
- `lib/daemon-cache.js` — caches `systemctl` status for the removed daemon. Removed.
- `lib/rate-limit.js` — checked and confirmed already unused by anything in the current codebase, independent of this redesign. Out of scope (not touched either way — removing genuinely unrelated pre-existing dead code isn't this plan's job).

## Architecture

**Removed entirely:**
- `lib/processor.js`, `lib/prompt-generator.js` (dashboard's own copy — the Companion plugin has its own, from Plan 2), `lib/reverse-sync.js`, `lib/file-scanner.js`, `lib/wizard.js`, `lib/config-watcher.js`, `lib/daemon-cache.js`
- `lib/ai-providers.js`, `lib/prompt-expander.js`, `lib/feature-dev-enhancer.js`, `lib/template-generator.js`
- `cli/index.js`, its npm scripts, and its `bin` entry in `package.json`
- `systemd/notion-sync.service`, `systemd/nsma-daemon.service.template`
- Routes: `app/api/projects/*` (register, wizard, import-config, refresh-config, reverse-sync, `[id]` CRUD), `app/api/sync/*`, `app/api/status`, `app/api/settings/sync-projects`, `app/api/settings/notion-databases` (fed a "browse all your Notion databases" picker dropdown — doesn't fit a world with one canonical shared Inbox DB + Project Slugs page), `app/api/logs/retry`
- Pages/components: `app/projects/[id]/`, `components/editor/*`, `components/wizard/AddProjectWizard.jsx`, `components/dashboard/{SyncBanner,SyncStatusDashboard}.jsx`, `components/settings/{AIConfig,TemplateConfig,SyncConfig}.jsx`, the Settings "Advanced" tab (Registration Token section + Sync-to-Notion button — both dead), `app/_components/BulkActionBar.tsx`
- `hooks/useAppData.tsx`'s status polling and `daemonRunning`/`lastSync` concepts

**Kept, untouched (orthogonal to this whole redesign):** `app/api/health`, `app/api/deployment/*`, `lib/deployment.js`, `components/settings/DeploymentConfig.jsx`, `lib/auth.js` (its `register` consumer is removed, but the `withAuth`/`verifyRegistrationToken` mechanism stays — still used by `/api/deployment/update`)

**Kept, reworked:** dashboard shell (`app/page.tsx`, `ProjectCard`, `StatsOverview`, `ProjectListControls`, `ProjectCardGrid` — active/paused filter dropped, per-card action buttons dropped since there's nothing left to trigger), `app/inbox/*`, `app/logs/page.jsx` (repurposed to an activity feed), `app/analytics/*` (distributions + comparison only), `app/settings/page.jsx` (Notion + Deployment tabs only)

**New:**
- `NotionClient.queryAllItems(databaseId)` (addition to `lib/notion-client/index.js`, Plan 1's shared client) — paginated fetch of every `NSM Inbox` item with no status/project filter, reusing `queryDatabase`'s existing pagination pattern. Needed because the dashboard must see all statuses (including `Done`) and all projects at once, which the existing `queryDatabase(dbId, projectSlug, status)` can't do (it always filters to one specific status).
- `lib/dashboard-data.js` — the shared data layer (see below).

## Data layer (`lib/dashboard-data.js`)

Built around one cached raw fetch, since every page's data ultimately derives from the same two Notion reads:

- `fetchRaw()` (internal) — cached with a ~20-30s TTL (single in-memory cache; this is a self-hosted single-instance deployment, no multi-instance cache-consistency concern). Calls a Project Slugs table read (reusing the table-parsing capability already built in Plan 2's `NotionClient.parseProjectSlugsTable`) for the project list, and `queryAllItems` for every Inbox item. One cache entry serves every dashboard page's request.
- `getDashboardProjects()` — merges the project list with items grouped by `Project`, computing per-project counts using Notion's actual `Status` values (`Not started`/`In progress`/`Done`/`Blocked`/`Deferred`) — replacing the old file-derived `{pending, processed, deferred, archived}` buckets.
- `getUnassignedItems()` — items whose `Project` value doesn't match any known slug from the Project Slugs table.
- `getAnalyticsData()` — distributions by Type/Priority/Status and per-project comparison, computed from the same grouped data. Replaces `lib/analytics.js` entirely; the old file's sync-run-specific functions (`aggregateByDay`/`aggregateByWeek`/`calculateSummary`) are dropped, not ported, since their inputs (sync-run logs) no longer exist.
- `getActivityFeed()` — items with `Processed Date` set, sorted recent-first, for the repurposed Logs page.

Every dashboard API route becomes a thin caller into one of these four public functions — none of them talk to Notion directly.

## Page-by-page rework

- **Dashboard (`app/page.tsx`)**: `ProjectCard` grid driven by `getDashboardProjects()`; `StatsOverview` aggregates totals across all projects. Active/paused filter and `BulkActionBar` removed. Each `ProjectCard` is purely informational — status breakdown + a link out to that project's items in Notion — no action buttons.
- **Inbox (`app/inbox/*`)**: `getUnassignedItems()` replaces the local-storage-backed query. The one write NSMA retains — assigning an item's `Project` field — stays, now calling `NotionClient.updatePage` directly.
- **Logs (`app/logs/page.jsx`)**: renders `getActivityFeed()` — a reverse-chronological list (title, project, phase/type, `Analysis Notes`, link to Notion). No retry buttons or sync-run grouping.
- **Analytics (`app/analytics/*`)**: exactly 4 chart types fed by `getAnalyticsData()` — by-type, by-priority, by-status distributions, project comparison. `DateRangeSelector` and the daily/weekly time-series charts are dropped. `StatCard`s show live totals instead of the old sync-run summary KPIs.
- **Settings (`app/settings/page.jsx`)**: 2 tabs — Notion and Deployment (untouched). The Notion tab keeps plain editable text fields for the token and the default `NSM Inbox` database ID / `NSM Project Slugs` page ID (same storage mechanism as today, `lib/storage.js`'s settings.json) — what's removed is only the `notion-databases`-fed "browse my databases" picker dropdown, since there's no longer a multi-database-per-project selection scenario at the dashboard level; a plain ID field is sufficient for the one canonical shared pair.
- **Polling (`hooks/useAppData.tsx`)**: status polling removed outright. Main poll interval slows to 60s (focused), matching the new cache TTL. Manual refresh action stays available.

## Error handling

- `fetchRaw()` Notion API failure: serve stale cached data (even past TTL) with a visible "may be out of date" indicator, rather than blanking the dashboard. Only show a hard error state if there's never been a successful fetch.
- Missing/invalid Notion token: existing "Notion Integration Not Configured" warning pattern stays; pages show a setup-prompt state rather than attempting queries that will fail.
- Inbox "assign project" write failure: toast error, no silently-reverted optimistic update.

## Testing

- `lib/dashboard-data.js`: unit-test the aggregation logic (status-count grouping, unassigned-item matching, distribution builders, activity-feed sort/filter) against mocked Notion responses, following the mocking pattern established in Plans 1-2.
- `NotionClient.queryAllItems`: unit-test pagination the same way `queryDatabase`'s pagination is already tested.
- Cache behavior: unit-test that `fetchRaw()` serves cached data within TTL without a new fetch, refetches after TTL expires (fake timers), and serves stale data on a failed refetch.
- API routes stay thin enough not to need independent tests beyond what `dashboard-data.js` covers — consistent with the "transport wiring is integration, not unit-tested" position from Plan 2.
