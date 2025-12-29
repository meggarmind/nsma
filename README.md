# Notion Sync Manager (NSMA)

Multi-project development inbox processor that syncs ideas/tasks from Notion and generates development prompts for Claude Code.

## Features

- **Multi-Project Management**: Manage unlimited projects from one dashboard
- **GUI Configuration**: Web-based interface for project setup (no more JSON editing!)
- **Smart Phase Assignment**: Automatically routes tasks using module mapping and keyword detection
- **Clean Folder Structure**: Nested `prompts/{pending,processed,archived,deferred}` reduces root clutter
- **Background Sync**: systemd daemon for automated synchronization
- **Session Integration**: Claude Code hook analyzes prompts on startup

## Quick Start

### 1. Install Dependencies

```bash
cd /home/feyijimiohioma/projects/Nsma
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Access dashboard at: http://localhost:3100

### 3. Configure Notion Integration

1. Go to Settings page
2. Enter your Notion integration token
3. Enter your Notion database ID (from your database URL)

### 4. Add Your First Project

1. Click "New Project" on dashboard
2. Enter:
   - **Name**: Residio
   - **Slug**: residio (must match Notion "Project" property)
   - **Path**: /home/feyijimiohioma/projects/Residio/prompts
3. Configure phases and modules in project editor

### 5. Run Migration (for existing projects)

```bash
./scripts/migrate.sh /home/feyijimiohioma/projects/Residio
```

### 6. Test Sync

```bash
npm run sync:dry  # Preview changes
npm run sync      # Run actual sync
```

## Architecture

### Storage

All configuration lives in `~/.notion-sync-manager/`:

```
~/.notion-sync-manager/
├── settings.json      # Global settings (Notion token, sync interval)
├── projects.json      # ALL project configurations
└── sync-logs.json     # Sync history
```

### Per-Project Structure

```
~/projects/Residio/
└── prompts/
    ├── pending/      # New prompts from sync
    ├── processed/    # Completed tasks
    ├── archived/     # Closed items
    └── deferred/     # Postponed items
```

### Notion Database Properties

| Property | Type | Description |
|----------|------|-------------|
| Idea/Todo | Title | Task title |
| Project | Select | Project slug (e.g., "residio") |
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

## Usage

### Web Dashboard

```bash
npm run dev        # Development (port 3100)
npm run build      # Production build
npm start          # Production server
```

### CLI Commands

```bash
npm run sync                       # Sync all active projects
npm run sync:dry                   # Preview without changes
npm run sync -- --project residio  # Sync specific project
npm run sync:daemon                # Run continuously
```

### CLI Options

```
--project <slug>   Process only this project (by slug, name, or id)
--dry-run          Preview changes without writing files
--daemon           Run continuously at configured interval
--verbose, -v      Show detailed output
--help, -h         Show help message
```

## Production Deployment

NSMA supports running separate development and production instances simultaneously.

### Quick Setup

```bash
# Run the production setup script
./scripts/setup-prod.sh --install-dir=~/projects/nsma-prod --port=5100 --instance=prod
```

This will:
1. Clone the repo to `~/projects/nsma-prod`
2. Install dependencies and build
3. Create and enable systemd user services
4. Start production on port 5100

### Multi-Instance Architecture

| Instance | Port | Directory | Services |
|----------|------|-----------|----------|
| Development | 3100 | `~/projects/Nsma` | Manual (`npm run dev`) |
| Production | 5100 | `~/projects/nsma-prod` | systemd (`nsma-daemon-prod`, `nsma-web-prod`) |

Both instances share the same config directory (`~/.notion-sync-manager/`).

### Self-Update Feature

Production instances can update themselves from the web UI:

1. Go to **Settings → Deployment**
2. Click **Check Updates** to see available commits
3. Click **Update Now** to pull, build, and restart

Updates include **auto-rollback** — if the build fails, changes are automatically reverted.

### Setup Script Options

```bash
./scripts/setup-prod.sh [options]

Options:
  --install-dir=PATH    Installation directory (default: ~/projects/nsma-prod)
  --port=PORT           Web server port (default: 5100)
  --instance=NAME       Instance name (default: prod)
  --config-dir=PATH     Config directory (default: ~/.notion-sync-manager)
  --skip-clone          Skip git clone (for updating existing install)
  --skip-build          Skip npm install and build
```

## systemd Services

### Service Architecture

NSMA uses two separate systemd user services:
- `nsma-daemon-{instance}` — Background sync daemon
- `nsma-web-{instance}` — Next.js web server

### Manual Installation (Alternative)

If not using `setup-prod.sh`:

```bash
# Copy service templates
mkdir -p ~/.config/systemd/user

# Edit templates and replace placeholders, then:
systemctl --user daemon-reload
systemctl --user enable nsma-daemon-prod nsma-web-prod
systemctl --user start nsma-daemon-prod nsma-web-prod

# Enable services to start on boot (WSL2)
loginctl enable-linger $USER
```

### Check Status

```bash
systemctl --user status nsma-daemon-prod
systemctl --user status nsma-web-prod
journalctl --user -u nsma-web-prod -f  # Follow logs
```

### Legacy Service (Single Instance)

For backward compatibility, the old `notion-sync.service` still works:

```bash
sudo cp systemd/notion-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable notion-sync
sudo systemctl start notion-sync
```

## Claude Code Integration

### Session Start Hook

Copy the universal hook to your project:

```bash
cp hooks/session-start.sh /home/feyijimiohioma/projects/Residio/.claude/hooks/
chmod +x /home/feyijimiohioma/projects/Residio/.claude/hooks/session-start.sh
```

This hook:
- Runs Notion sync on session start
- Analyzes pending prompts for phase alignment
- Identifies tasks needing decisions
- Checks deferred prompts for re-activation

## Configuration Guide

### Phase Configuration

Phases represent development stages:

```javascript
{
  "name": "Phase 1: Billing Core",
  "description": "Core billing functionality",
  "keywords": ["billing", "payment", "invoice"]
}
```

### Module Configuration

Modules map to code areas:

```javascript
{
  "name": "Billing System",
  "filePaths": [
    "src/actions/billing/",
    "src/components/billing/"
  ]
}
```

### Module-Phase Mapping

Direct mapping takes priority over keywords:

```javascript
{
  "modulePhaseMapping": {
    "billing-module-id": "phase-1-id"
  }
}
```

## Prompt Generation

### Phase Assignment Logic

1. **Module Mapping** (highest priority) - Direct module→phase links
2. **Keyword Matching** - Searches text for phase-specific keywords
3. **Default Fallback** - Uses first phase or "Backlog"

### Effort Estimation

Automatic scoring based on:
- Task type (Feature=3, Bug Fix=1, etc.)
- Description length (>500 chars adds weight)

### Always-Execute Types

These types execute regardless of phase:
- Bug Fix
- Documentation
- Security Fix
- Technical Debt

## Migration from Python Scripts

### 1. Extract Configuration

From `residio_inbox_processor.py`:
- Database ID: `0f46cdeb58f64ee5b419a4dcd145752d` (or use new one)
- Project slug: `residio`
- Phase definitions and keywords

### 2. Run Migration Script

```bash
./scripts/migrate.sh /home/feyijimiohioma/projects/Residio
```

### 3. Verify Structure

```bash
ls -la /home/feyijimiohioma/projects/Residio/prompts/
```

Should show: `pending/`, `processed/`, `archived/`, `deferred/`

### 4. Deprecate Python Scripts

After 1 month of successful NSMA operation:
```bash
mv /home/feyijimiohioma/mobile-first-notion-workflow/ ~/backup/
```

## Troubleshooting

### No prompts syncing

1. Check Notion token in Settings
2. Verify database ID matches your Notion database
3. Ensure project slug matches Notion "Project" property exactly
4. Check project is marked as "Active"

### CLI not found in session hook

Update path in `session-start.sh`:
```bash
NSMA_CLI="/home/feyijimiohioma/projects/Nsma/cli/index.js"
```

### Systemd service not starting

```bash
sudo journalctl -u notion-sync -n 50  # Check logs
sudo systemctl status notion-sync     # Check status
```

Common issues:
- Node.js not installed: `sudo apt install nodejs`
- Wrong working directory in service file
- Permissions on CLI script

### Prompts path configuration

**IMPORTANT**: The prompts path must end with `/prompts`. Example:
- Correct: `/home/user/projects/Residio/prompts`
- Wrong: `/home/user/projects/Residio/` (will create folders in project root)

The system will auto-correct paths that don't end with `/prompts`, but it's best to configure it correctly from the start.

### Dashboard shows wrong stats

If the dashboard shows different counts than what's on disk (e.g., shows 3 pending but disk has 7 files):
1. Click the refresh icon next to "Last sync" on the project card
2. Or click "Refresh Stats" in the Overview section
3. Stats are automatically refreshed after each sync

**Why this happens**: Stats are cached and only update after syncs. Manual file moves won't be reflected until you refresh.

## Development

### Project Structure

```
Nsma/
├── app/                    # Next.js pages
│   ├── api/               # REST API routes
│   ├── projects/[id]/     # Project editor
│   ├── settings/          # Global settings
│   └── logs/              # Sync history
├── components/            # React components
│   ├── ui/               # Basic UI (Button, Input, etc.)
│   ├── layout/           # Sidebar, Header
│   ├── dashboard/        # ProjectCard, Stats
│   ├── editor/           # Phase/Module editors
│   └── settings/         # Config forms
├── lib/                   # Core logic
│   ├── constants.js      # Defaults and enums
│   ├── storage.js        # JSON file operations
│   ├── notion.js         # Notion API client
│   ├── prompt-generator.js  # Prompt creation
│   └── processor.js      # Sync orchestration
├── cli/                   # Command-line tool
├── systemd/               # Service file
├── hooks/                 # Claude Code hooks
└── scripts/               # Migration utilities
```

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS (dark theme)
- **Icons**: Lucide React
- **Storage**: JSON files
- **Runtime**: Node.js 18+
- **Deployment**: systemd user services (WSL2/Linux)

## New Project Onboarding Guide

Complete step-by-step guide for registering new projects with NSMA.

### Prerequisites

Before starting, ensure:
1. **NSMA is installed** at `/home/feyijimiohioma/projects/Nsma`
2. **Node.js 18+** is available
3. **Notion integration** is set up with API token
4. **NSMA settings configured** at `~/.notion-sync-manager/settings.json`

### Step 1: Create Project Configuration File

Create `.nsma-config.md` in your project root:

```markdown
---
version: "1.0"
project_type: "web_application"
auto_import: true
---

# Project Configuration: YourProjectName

## Development Phases

### Phase 1: Foundation
- **ID**: `foundation`
- **Description**: Core infrastructure setup
- **Keywords**: database, auth, setup, config
- **Priority**: 1

### Phase 2: Features
- **Description**: Main feature development
- **Keywords**: feature, component, ui
- **Priority**: 2

### Backlog
- **Description**: Future work
- **Keywords**: backlog, later
- **Priority**: 99

## Modules

### Authentication
- **ID**: `auth`
- **Paths**:
  - `src/auth/`
  - `src/lib/auth/`
- **Phase**: `Foundation`
```

### Step 2: Register Project with NSMA

#### Option A: Web Dashboard (Recommended)

1. Start NSMA dashboard:
   ```bash
   cd /home/feyijimiohioma/projects/Nsma && npm run dev
   ```

2. Open http://localhost:3100

3. Click **"New Project"**

4. Fill in:
   - **Name**: Your Project Name
   - **Slug**: `your-project-slug` (must match Notion "Project" property)
   - **Prompts Path**: `/path/to/your/project/prompts`

5. Click **"Check for Config Files"** to auto-import phases/modules

6. Save

#### Option B: API Registration

```bash
curl -X POST http://localhost:3100/api/projects/register \
  -H "Authorization: Bearer YOUR_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Project",
    "slug": "your-project-slug",
    "promptsPath": "/path/to/your/project/prompts",
    "active": true
  }'
```

Get your registration token from `~/.notion-sync-manager/settings.json`.

### Step 3: Create Directory Structure

```bash
cd /path/to/your/project
mkdir -p prompts/pending prompts/processed prompts/archived prompts/deferred
```

Structure:
```
your-project/
├── prompts/
│   ├── pending/      # New prompts from Notion
│   ├── processed/    # Completed tasks
│   ├── deferred/     # Postponed tasks
│   └── archived/     # Skipped tasks
└── .nsma-config.md   # Phase/module config
```

### Step 4: Install SessionStart Hook

Copy the universal hook to your project:

```bash
mkdir -p /path/to/your/project/.claude/hooks
cp /home/feyijimiohioma/projects/Nsma/hooks/session-start.sh \
   /path/to/your/project/.claude/hooks/session-start.sh
chmod +x /path/to/your/project/.claude/hooks/session-start.sh
```

### Step 5: Configure Notion Database

Ensure your Notion database has these properties:

| Property | Type | Notes |
|----------|------|-------|
| **Project** | Select | Must include your project slug as an option |
| **Status** | Select | "Not started", "In progress", "Done", "Deferred", "Archived" |
| **Type** | Select | "Feature", "Bug Fix", "Documentation", etc. |
| **Affected Module** | Select | Maps to your config modules |
| **Hydrated** | Checkbox | If true, uses page body content |

### Step 6: Test the Setup

#### 6.1 Verify Registration
```bash
cat ~/.notion-sync-manager/projects.json | jq '.[] | select(.slug == "your-project-slug")'
```

#### 6.2 Run Dry Sync
```bash
node /home/feyijimiohioma/projects/Nsma/cli/index.js --project your-project-slug --dry-run
```

#### 6.3 Test Hook
```bash
cd /path/to/your/project
bash .claude/hooks/session-start.sh
```

Expected output:
```
╔══════════════════════════════════════════════════════════╗
║           NOTION SYNC MANAGER - Session Start            ║
╚══════════════════════════════════════════════════════════╝

Project: your-project-slug
Current Phase: Phase 1

🔄 Running Notion sync...
...
```

### Step 7: Verify in Dashboard

1. Open http://localhost:3100
2. Your project should appear with stats
3. Check that phases/modules were imported correctly

### Onboarding Checklist

- [ ] `.nsma-config.md` created with phases/modules
- [ ] Project registered in NSMA dashboard
- [ ] `prompts/{pending,processed,deferred,archived}` directories created
- [ ] SessionStart hook installed at `.claude/hooks/session-start.sh`
- [ ] Notion database has "Project" property with your slug
- [ ] Dry-run sync succeeds
- [ ] Hook executes and displays banner

### Quick Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start NSMA dashboard (port 3100) |
| `npm run sync` | Sync all active projects |
| `npm run sync -- --project SLUG` | Sync specific project |
| `npm run sync:dry` | Preview sync without changes |

| File/Directory | Purpose |
|----------------|---------|
| `~/.notion-sync-manager/projects.json` | All project configs |
| `~/.notion-sync-manager/settings.json` | Global settings (token, database ID) |
| `.nsma-config.md` | Per-project phase/module config |
| `prompts/pending/` | Active prompts to process |

### Onboarding Troubleshooting

| Issue | Solution |
|-------|----------|
| "fetch failed" | Check Notion token in settings.json |
| Project not syncing | Verify `active: true` in projects.json |
| Prompts not appearing | Check slug matches Notion "Project" property |
| Phases not imported | Run "Check for Config Files" in dashboard |
| Hook not running | Verify `.claude/hooks/session-start.sh` is executable |

---

## License

MIT

## Support

For issues or questions:
1. Check this README
2. Review logs: `~/. notion-sync-manager/sync-logs.json`
3. Test with `--dry-run` flag
4. Check systemd logs: `sudo journalctl -u notion-sync`

---

**Version**: 1.0.0
**Built for**: Claude Code integration
**Author**: Generated with Claude Code

```
  You can now test:
  - ✅ Next.js builds successfully
  - ✅ Dev server runs on port 3100
  - 🔄 Dashboard loads in browser
  - 🔄 Create a project via UI
  - 🔄 Configure phases and modules
  - 🔄 Run CLI sync: npm run sync:dry
  - 🔄 Test session hook in Claude Code
  - 🔄 Enable systemd daemon

```