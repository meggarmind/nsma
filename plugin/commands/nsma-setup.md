---
description: Set up the NSMA Companion plugin for this project
---

# NSMA Companion Setup

1. Check whether `.nsma-plugin.json` already exists in the project root. If it does, confirm with the developer before continuing (setup will overwrite it).

2. Look for `.nsma-config.md` (or the other supported config filenames `ConfigParser` checks: `.nsma/config.md`, `PERSPECTIVE.md`, `ARCHITECTURE.md`, `PROJECT_CONFIG.md`). If none exist, have a natural conversation with the developer to define this project's development phases and modules, then write a `.nsma-config.md` in the project root following the existing format (see `.nsma-config.example.md` in the NSMA repo for the exact structure: `## Development Phases` with `### Phase Name` sections containing `**ID**`, `**Description**`, `**Keywords**`, `**Priority**`; `## Modules` with `### Module Name` sections containing `**ID**`, `**Paths**`, `**Phase**`).

3. Determine the project slug: default to a kebab-case version of the current directory name, and confirm it with the developer — this must exactly match the value used to tag this project's items in the `NSM Inbox` database's `Project` field.

4. Ask the developer which ideation method this project should use by default: `brainstorming` (runs `superpowers:brainstorming` on each non-bug item) or `plan-mode` (uses Claude Code's built-in plan mode instead). This choice is fixed per project until setup is re-run.

5. Ensure `NSMA_NOTION_TOKEN` and `NSMA_NOTION_INBOX_DB_ID` are set in the environment (ask the developer where to find these if not already configured — typically the same Notion integration token and database ID used by the NSMA dashboard). Optionally `NSMA_NOTION_PROJECT_SLUGS_PAGE_ID` if the page already exists and its ID is known.

6. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js --slug=<slug> --ideation-method=<method>`

7. Report the result to the developer, including the `NSM Project Slugs` page link.
