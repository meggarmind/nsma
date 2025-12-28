import { NextResponse } from 'next/server';
import {
  generateProjectDefaults,
  validatePaths,
  detectConfigFiles,
  runWizardProgrammatic
} from '@/lib/wizard';

/**
 * Wizard API Endpoint
 * Supports multiple operations via the 'action' field
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'generate-defaults':
        return handleGenerateDefaults(body);

      case 'validate-paths':
        return handleValidatePaths(body);

      case 'detect-config':
        return handleDetectConfig(body);

      case 'create-project':
        return handleCreateProject(body);

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Wizard API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate default project values from PROJECT_ROOT
 */
async function handleGenerateDefaults(body) {
  const { projectRoot } = body;

  if (!projectRoot) {
    return NextResponse.json(
      { success: false, error: 'projectRoot is required' },
      { status: 400 }
    );
  }

  try {
    const defaults = generateProjectDefaults(projectRoot);
    return NextResponse.json({
      success: true,
      defaults
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

/**
 * Validate project paths
 */
async function handleValidatePaths(body) {
  const { projectRoot, promptsPath } = body;

  if (!projectRoot) {
    return NextResponse.json(
      { success: false, error: 'projectRoot is required' },
      { status: 400 }
    );
  }

  // If no promptsPath provided, use default
  const defaults = generateProjectDefaults(projectRoot);
  const pathToValidate = promptsPath || defaults.promptsPath;

  const validation = validatePaths(projectRoot, pathToValidate);

  return NextResponse.json({
    success: validation.valid,
    validation,
    correctedPath: validation.corrections.promptsPath || pathToValidate
  });
}

/**
 * Detect configuration files in project
 */
async function handleDetectConfig(body) {
  const { projectRoot } = body;

  if (!projectRoot) {
    return NextResponse.json(
      { success: false, error: 'projectRoot is required' },
      { status: 400 }
    );
  }

  const detection = await detectConfigFiles(projectRoot);

  return NextResponse.json({
    success: true,
    detection
  });
}

/**
 * Create project with full setup
 */
async function handleCreateProject(body) {
  const {
    projectRoot,
    name,
    slug,
    promptsPath,
    importConfig,
    hookStyle,
    createConfigTemplate
  } = body;

  if (!projectRoot) {
    return NextResponse.json(
      { success: false, error: 'projectRoot is required' },
      { status: 400 }
    );
  }

  const result = await runWizardProgrammatic({
    projectRoot,
    name,
    slug,
    promptsPath,
    importConfig: importConfig !== false,
    hookStyle: hookStyle || 'full',
    createConfigTemplate: createConfigTemplate === true
  });

  if (result.success) {
    return NextResponse.json({
      success: true,
      project: result.project,
      created: result.created,
      imported: result.imported,
      warnings: result.warnings
    }, { status: 201 });
  } else {
    return NextResponse.json({
      success: false,
      errors: result.errors,
      step: result.step
    }, { status: 400 });
  }
}
