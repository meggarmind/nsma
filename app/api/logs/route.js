import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/storage';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const logs = await getLogs(limit);
    return NextResponse.json(logs.reverse()); // Most recent first
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
