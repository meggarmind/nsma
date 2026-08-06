---
description: Mark a task complete, moving it to processed/ and updating Notion
argument-hint: <filename or item title>
---

# NSMA Task Complete

The developer has finished a task and wants to mark it done.

1. If `$ARGUMENTS` is empty or doesn't clearly match a file, list the `.md` files in `prompts/pending/` and ask the developer which one they mean.

2. Once resolved to a specific file path, run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/complete.js <resolved-file-path>`

3. Report success (the file moved to `prompts/processed/`, Notion marked Done) or the specific error if it failed — e.g. if the file's Notion item no longer exists, tell the developer and ask how they want to proceed rather than silently leaving the file in place.
