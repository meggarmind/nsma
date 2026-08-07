---
description: Mark an NSMA task as complete. Moves the file to prompts/processed/ and marks the Notion item Done.
---

Complete an NSMA task. The user provides a filename or item title as $ARGUMENTS.

## Steps

1. If $ARGUMENTS is empty, list `.md` files in `prompts/pending/` and ask the user to pick one.

2. Resolve the file path — if the user gave a filename without a path, look in `prompts/pending/` for it. If they gave a title, search for matching frontmatter.

3. Run the complete script:
   ```
   node plugin/scripts/complete.js <resolved-file-path>
   ```

4. Report the result:
   - Success: file was moved to `prompts/processed/` and Notion item marked Done
   - Failure: explain the error (missing notion_page_id, Notion API failure, etc.)
