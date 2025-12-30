import { NextResponse } from 'next/server';
import { getProject, getSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { ReverseSyncProcessor } from '@/lib/reverse-sync';
import { jsonError } from '@/lib/api-response';

/**
 * Retry failed reverse sync for a project
 * POST /api/logs/retry
 * Body: { projectId: string }
 * Internal dashboard route - no auth required
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const settings = await getSettings();
    if (!settings.notionToken) {
      return NextResponse.json({ error: 'Notion token not configured' }, { status: 400 });
    }

    const notion = new NotionClient(settings.notionToken);
    const processor = new ReverseSyncProcessor({
      notionClient: notion,
      dryRun: false,
      verbose: false,
      errorMode: project.reverseSyncErrorMode || 'skip'
    });

    const result = await processor.syncProject(project);

    return NextResponse.json({
      success: true,
      result: {
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped
      },
      message: result.failed > 0
        ? `Retry completed with ${result.failed} failure(s)`
        : `Successfully synced ${result.updated} file(s) to Notion`
    });
  } catch (error) {
    return jsonError(error);
  }
}

