import { NextResponse } from 'next/server';
import { createProject } from '@/lib/storage';
import { validateProjectRegistration, findProjectBySlug } from '@/lib/validation';
import { verifyRegistrationToken } from '@/lib/auth';
import { createProjectDirectories } from '@/lib/setup';
import { NotionClient } from '@/lib/notion';
import { getSettings, getProjects } from '@/lib/storage';

export async function POST(request) {
  try {
    // 1. Authenticate
    try {
      await verifyRegistrationToken(request);
    } catch (authError) {
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();

    // 3. Validate input
    try {
      await validateProjectRegistration(body);
    } catch (validationError) {
      return NextResponse.json(
        { success: false, error: validationError.message, field: validationError.field },
        { status: 400 }
      );
    }

    // 4. Check if project already exists (idempotent)
    const existingProject = await findProjectBySlug(body.slug);
    if (existingProject) {
      return NextResponse.json({
        success: true,
        project: existingProject,
        created: false,
        message: 'Project already registered'
      }, { status: 200 });
    }

    // 5. Create directory structure
    let directoriesCreated = [];
    try {
      directoriesCreated = await createProjectDirectories(body.promptsPath);
    } catch (dirError) {
      return NextResponse.json(
        { success: false, error: `Failed to create directories: ${dirError.message}` },
        { status: 500 }
      );
    }

    // 6. Create project
    const project = await createProject({
      name: body.name,
      slug: body.slug,
      promptsPath: body.promptsPath,
      active: body.active !== false, // Default to true
      phases: body.phases || [],
      modules: body.modules || [],
      modulePhaseMapping: body.modulePhaseMapping || {}
    });

    // 7. Auto-sync to Notion (fail-safe)
    try {
      const settings = await getSettings();
      if (settings.notionToken && settings.notionDatabaseId) {
        const notion = new NotionClient(settings.notionToken);
        const projects = await getProjects();
        const slugs = projects.map(p => p.slug);
        await notion.syncProjectOptionsToDatabase(settings.notionDatabaseId, slugs);
      }
    } catch (syncError) {
      // Don't fail the request, just log
      console.error('Failed to sync to Notion:', syncError.message);
    }

    // 8. Return success
    return NextResponse.json({
      success: true,
      project,
      created: true,
      directoriesCreated
    }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
