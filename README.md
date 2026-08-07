# Notion Sync Manager (NSMA)

Multi-project development inbox processor that syncs ideas/tasks from Notion and generates development prompts for Claude Code.

## Features

- **Multi-Project Dashboard** — manage unlimited projects from a single web UI
- **Bidirectional Sync** — Notion → disk (forward sync) and disk → Notion (reverse status sync)
- **AI Prompt Generation** — Claude/Gemini-powered prompt expansion with phase assignment, effort estimation, and dependency identification
- **Inbox Triage** — review and assign unassigned Notion items to projects
- **NSMA Companion Plugin** — Claude Code plugin with `/nsma-setup`, `/nsma-complete` slash commands and per-project triage
- **Analytics Dashboard** — sync history, throughput, and activity feeds
- **Bulk Operations** — select and sync multiple projects at once
- **Production Ready** — Docker + systemd deployment with self-update and auto-rollback

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Access dashboard at: http://localhost:3100

### 3. Configure Notion Integration

1. Go to **Settings** → **Notion**
2. Enter your Notion integration token
3. Enter your Notion database ID
4. Add your project slug as an option in the Notion database's "Project" select property

### 4. Add Your First Project

1. Click **"New Project"** on the dashboard
2. Enter:
   - **Name** — Your project's display name
   - **Slug** — must match the Notion "Project" property value
   - **Prompts Path** — where prompt files should live (must end with `/prompts`)
3. Configure phases and modules (or auto-import from a config file)

### 5. Install the NSMA Companion Plugin (Claude Code)

First, install the plugin's MCP dependencies:

```bash
cd plugin && npm install
```

Then launch Claude Code with the plugin loaded (from any project directory):

```bash
claude --plugin-dir /path/to/Nsma/plugin
```

This enables `/nsma-setup` and `/nsma-complete` slash commands plus automatic inbox scanning on session start.

> **Note:** The plugin must stay inside the NSMA repo — it imports shared libraries from `../../lib/` relative to the plugin directory.

## Architecture

### Storage

All configuration lives in `~/.notion-sync-manager/`:

```
~/.notion-sync-manager/
├── settings.json      # Global settings (Notion token, database ID)
├── projects.json      # All project configurations
└── sync-logs.json     # Sync history
```

### Per-Project Structure

```
~/projects/MyProject/
├── prompts/
│   ├── pending/       # Active prompts to process
│   ├── processed/     # Completed tasks
│   ├── archived/      # Closed items
│   └── deferred/      # Postponed items
└── .nsma-config.md    # Phase/module configuration (optional)
```

### Notion Database Properties

| Property | Type | Description |
|----------|------|-------------|
| Idea/Todo | Title | Task title |
| Project | Select | Project slug (e.g. "myproject") |
| Type | Select | Feature, Bug Fix, Improvement, etc. |
| Status | Select | Not started, In progress, Done, etc. |
| Priority | Select | High, Medium, Low |
| Affected Module | Select | Which module is impacted |
| Suggested Phase | Select | User's phase suggestion |
| Assigned Phase | Select | Auto-assigned by processor |
| Detailed Description | Rich Text | Full description |
| Hydrated | Checkbox | Use page body as prompt content |
| Estimated Effort | Select | XS, S, M, L, XL |
| Generated Prompt Location | URL | Path to generated file |

## Web Dashboard Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Project cards, stats, bulk actions |
| Inbox | `/inbox` | Triage unassigned Notion items |
| Analytics | `/analytics` | Sync metrics and activity feed |
| Logs | `/logs` | Per-project sync history |
| Settings | `/settings` | Notion config, AI providers, deployment |

## Claude Code Integration (NSMA Companion Plugin)

The plugin (`plugin/`) provides:

- **`/nsma-setup`** — generates the project-specific setup prompt from your NSMA config
- **`/nsma-complete`** — marks items done, moves files to `processed/`, and updates Notion
- **SessionStart hook** — runs on Claude Code session start, summarizes pending inbox items
- **MCP server** — records triage decisions (brainstorm vs classify) back to Notion

## Prompt Generation

### Phase Assignment Logic

1. **Module Mapping** (highest priority) — direct module → phase links
2. **Keyword Matching** — searches text for phase-specific keywords
3. **Default Fallback** — uses first phase or "Backlog"

### AI Prompt Expansion

Optionally expand prompts using Claude or Gemini:

- Analyses item description, type, and affected modules
- Adds architecture context, file paths, and implementation guidance
- `feature-dev` mode: deep architecture analysis for feature-type items

### Always-Execute Types

These types sync regardless of current phase:
- Bug Fix
- Documentation
- Security Fix
- Technical Debt

## Production Deployment

### Docker

```bash
docker compose up -d
```

### systemd (Manual Setup)

```bash
./scripts/setup-prod.sh --install-dir=~/apps/nsma-prod --port=5100
```

### Self-Update

From **Settings → Deployment** you can check for updates and apply them. Failed builds auto-rollback.

## Per-Project Configuration (Optional)

Place a `.nsma-config.md`, `PERSPECTIVE.md`, or `ARCHITECTURE.md` in your project root:

```markdown
---
version: "1.0"
project_type: "web_application"
---

## Development Phases

### Phase 1: Foundation
- **Description**: Core infrastructure
- **Keywords**: database, auth, setup

### Backlog
- **Priority**: 99

## Modules

### Authentication
- **Paths**:
  - src/auth/
- **Phase**: Phase 1: Foundation
```

Auto-import via "Check for Config Files" in the project editor.

## Project Structure

```
Nsma/
├── app/                      # Next.js App Router pages & API routes
│   ├── page.tsx              # Dashboard
│   ├── inbox/                # Inbox triage
│   ├── analytics/            # Sync analytics
│   ├── logs/                 # Sync history
│   ├── settings/             # Global settings
│   └── api/                  # REST API endpoints
├── components/               # React components
│   ├── ui/                   # Button, Card, Input, Modal, Toast, etc.
│   ├── dashboard/            # ProjectCard, StatsOverview, SyncBanner
│   ├── inbox/                # Inbox components
│   ├── analytics/            # Analytics components
│   └── settings/             # Config forms
├── lib/                      # Core business logic
│   ├── notion-client/        # Notion API client (standalone, tested)
│   ├── storage.js            # JSON file persistence (atomic writes)
│   ├── processor.js          # Sync orchestrator
│   ├── prompt-generator.js   # Markdown prompt creation
│   ├── prompt-expander.js    # AI prompt expansion
│   ├── reverse-sync.js       # File → Notion status sync
│   ├── dashboard-data.js     # Cached Notion data layer
│   └── analytics.js          # Sync metrics aggregation
├── plugin/                   # NSMA Companion (Claude Code plugin)
│   ├── commands/             # /nsma-setup, /nsma-complete
│   ├── hooks/                # SessionStart hook
│   ├── mcp-server/           # Triage decision MCP server
│   └── lib/                  # Plugin libraries
├── types/                    # TypeScript type definitions
├── __tests__/                # Vitest test suite
├── C4-Documentation/         # Architecture docs
└── scripts/                  # setup-prod.sh, migrate.sh
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS (dark theme) |
| Icons | Lucide React |
| Charts | Recharts |
| Storage | JSON files (`~/.notion-sync-manager/`) |
| AI/LLM | Anthropic Claude SDK, Google Gemini SDK |
| Notion API | @notionhq/client (via custom wrapper) |
| Testing | Vitest + React Testing Library + happy-dom |
| Runtime | Node.js 18+ |
| Deployment | Docker + systemd user services |

## Troubleshooting

### No prompts syncing
1. Check Notion token in Settings
2. Verify database ID matches your Notion database
3. Ensure project slug matches Notion "Project" property exactly
4. Check project is marked as "Active"

### Dashboard shows wrong stats
Click **Refresh Stats** — stats are cached and only auto-update after syncs.

### Build error in assign route
A known `PageNotFoundError` may occur at build time in `app/api/inbox/[itemId]/assign/route.js`. The dev server and API work correctly — this is a build-time only issue under investigation.

## Development

```bash
npm run dev            # Start dev server (port 3100)
npm run build          # Production build
npm start              # Production server
npm test               # Run tests
npm run test:ui        # Test UI
npm run test:coverage  # Test coverage
npm run lint           # Lint
```

---

**Version**: 1.0.0
**License**: MIT
