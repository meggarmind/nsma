import { NextResponse } from 'next/server';
import { SyncProcessor } from '@/lib/processor';
import { jsonError } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

// Protected: Requires Bearer token authentication
async function handlePost() {
  try {
    const processor = new SyncProcessor();
    const results = await processor.run();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
