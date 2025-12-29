import { NextResponse } from 'next/server';
import { getProjects, getSettings, saveSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';
import { jsonError } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

/**
 * POST /api/settings/sync-projects
 * Sync project slugs to Notion database dropdown
 * Protected: Requires Bearer token authentication
 */
async function handlePost() {
  try {
    const settings = await getSettings();

    if (!settings.notionToken) {
      return NextResponse.json({ error: 'Notion token not configured' }, { status: 400 });
    }

    if (!settings.notionDatabaseId) {
      return NextResponse.json({ error: 'Notion database ID not configured' }, { status: 400 });
    }

    const notion = new NotionClient(settings.notionToken);
    const projects = await getProjects();
    const slugs = projects.map(p => p.slug);

    // Sync project slugs to database dropdown options
    const result = await notion.syncProjectOptionsToDatabase(
      settings.notionDatabaseId,
      slugs
    );

    // Collect unique modules and phases from all projects
    const uniqueModules = [...new Set(
      projects.flatMap(p => (p.modules || []).map(m => m.name))
    )].filter(Boolean);

    const uniquePhases = [...new Set(
      projects.flatMap(p => (p.phases || []).map(ph => ph.name))
    )].filter(Boolean);

    // Sync modules and phases to Notion dropdown options
    let moduleResult = null;
    let phaseResult = null;
    try {
      // Sync modules to "Affected Module" property
      if (uniqueModules.length > 0) {
        moduleResult = await notion.syncSelectOptionsToDatabase(
          settings.notionDatabaseId,
          'Affected Module',
          uniqueModules
        );
      }

      // Sync phases to both "Suggested Phase" and "Assigned Phase" properties
      if (uniquePhases.length > 0) {
        const [suggested, assigned] = await Promise.all([
          notion.syncSelectOptionsToDatabase(settings.notionDatabaseId, 'Suggested Phase', uniquePhases),
          notion.syncSelectOptionsToDatabase(settings.notionDatabaseId, 'Assigned Phase', uniquePhases)
        ]);
        phaseResult = {
          suggestedPhase: suggested,
          assignedPhase: assigned
        };
      }
    } catch (syncError) {
      console.warn('Failed to sync module/phase options:', syncError.message);
    }

    // Sync project slugs to dedicated Notion page
    let slugsPageResult = null;
    try {
      slugsPageResult = await notion.syncProjectSlugsPage(
        settings.notionDatabaseId,
        projects.map(p => ({
          name: p.name,
          slug: p.slug,
          modules: (p.modules || []).map(m => m.name).join(', ')
        })),
        settings.projectSlugsPageId || null
      );

      // Save page ID if newly created or first discovered
      if (slugsPageResult.pageId && slugsPageResult.pageId !== settings.projectSlugsPageId) {
        await saveSettings({
          ...settings,
          projectSlugsPageId: slugsPageResult.pageId
        });
      }
    } catch (pageError) {
      // Log but don't fail the main sync
      console.warn('Failed to sync project slugs page:', pageError.message);
    }

    // Build summary message
    const messages = [];
    if (result.added.length > 0) {
      messages.push(`${result.added.length} project(s)`);
    }
    if (moduleResult?.added?.length > 0) {
      messages.push(`${moduleResult.added.length} module(s)`);
    }
    if (phaseResult?.suggestedPhase?.added?.length > 0) {
      messages.push(`${phaseResult.suggestedPhase.added.length} phase(s)`);
    }

    return NextResponse.json({
      success: true,
      projects: {
        added: result.added,
        existing: result.existing
      },
      modules: moduleResult ? {
        added: moduleResult.added,
        existing: moduleResult.existing
      } : null,
      phases: phaseResult,
      slugsPage: slugsPageResult ? {
        pageId: slugsPageResult.pageId,
        created: slugsPageResult.created
      } : null,
      message: messages.length > 0
        ? `Added ${messages.join(', ')} to Notion`
        : 'All projects, modules, and phases already synced to Notion'
    });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
