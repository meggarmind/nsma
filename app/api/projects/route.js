import { NextResponse } from 'next/server';
import { getProjects, createProject, getSettings, countPrompts, updateProject } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';

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
    }

    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
