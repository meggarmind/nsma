import { NextResponse } from 'next/server';
import { getProjects, createProject, getSettings, countPrompts, updateProject } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    const projects = await getProjects();

    // If refresh requested, recalculate live stats from disk for each project
    if (refresh) {
      for (const project of projects) {
        if (project.promptsPath) {
          const stats = await countPrompts(project.promptsPath);
          project.stats = stats;
          // Also persist the updated stats
          await updateProject(project.id, { stats });
        }
      }
      // No cache for refresh requests (force fresh data)
      return NextResponse.json(projects);
    }

    return jsonWithCache(projects, { maxAge: CACHE_DURATIONS.projects });
  } catch (error) {
    return jsonError(error);
  }
}

// Protected: Requires Bearer token authentication
async function handlePost(request) {
  try {
    const body = await request.json();
    const project = await createProject(body);

    // Auto-sync to Notion dropdown
    try {
      const settings = await getSettings();
      if (settings.notionToken && settings.notionDatabaseId) {
        const notion = new NotionClient(settings.notionToken);
        const projects = await getProjects();
        const slugs = projects.map(p => p.slug);
        await notion.syncProjectOptionsToDatabase(settings.notionDatabaseId, slugs);
      }
    } catch (syncError) {
      console.error('Failed to sync to Notion:', syncError.message);
      // Don't fail the request, just log the error
    }

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
