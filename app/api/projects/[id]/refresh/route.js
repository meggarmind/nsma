import { NextResponse } from 'next/server';
import { refreshProjectStats, getProject } from '@/lib/storage';

/**
 * POST /api/projects/[id]/refresh
 * Manually refresh project stats from disk
 * Returns the updated stats
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    // Check project exists
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Refresh stats from disk
    const stats = await refreshProjectStats(id);

    return NextResponse.json({
      success: true,
      projectId: id,
      stats,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
