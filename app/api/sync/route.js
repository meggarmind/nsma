import { NextResponse } from 'next/server';
import { SyncProcessor } from '@/lib/processor';
import { jsonError } from '@/lib/api-response';

// Internal dashboard route - no auth required
export async function POST() {
  try {
    const processor = new SyncProcessor();
    const results = await processor.run();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return jsonError(error);
  }
}
