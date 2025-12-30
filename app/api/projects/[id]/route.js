import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject, getProjects, getSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    return jsonError(error);
  }
}

// Internal dashboard route - no auth required
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check if slug is changing
    const existingProject = await getProject(id);
    const slugChanged = existingProject && body.slug && body.slug !== existingProject.slug;

    const project = await updateProject(id, body);

    // Auto-sync to Notion if slug changed
    if (slugChanged) {
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
      }
    }

    return NextResponse.json(project);
  } catch (error) {
    return jsonError(error);
  }
}

// Internal dashboard route - no auth required
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteProject(id);
    // Note: We don't remove from Notion dropdown - orphaned items will go to Inbox
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}

