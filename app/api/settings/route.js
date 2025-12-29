import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/storage';
import { jsonWithCache, jsonError, CACHE_DURATIONS } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask tokens completely - don't expose any characters
    return jsonWithCache({
      ...settings,
      notionToken: settings.notionToken ? '••••••••••••' : '',
      anthropicApiKey: settings.anthropicApiKey ? '••••••••••••' : '',
      geminiApiKey: settings.geminiApiKey ? '••••••••••••' : '',
      hasNotionToken: !!settings.notionToken,
      hasAnthropicKey: !!settings.anthropicApiKey,
      hasGeminiKey: !!settings.geminiApiKey
    }, { maxAge: CACHE_DURATIONS.settings });
  } catch (error) {
    return jsonError(error);
  }
}

// Protected: Requires Bearer token authentication
async function handlePut(request) {
  try {
    const body = await request.json();
    const current = await getSettings();

    // Don't overwrite tokens if masked value sent
    if (body.notionToken?.startsWith('••••')) {
      body.notionToken = current.notionToken;
    }
    if (body.anthropicApiKey?.startsWith('••••')) {
      body.anthropicApiKey = current.anthropicApiKey;
    }
    if (body.geminiApiKey?.startsWith('••••')) {
      body.geminiApiKey = current.geminiApiKey;
    }

    const settings = await saveSettings(body);
    return NextResponse.json(settings); // No cache for mutations
  } catch (error) {
    return jsonError(error);
  }
}

export const PUT = withAuth(handlePut);
