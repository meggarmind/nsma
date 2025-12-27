import { NextResponse } from 'next/server';
import { getProject, getSettings, updateProject, addLog } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { ReverseSyncProcessor } from '@/lib/reverse-sync';

/**
 * POST /api/projects/[id]/reverse-sync
 * Manually trigger reverse sync for a project
 * Syncs local file folder locations to Notion page statuses
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    // Get project
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if reverse sync is enabled
    if (project.reverseSyncEnabled === false) {
      return NextResponse.json({
        error: 'Reverse sync is disabled for this project'
      }, { status: 400 });
    }

    // Get settings for Notion token
    const settings = await getSettings();
    if (!settings.notionToken) {
      return NextResponse.json({
        error: 'No Notion token configured'
      }, { status: 400 });
    }

    // Initialize processors
    const notion = new NotionClient(settings.notionToken);
    const processor = new ReverseSyncProcessor({
      notionClient: notion,
      errorMode: project.reverseSyncErrorMode || 'skip',
      dryRun: false,
      verbose: false
    });

    // Run reverse sync
    const result = await processor.syncProject(project);

    // Update project with reverse sync stats
    await updateProject(id, {
      lastReverseSync: {
        timestamp: new Date().toISOString(),
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped
      }
    });

    // Log the activity if there were changes
    if (result.updated > 0 || result.failed > 0) {
      await addLog({
        action: 'reverse-sync',
        projectId: project.id,
        projectName: project.name,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
        trigger: 'manual'
      });
    }

    return NextResponse.json({
      success: true,
      projectId: id,
      result: {
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors
      },
      syncedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Reverse sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
