import { NextResponse } from 'next/server';
import { SyncProcessor } from '@/lib/processor';
import { getProject } from '@/lib/storage';
import { jsonError } from '@/lib/api-response';
import { withAuth } from '@/lib/auth';

/**
 * POST /api/sync/[id]
 * Trigger sync for a specific project
 * Protected: Requires Bearer token authentication
 */
async function handlePost(request, { params }) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const processor = new SyncProcessor({ project: project.slug });
    const results = await processor.run();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = withAuth(handlePost);
