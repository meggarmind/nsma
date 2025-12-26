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
3. Verify database ID: `2d22bfe3ea0c81059ebef821673358c3`

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

## systemd Service

### Install Service

```bash
sudo cp systemd/notion-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable notion-sync
sudo systemctl start notion-sync
```

### Check Status

```bash
sudo systemctl status notion-sync
sudo journalctl -u notion-sync -f  # Follow logs
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

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS (dark theme)
- **Icons**: Lucide React
- **Storage**: JSON files
- **Runtime**: Node.js 18+

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