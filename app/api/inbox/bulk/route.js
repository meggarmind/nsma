import { NextResponse } from 'next/server';
import { getInboxItems, deleteInboxItem, archiveInboxItem, getSettings, logInfo, logWarn } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';
import { INBOX_PROJECT_ID } from '@/lib/constants';

/**
 * POST /api/inbox/bulk
 * Bulk delete or archive inbox items
 * Internal dashboard route - no auth required
 *
 * Body: { action: 'delete' | 'archive', itemIds: string[] }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { action, itemIds } = body;

    if (!action || !['delete', 'archive'].includes(action)) {
      return NextResponse.json({ error: 'action must be "delete" or "archive"' }, { status: 400 });
    }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: 'itemIds array is required' }, { status: 400 });
    }

    // Find all inbox items
    const inboxItems = await getInboxItems();
    const settings = await getSettings();
    const notion = settings.notionToken ? new NotionClient(settings.notionToken) : null;

    const results = {
      succeeded: 0,
      failed: 0,
      errors: [],
      items: []
    };

    // Process items sequentially to avoid rate limits
    for (const itemId of itemIds) {
      const item = inboxItems.find(i => i.id === itemId || i.filename === itemId);

      if (!item) {
        results.failed++;
        results.errors.push({
          itemId,
          error: 'Item not found',
          errorType: 'not_found'
        });
        continue;
      }

      try {
        // Update Notion status if possible
        if (item.notionPageId && notion) {
          try {
            await notion.updatePage(item.notionPageId, {
              'Status': { select: { name: 'Archived' } },
              'Analysis Notes': {
                rich_text: [{
                  text: { content: `${action === 'delete' ? 'Deleted' : 'Archived'} from Inbox on ${new Date().toISOString().slice(0, 10)}` }
                }]
              }
            });
            // Rate limit delay for Notion API
            await new Promise(resolve => setTimeout(resolve, 350));
          } catch (notionError) {
            // Log but continue - file operation is more important
            console.error(`Failed to update Notion for ${item.id}:`, notionError.message);
          }
        }

        // Perform the action
        if (action === 'delete') {
          await deleteInboxItem(item.filename);
        } else {
          await archiveInboxItem(item.filename);
        }

        results.succeeded++;
        results.items.push({
          id: item.id,
          title: item.title,
          action
        });

      } catch (error) {
        results.failed++;
        results.errors.push({
          itemId: item.id,
          filename: item.filename,
          error: error.message,
          errorType: error.code === 'ENOENT' ? 'not_found' : 'other'
        });
      }
    }

    // Audit log
    const logFn = results.failed > 0 ? logWarn : logInfo;
    await logFn({
      operation: `bulk-${action}-inbox-items`,
      projectId: INBOX_PROJECT_ID,
      projectName: 'Inbox',
      message: results.failed > 0
        ? `Bulk ${action}: ${results.succeeded} succeeded, ${results.failed} failed`
        : `Bulk ${action}: ${results.succeeded} items ${action}d`,
      details: {
        action,
        requested: itemIds.length,
        succeeded: results.succeeded,
        failed: results.failed,
        items: results.items.map(i => i.title),
        errors: results.errors
      }
    });

    return NextResponse.json({
      success: results.failed === 0,
      action,
      ...results,
      message: results.failed > 0
        ? `${results.succeeded} items ${action}d, ${results.failed} failed`
        : `${results.succeeded} items ${action}d`
    });
  } catch (error) {
    return jsonError(error);
  }
}

