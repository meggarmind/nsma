import { NextResponse } from 'next/server';
import { getProject, getSettings, updateProject, logInfo, logWarn } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { ReverseSyncProcessor } from '@/lib/reverse-sync';
import { jsonError } from '@/lib/api-response';

/**
 * POST /api/projects/[id]/reverse-sync
 * Manually trigger reverse sync for a project
 * Syncs local file folder locations to Notion page statuses
 * Internal dashboard route - no auth required
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

    // Warm up API connection by querying the database first
    // (Notion API quirk: page operations may fail without prior database interaction)
    if (settings.notionDatabaseId) {
      try {
        await notion.queryDatabase(settings.notionDatabaseId, null, 'In progress');
      } catch (e) {
        // Continue anyway - warm-up is best-effort
      }
    }

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
      const logFn = result.failed > 0 ? logWarn : logInfo;

      // Format error details with type labels for UI display
      const errorDetails = result.failed > 0 && result.errors?.length > 0
        ? {
            message: `${result.failed} file(s) failed to sync to Notion`,
            items: result.errors.map(e => {
              const typeLabel = e.errorType === 'permission'
                ? ' (permission denied)'
                : e.errorType === 'deleted' ? ' (page deleted)' : '';
              return `${e.file}: ${e.error}${typeLabel}`;
            }).join('\n')
          }
        : null;

      await logFn({
        operation: 'reverse-sync',
        projectId: project.id,
        projectName: project.name,
        message: result.failed > 0
          ? `Reverse sync completed with ${result.failed} failure(s)`
          : `Reverse sync completed: ${result.updated} item(s) updated`,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        details: errorDetails,
        errors: result.errors,
        updatedItems: result.updatedItems,
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
    return jsonError(error);
  }
}

