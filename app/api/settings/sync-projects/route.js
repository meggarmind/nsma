import { NextResponse } from 'next/server';
import { getProjects, getSettings, saveSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';

export async function POST() {
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

    return NextResponse.json({
      success: true,
      added: result.added,
      existing: result.existing,
      slugsPage: slugsPageResult ? {
        pageId: slugsPageResult.pageId,
        created: slugsPageResult.created
      } : null,
      message: result.added.length > 0
        ? `Added ${result.added.length} project(s) to Notion: ${result.added.join(', ')}`
        : 'All projects already synced to Notion'
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
