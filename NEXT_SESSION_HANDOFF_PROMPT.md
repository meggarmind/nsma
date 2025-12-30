# NSMA Session Handoff

## Project Overview

**NSMA (Notion Sync Manager)** is a multi-project development inbox processor that syncs development prompts between Notion and the local filesystem.

- **Stack**: Next.js 16 (Turbopack), React 19, Tailwind CSS
- **Storage**: JSON file-based (`~/.notion-sync-manager/`)
- **Daemon**: systemd user service for background sync
- **APIs**: Notion API for database queries, Claude API for prompt expansion

## Last Session Summary (2025-12-28)

### Completed Features

1. **Notion Pagination Fix** (`lib/notion.js:55-74`)
   - Fixed silent data truncation for Notion pages with >100 blocks
   - Implemented proper pagination loop using `has_more` and `next_cursor`

2. **Project Search & Filter** (`app/page.jsx`)
   - Search input filters projects by name or slug
   - Filter buttons for All/Active/Paused status
   - Empty state when no projects match

3. **Confirmation Modals** (`components/ui/ConfirmModal.jsx`)
   - Reusable modal replacing browser `confirm()`
   - Supports danger/warning/info variants
   - Loading state during async operations
   - Integrated in project editor for delete confirmation

4. **Sync Status Dashboard** (`components/dashboard/SyncStatusDashboard.jsx`)
   - Health badge (green/amber/red based on system state)
   - Daemon status with uptime via `systemctl --user`
   - Last sync timestamp with items processed
   - 24-hour activity metrics (syncs, items, success rate)
   - Auto-refreshes every 30 seconds
   - API endpoint: `app/api/status/route.js`

### Commit
```
9005ee6 feat: Add sync status dashboard, search/filter, modals, and pagination fix
```

## Key Architecture

```
app/
├── page.jsx              # Dashboard (search, filter, sync status)
├── inbox/page.jsx        # Inbox management
├── projects/[id]/page.jsx # Project editor
├── analytics/page.jsx    # Charts and metrics
├── logs/page.jsx         # Sync activity logs
├── settings/page.jsx     # App configuration
└── api/
    ├── sync/             # Sync triggers
    ├── projects/         # Project CRUD
    ├── inbox/            # Inbox operations
    ├── status/           # NEW: System health
    ├── analytics/        # Metrics aggregation
    └── logs/             # Activity logs

lib/
├── notion.js             # Notion API client (paginated)
├── processor.js          # Sync orchestration engine
├── reverse-sync.js       # File → Notion sync
├── storage.js            # JSON file persistence
├── analytics.js          # Metrics aggregation
└── constants.js          # Config defaults

components/
├── dashboard/
│   ├── SyncStatusDashboard.jsx  # NEW: Health panel
│   ├── SyncBanner.jsx           # Sync trigger
│   ├── StatsOverview.jsx        # Project stats
│   ├── ProjectCard.jsx          # Project tile
│   └── InboxCard.jsx            # Inbox summary
├── ui/
│   ├── ConfirmModal.jsx         # NEW: Confirmation dialog
│   ├── Modal.jsx                # Base modal
│   ├── Button.jsx               # Styled button
│   └── Card.jsx                 # Container card
└── editor/                      # Project config editors
```

## Suggested Next Tasks

### High Priority

1. **Error Retry with Exponential Backoff**
   - Location: `lib/notion.js`, `lib/processor.js`
   - Add retry logic for Notion API failures (rate limits, network errors)
   - Implement exponential backoff: 1s → 2s → 4s → 8s

2. **Structured Logging**
   - Location: `lib/storage.js` (addLog), throughout codebase
   - Add log levels (info, warn, error)
   - Include context (projectId, itemId, operation)
   - Consider adding to logs page filter by level

3. **Toast Notifications for Background Events**
   - When daemon syncs in background, show non-blocking notifications
   - Could use WebSocket or SSE for real-time updates

### Medium Priority

4. **Custom AI Prompts per Project**
   - Allow projects to customize the Claude prompt template
   - Store in project config, use in processor.js

5. **Template Library**
   - Pre-built project templates (web-app, api, cli-tool)
   - Quick-start with common phases/modules

6. **Bulk Operations**
   - Select multiple projects for batch sync/pause/delete
   - Multi-select UI in dashboard

### Low Priority

7. **Analytics Improvements**
   - Add date range picker to analytics page
   - Export metrics to CSV

8. **Keyboard Shortcuts**
   - Global shortcuts (Ctrl+S to sync, Ctrl+K for search)

## Environment Notes

- **Config Dir**: `~/.notion-sync-manager/`
- **Systemd Service**: `notion-sync.service` (user-level)
- **Default Sync Interval**: 15 minutes
- **Auto-refresh Polling**: 30 seconds (dashboard, inbox, status)

## How to Continue

```bash
cd /home/feyijimiohioma/projects/Nsma
npm run dev   # Start dev server on localhost:3000
npm run build # Verify build before commits

# Check daemon status
systemctl --user status notion-sync.service

# View logs
journalctl --user -u notion-sync.service -f
```

## Previous Session Work

- Next.js 14 → 16 upgrade with Turbopack
- Auto-refresh polling added to dashboard/inbox
- Bidirectional sync (Notion ↔ Files)
- Project wizard for CLI and Web
- Config import from existing projects
