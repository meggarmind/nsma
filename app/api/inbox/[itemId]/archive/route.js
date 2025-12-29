import { NextResponse } from 'next/server';
import { getInboxItems, archiveInboxItem, getSettings, logInfo, logWarn } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';
import { INBOX_PROJECT_ID } from '@/lib/constants';

/**
 * POST /api/inbox/[itemId]/archive
 * Archive an inbox item (move to archived folder)
 * Protected: Requires Bearer token authentication
 */
async function handlePost(request, { params }) {
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
                text: { content: `Archived from Inbox on ${new Date().toISOString().slice(0, 10)}` }
              }]
            }
          });
        }
      } catch (notionError) {
        console.error('Failed to update Notion:', notionError.message);
        // Continue anyway - the file archive is more important
      }
    }

    // Archive the file
    const result = await archiveInboxItem(item.filename);

    // Audit log
    await logInfo({
      operation: 'archive-inbox-item',
      projectId: INBOX_PROJECT_ID,
      projectName: 'Inbox',
      message: `Archived inbox item: ${item.title}`,
      itemId: item.id,
      itemTitle: item.title,
      details: {
        filename: item.filename,
        originalProject: item.originalProject || null,
        archivedTo: result.to
      }
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Archived "${item.title}"`
    });
  } catch (error) {
    // Log error
    await logWarn({
      operation: 'archive-inbox-item-error',
      projectId: INBOX_PROJECT_ID,
      projectName: 'Inbox',
      message: `Failed to archive inbox item: ${error.message}`,
      error: error.message
    });
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
