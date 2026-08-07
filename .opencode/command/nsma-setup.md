---
description: Bootstrap this project for NSMA. Creates prompts directories, registers in Notion, and writes .nsma-plugin.json. Run once per project.
---

You are setting up NSMA (Notion Sync Manager) for this project.

## Steps

1. Check if `.nsma-plugin.json` already exists — if it does, confirm with the user before overwriting.

2. Look for a project configuration file:
   - `.nsma-config.md`
   - `.nsma/config.md`
   - `PERSPECTIVE.md`
   - `ARCHITECTURE.md`
   - `PROJECT_CONFIG.md`
   If none exists, converse with the user to create one defining development phases and modules.

3. Determine the project slug: kebab-case of the directory name, or ask the user.

4. Ask the user to choose an ideation method:
   - `brainstorming` — use superpowers:brainstorming for each item
   - `plan-mode` — use plan mode for each item

5. Ensure these environment variables are set:
   - `NSMA_NOTION_TOKEN` — Notion integration secret
   - `NSMA_NOTION_INBOX_DB_ID` — Notion database ID for the NSM Inbox
   If not set, tell the user to set them and stop.

6. Run the setup script:
   ```
   node plugin/scripts/setup.js --slug=<slug> --ideation-method=<method>
   ```

7. Report the result — the script outputs the Notion Project Slugs page ID.

After setup, remind the user to restart opencode for changes to take effect.
