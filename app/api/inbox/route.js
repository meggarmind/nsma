import { NextResponse } from 'next/server';
import { getInboxItems, getInboxStats } from '@/lib/storage';

export async function GET() {
  try {
    const items = await getInboxItems();
    const stats = await getInboxStats();

    return NextResponse.json({
      items,
      stats,
      count: items.length
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
