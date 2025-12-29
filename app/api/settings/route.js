import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/storage';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask tokens completely - don't expose any characters
    return jsonWithCache({
      ...settings,
      notionToken: settings.notionToken ? '••••••••••••' : '',
      anthropicApiKey: settings.anthropicApiKey ? '••••••••••••' : '',
      hasNotionToken: !!settings.notionToken,
      hasAnthropicKey: !!settings.anthropicApiKey
    }, { maxAge: CACHE_DURATIONS.settings });
  } catch (error) {
    return jsonError(error.message);
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
    return NextResponse.json(settings); // No cache for mutations
  } catch (error) {
    return jsonError(error.message);
  }
}
