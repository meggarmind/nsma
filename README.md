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

> This walkthrough uses the NSMA project itself as the sample. By the end, you'll have the plugin running in your AI coding agent on this repo.

### Step 1: Clone and Install

```bash
git clone https://github.com/meggarmind/nsma.git
cd nsma
npm install               # Web dashboard dependencies
cd plugin && npm install  # MCP server dependencies
cd ..
```

### Step 2: Configure Environment

Copy the example env file and fill in your Notion credentials:

```bash
cp .env.example .env
```

Edit `.env` — you need:
- `NOTION_TOKEN` — your Notion integration secret (get one at https://www.notion.so/my-integrations)
- `NOTION_DATABASE_ID` — the ID of your NSM Inbox database
- `REGISTRATION_TOKEN` — any UUID (generate with `uuidgen` on Linux/Mac, `[guid]::NewGuid()` on PowerShell)

Export the plugin environment variables in your shell profile:

**Bash/Zsh:**
```bash
export NSMA_NOTION_TOKEN="ntn_your_token_here"
export NSMA_NOTION_INBOX_DB_ID="your_database_id_here"
```

**PowerShell:**
```powershell
$env:NSMA_NOTION_TOKEN = "ntn_your_token_here"
$env:NSMA_NOTION_INBOX_DB_ID = "your_database_id_here"
```

> **Security:** The Notion token is read from environment variables only. It is never written to any config file, so it cannot end up in your git history.

### Step 3: Launch the Dashboard (Optional)

```bash
npm run dev
```

Open http://localhost:3100 — manage projects, view analytics, and browse the inbox. The plugin works with or without the dashboard running.

### Step 4: Set Up the Plugin

The repo ships with an `opencode.json` config and `.opencode/plugin/` already in place — it's ready to use immediately. Choose your agent:

**opencode (built-in):**

The plugin loads automatically on session start. Run `/nsma-setup` to bootstrap the project:

```
/nsma-setup
```

This creates `prompts/{pending,processed,archived,deferred}/`, writes `.nsma-plugin.json`, and registers the project in Notion.

**Claude Code:**

```bash
claude --plugin-dir ./plugin
```

Then run `/nsma-setup` in the session.

### Step 5: Daily Workflow

Each time you open a session in this project:

1. **Bug-family items** (Bug Fix, Documentation, Security Fix, Technical Debt) are mechanically classified and written to `prompts/pending/` — no interaction needed (Claude Code: SessionStart hook; opencode: plugin injects context, run pending items list manually)
2. **Ideation items** (Feature, Improvement, Research/Spike) need your triage — determine phase, priority, and module, then call the `record_triage_decision` MCP tool with your conclusion
3. **When a task is done** — run `/nsma-complete <filename>` to move it to `prompts/processed/` and mark it Done in Notion

### Adding Other Projects

1. Create a `.nsma-config.md` in the project root defining its phases and modules (see [example](./.nsma-config.example.md))
2. Copy the opencode config files into the project:
   ```bash
   cp opencode.json /path/to/your/project/
   cp -r .opencode /path/to/your/project/
   ```
3. Open the project in opencode, or launch Claude Code:
   ```bash
   claude --plugin-dir /path/to/Nsma/plugin
   ```
4. Run `/nsma-setup`
5. Add the project's slug as an option in your Notion Inbox database's "Project" select property
6. Tag Notion items with the slug to have them appear in triage scans

## Integration

### opencode

The `opencode.json` config and `.opencode/plugin/` ship with this repo and activate automatically when you open the project in opencode:

- **MCP server** (`nsma-companion`) auto-starts — provides the `record_triage_decision` tool
- **Plugin module** injects NSMA triage context into each session
- **`/nsma-setup`** — bootstraps the project (creates prompts dirs, writes `.nsma-plugin.json`, registers in Notion)
- **`/nsma-complete`** — marks a task Done in Notion and moves the file to `processed/`

To use in other projects, copy `opencode.json` and `.opencode/` into that project:
```bash
cp opencode.json /path/to/your/project/
cp -r .opencode /path/to/your/project/
```

### Claude Code

```bash
cd plugin && npm install
claude --plugin-dir ./path/to/plugin
```

Provides the same `/nsma-setup`, `/nsma-complete`, MCP server, plus a **SessionStart hook** that automatically scans the Notion inbox and mechanically classifies bug-family items. See [plugin/README.md](plugin/README.md) for details.

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
