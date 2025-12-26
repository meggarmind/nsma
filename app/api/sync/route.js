import { NextResponse } from 'next/server';
import { SyncProcessor } from '@/lib/processor';

export async function POST() {
  try {
    const processor = new SyncProcessor();
    const results = await processor.run();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
