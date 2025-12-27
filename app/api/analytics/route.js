import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/lib/analytics';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

    // Validate range parameter
    const validRanges = ['7d', '30d', '90d', 'all'];
    if (!validRanges.includes(range)) {
      return NextResponse.json(
        { error: 'Invalid range. Use: 7d, 30d, 90d, or all' },
        { status: 400 }
      );
    }

    const data = await getAnalyticsData(range);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
