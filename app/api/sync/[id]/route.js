import { NextResponse } from 'next/server';
import { SyncProcessor } from '@/lib/processor';
import { getProject } from '@/lib/storage';

export async function POST(request, { params }) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
