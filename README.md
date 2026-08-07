# Notion Sync Manager (NSMA)

Multi-project development inbox processor that syncs ideas/tasks from Notion and generates development prompts for Claude Code and opencode.

## Features

- **Multi-Project Dashboard** — manage unlimited projects from a single web UI
- **Bidirectional Sync** — Notion → disk (forward sync) and disk → Notion (reverse status sync)
- **AI Prompt Generation** — Claude/Gemini-powered prompt expansion with phase assignment, effort estimation, and dependency identification
- **Inbox Triage** — review and assign unassigned Notion items to projects
- **NSMA Companion** — available as a Claude Code plugin and an opencode plugin with `/nsma-setup`, `/nsma-complete` commands and per-project triage
- **Analytics Dashboard** — sync history, throughput, and activity feeds
- **Bulk Operations** — select and sync multiple projects at once
- **Production Ready** — Docker + systemd deployment with self-update and auto-rollback

## Quick Start

Install the plugin in your project in 4 steps.

### Step 1: Clone and Install

```bash
git clone https://github.com/meggarmind/nsma.git
cd nsma
npm install               # Dashboard dependencies
cd plugin && npm install  # MCP server dependencies
cd ..
```

### Step 2: Copy Config Files Into Your Project

Copy the plugin config into the project you want to use it with:

```bash
cp opencode.json /path/to/your-project/
cp -r .opencode /path/to/your-project/
```

(Claude Code users skip this — just run `claude --plugin-dir /path/to/Nsma/plugin` from your project.)

### Step 3: Set Environment Variables

```powershell
# PowerShell (add to your $PROFILE for persistence)
$env:NSMA_NOTION_TOKEN = "ntn_your_integration_token"
$env:NSMA_NOTION_INBOX_DB_ID = "your_notion_database_id"
```

```bash
# Bash/Zsh (add to ~/.bashrc or ~/.zshrc)
export NSMA_NOTION_TOKEN="ntn_your_integration_token"
export NSMA_NOTION_INBOX_DB_ID="your_notion_database_id"
```

> **Security:** The token stays in your environment only. It is never written to disk and cannot end up in git history.

### Step 4: Bootstrap the Project

Open your project in opencode (or Claude Code with `--plugin-dir`), then run:

```
/nsma-setup
```

This creates `prompts/{pending,processed,archived,deferred}/`, writes a `.nsma-plugin.json` config file, and registers the project in your Notion NSM Project Slugs page.

**Bonus:** If your project already has a `.nsma-config.md` defining phases and modules, the setup auto-imports them. See the [example config](./.nsma-config.example.md).

## Daily Workflow

Once the project is set up, here's how a task flows through:

```
Notion Inbox                  prompts/pending/              prompts/processed/
┌──────────┐    triage        ┌──────────┐   /nsma-complete  ┌───────────┐
│ New idea │ ──────────────→  │ task.md  │ ───────────────→  │ task.md   │
│ "Not start│                 │ "In prog │                   │ (Done)    │
└──────────┘                  └──────────┘                   └───────────┘
```

### Triage (start of session / when new items arrive)

1. **Bug-family items** (Bug Fix, Documentation, Security Fix, Technical Debt) are mechanically classified with a phase and written to `prompts/pending/`. No interaction needed — they appear ready to work on.

2. **Ideation items** (Feature, Improvement, Research/Spike) need your judgment. For each one, decide the phase, priority, and module, then call the `record_triage_decision` MCP tool. The plugin generates the task file and updates Notion.

### Implement

Work on the task files in `prompts/pending/`. Each file includes the full context: phase, module, related files, dependencies, and the original Notion description.

### Mark Complete

When you finish implementing a task, run:

```
/nsma-complete <filename>
```

This does two things: updates the Notion item status to "Done", and moves the file from `prompts/pending/` to `prompts/processed/`. You run this manually when the work is actually done — it's the final "mark complete" action.

## Integration

### opencode

The `opencode.json` and `.opencode/plugin/` files you copied in Step 2 are the full integration:

- **MCP server** (`nsma-companion`) auto-starts — provides the `record_triage_decision` tool
- **Plugin module** injects NSMA triage context into each session
- **`/nsma-setup`** — first-time project bootstrap
- **`/nsma-complete`** — mark a task as done

### Claude Code

```bash
claude --plugin-dir /path/to/Nsma/plugin
```

Same `/nsma-setup`, `/nsma-complete`, and MCP server, plus a **SessionStart hook** that automatically scans the Notion inbox on every session start and mechanically classifies bug items. See [plugin/README.md](plugin/README.md) for full details.

## Adding More Projects

Once NSMA is cloned and installed, adding another project takes three steps:

1. Copy `opencode.json` and `.opencode/` into the new project
2. Create a `.nsma-config.md` defining the project's phases and modules
3. Open the project and run `/nsma-setup`

Add the project's slug to your Notion Inbox database's "Project" select property, then tag items with that slug to have them appear in triage.

## Architecture

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

### Web Dashboard Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Project cards, stats, bulk actions |
| Inbox | `/inbox` | Triage unassigned Notion items |
| Analytics | `/analytics` | Sync metrics and activity feed |
| Logs | `/logs` | Per-project sync history |
| Settings | `/settings` | Notion config, AI providers, deployment |

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
