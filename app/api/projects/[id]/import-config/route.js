import { NextResponse } from 'next/server';
import { getProject, updateProject } from '@/lib/storage';
import { ConfigParser } from '@/lib/config-parser';
import { resolvePromptsPath } from '@/lib/storage';

/**
 * GET /api/projects/[id]/import-config
 * Preview what would be imported without saving
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

    if (!project.promptsPath) {
      return NextResponse.json(
        { error: 'Project has no prompts path configured' },
        { status: 400 }
      );
    }

    const projectPath = resolvePromptsPath(project.promptsPath);
    const parser = new ConfigParser(projectPath);

    // Find available config files
    const configFiles = await parser.findConfigFiles();

    if (configFiles.length === 0) {
      return NextResponse.json({
        available: false,
        files: [],
        message: 'No configuration files found in project directory'
      });
    }

    // Parse primary config (preview mode)
    const parsedConfig = await parser.parseConfigFile(configFiles[0].filepath);

    return NextResponse.json({
      available: true,
      files: configFiles.map(f => f.filename),
      preview: {
        phases: parsedConfig.phases,
        modules: parsedConfig.modules,
        modulePhaseMapping: parsedConfig.modulePhaseMapping,
        source: configFiles[0].filename
      },
      changes: {
        phasesAdded: parsedConfig.phases.filter(p =>
          !project.phases?.find(ep => ep.name === p.name)
        ).length,
        modulesAdded: parsedConfig.modules.filter(m =>
          !project.modules?.find(em => em.name === m.name)
        ).length
      }
    });

  } catch (error) {
    console.error('Preview config error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/import-config
 * Import configuration from project documentation files
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

    if (!project.promptsPath) {
      return NextResponse.json(
        { error: 'Project has no prompts path configured' },
        { status: 400 }
      );
    }

    // Resolve the actual project directory
    const projectPath = resolvePromptsPath(project.promptsPath);

    // Parse configuration
    const parser = new ConfigParser(projectPath);

    try {
      const importedConfig = await parser.autoImport(project);

      // Update project with imported config
      const updated = await updateProject(id, {
        phases: importedConfig.phases,
        modules: importedConfig.modules,
        modulePhaseMapping: importedConfig.modulePhaseMapping,
        configSource: importedConfig.configSource,
        lastImportedAt: importedConfig.lastImportedAt
      });

      return NextResponse.json({
        success: true,
        project: updated,
        imported: {
          phases: importedConfig.phases.length,
          modules: importedConfig.modules.length,
          source: importedConfig.configSource
        }
      });

    } catch (parseError) {
      return NextResponse.json(
        {
          error: 'Failed to parse configuration',
          details: parseError.message
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Import config error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
