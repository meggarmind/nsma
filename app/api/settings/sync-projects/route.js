import { NextResponse } from 'next/server';
import { getProjects, getSettings } from '@/lib/storage';
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

    const result = await notion.syncProjectOptionsToDatabase(
      settings.notionDatabaseId,
      slugs
    );

    return NextResponse.json({
      success: true,
      added: result.added,
      existing: result.existing,
      message: result.added.length > 0
        ? `Added ${result.added.length} project(s) to Notion: ${result.added.join(', ')}`
        : 'All projects already synced to Notion'
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
