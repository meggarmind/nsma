import { NextResponse } from 'next/server';
import { getInboxItems, deleteInboxItem, getSettings, logInfo, logWarn } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';
import { INBOX_PROJECT_ID } from '@/lib/constants';

/**
 * POST /api/inbox/[itemId]/delete
 * Delete an inbox item permanently
 * Internal dashboard route - no auth required
 */
export async function POST(request, { params }) {
  try {
    const { itemId } = await params;

    // Find the inbox item
    const inboxItems = await getInboxItems();
    const item = inboxItems.find(i => i.id === itemId || i.filename === itemId);

    if (!item) {
      return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
    }

    // Update Notion status to "Archived" if possible
    if (item.notionPageId) {
      try {
        const settings = await getSettings();
        if (settings.notionToken) {
          const notion = new NotionClient(settings.notionToken);
          await notion.updatePage(item.notionPageId, {
            'Status': { select: { name: 'Archived' } },
            'Analysis Notes': {
              rich_text: [{
                text: { content: `Deleted from Inbox on ${new Date().toISOString().slice(0, 10)}` }
              }]
            }
          });
        }
      } catch (notionError) {
        console.error('Failed to update Notion:', notionError.message);
        // Continue anyway - the file delete is more important
      }
    }

    // Delete the file
    const result = await deleteInboxItem(item.filename);

    // Audit log
    await logInfo({
      operation: 'delete-inbox-item',
      projectId: INBOX_PROJECT_ID,
      projectName: 'Inbox',
      message: `Deleted inbox item: ${item.title}`,
      itemId: item.id,
      itemTitle: item.title,
      details: {
        filename: item.filename,
        originalProject: item.originalProject || null
      }
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Deleted "${item.title}" from Inbox`
    });
  } catch (error) {
    // Log error
    await logWarn({
      operation: 'delete-inbox-item-error',
      projectId: INBOX_PROJECT_ID,
      projectName: 'Inbox',
      message: `Failed to delete inbox item: ${error.message}`,
      error: error.message
    });
    return jsonError(error);
  }
}

