import { NextResponse } from 'next/server';
import { getInboxItems, moveInboxItemToProject, getProject, getSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

/**
 * POST /api/inbox/[itemId]/assign
 * Assign an inbox item to a project
 * Protected: Requires Bearer token authentication
 */
async function handlePost(request, { params }) {
  try {
    const { itemId } = await params;
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Find the inbox item
    const inboxItems = await getInboxItems();
    const item = inboxItems.find(i => i.id === itemId || i.filename === itemId);

    if (!item) {
      return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
    }

    // Get the target project
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Update Notion first
    if (item.notionPageId) {
      try {
        const settings = await getSettings();
        if (settings.notionToken) {
          const notion = new NotionClient(settings.notionToken);
          await notion.updateItemProject(item.notionPageId, project.slug);
        }
      } catch (notionError) {
        console.error('Failed to update Notion:', notionError.message);
        // Continue anyway - the file move is more important
      }
    }

    // Move the file
    const result = await moveInboxItemToProject(item.filename, projectId);

    return NextResponse.json({
      success: true,
      ...result,
      message: `Assigned "${item.title}" to ${project.name}`
    });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
