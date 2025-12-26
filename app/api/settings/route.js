import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/storage';

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask token for security
    return NextResponse.json({
      ...settings,
      notionToken: settings.notionToken ? '••••••••' + settings.notionToken.slice(-4) : ''
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    // Don't overwrite token if masked value sent
    if (body.notionToken?.startsWith('••••')) {
      const current = await getSettings();
      body.notionToken = current.notionToken;
    }
    const settings = await saveSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
