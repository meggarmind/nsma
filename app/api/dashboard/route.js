import { getDashboardProjects, getUnassignedItems, getAnalyticsData, getActivityFeed } from '@/lib/dashboard-data';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('force') === 'true';

  try {
    const [projects, unassigned, analytics, activity] = await Promise.all([
      getDashboardProjects({ forceRefresh }),
      getUnassignedItems({ forceRefresh }),
      getAnalyticsData({ forceRefresh }),
      getActivityFeed({ forceRefresh })
    ]);

    return Response.json({
      projects,
      unassigned,
      analytics,
      activity: activity.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
