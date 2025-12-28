import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/storage';
import { NotionClient } from '@/lib/notion';

/**
 * GET /api/settings/notion-databases
 * Returns list of Notion databases accessible to the integration
 */
export async function GET() {
  try {
    const settings = await getSettings();

    if (!settings.notionToken) {
      return NextResponse.json({
        databases: [],
        error: 'No Notion token configured'
      });
    }

    const notion = new NotionClient(settings.notionToken);
    const databases = await notion.listDatabases();

    return NextResponse.json({
      databases,
      currentDatabaseId: settings.notionDatabaseId || null
    });
  } catch (error) {
    // Provide user-friendly error messages
    let errorMessage = error.message;

    if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      errorMessage = 'Invalid Notion token. Please check your integration settings.';
    } else if (error.message?.includes('403') || error.message?.includes('forbidden')) {
      errorMessage = 'Access denied. Check your integration permissions.';
    }

    return NextResponse.json({
      databases: [],
      error: errorMessage
    }, { status: 200 }); // Return 200 with error in body for frontend handling
  }
}
