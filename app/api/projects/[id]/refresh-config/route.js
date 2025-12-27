import { NextResponse } from 'next/server';
import { getProject } from '@/lib/storage';
import { ConfigWatcher } from '@/lib/config-watcher';

/**
 * POST /api/projects/[id]/refresh-config
 * Manually trigger config refresh for a project
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const watcher = new ConfigWatcher({ verbose: true });
    const result = await watcher.refreshConfig(project);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Config refresh failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: 'Config refreshed successfully',
      ...result.changes
    });
  } catch (error) {
    console.error('Config refresh error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh config' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/refresh-config
 * Check if config has changed since last import
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const watcher = new ConfigWatcher();
    const hasChanged = await watcher.hasConfigChanged(project);

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      hasChanges: hasChanged,
      lastImportedAt: project.lastImportedAt,
      configSource: project.configSource
    });
  } catch (error) {
    console.error('Config check error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check config' },
      { status: 500 }
    );
  }
}
