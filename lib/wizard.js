import { existsSync } from 'fs';
import { mkdir, writeFile, chmod } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { createProject, updateProject, getSettings, getProjects } from './storage.js';
import { validateProjectRegistration, findProjectBySlug, validatePromptsPath } from './validation.js';
import { createProjectDirectories } from './setup.js';
import { ConfigParser } from './config-parser.js';
import { NotionClient } from './notion.js';
import { generateNsmaConfig, generateSessionStartHook } from './template-generator.js';

/**
 * Project Wizard - Shared logic for CLI and Web wizard
 * Orchestrates the complete project setup flow
 */

/**
 * Generate project defaults from PROJECT_ROOT path
 * @param {string} projectRoot - The project root directory path
 * @returns {Object} Default values for project fields
 */
export function generateProjectDefaults(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('PROJECT_ROOT path is required');
  }

  const normalizedPath = projectRoot.trim().replace(/\/+$/, ''); // Remove trailing slashes
  const projectName = basename(normalizedPath);

  // Generate slug: lowercase, replace spaces/underscores with hyphens, remove special chars
  const slug = projectName
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');

  const promptsPath = join(normalizedPath, 'prompts');

  return {
    projectRoot: normalizedPath,
    name: projectName,
    slug: slug || 'my-project', // Fallback if all chars were stripped
    promptsPath
  };
}

/**
 * Validate that paths are accessible
 * @param {string} projectRoot - The project root directory path
 * @param {string} promptsPath - The prompts directory path
 * @returns {Object} Validation result with warnings/corrections
 */
export function validatePaths(projectRoot, promptsPath) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    corrections: {}
  };

  // Check PROJECT_ROOT exists
  if (!existsSync(projectRoot)) {
    result.valid = false;
    result.errors.push(`PROJECT_ROOT does not exist: ${projectRoot}`);
    return result;
  }

  // Check if promptsPath parent exists (the prompts folder itself may not exist yet)
  const promptsParent = dirname(promptsPath);
  if (!existsSync(promptsParent)) {
    result.valid = false;
    result.errors.push(`Parent directory does not exist: ${promptsParent}`);
    return result;
  }

  // Validate prompts path format
  const pathValidation = validatePromptsPath(promptsPath);
  if (pathValidation.corrected) {
    result.warnings.push(`Prompts path auto-corrected: ${promptsPath} → ${pathValidation.path}`);
    result.corrections.promptsPath = pathValidation.path;
  }

  // Check if prompts directory already exists
  if (existsSync(promptsPath)) {
    result.warnings.push(`Prompts directory already exists: ${promptsPath}`);
  }

  return result;
}

/**
 * Detect configuration files in project directory
 * @param {string} projectRoot - The project root directory path
 * @returns {Promise<Object>} Detection result with found files
 */
export async function detectConfigFiles(projectRoot) {
  try {
    const parser = new ConfigParser(projectRoot);
    const configFiles = await parser.findConfigFiles();

    return {
      found: configFiles.length > 0,
      files: configFiles.map(f => f.filename),
      canImport: configFiles.length > 0
    };
  } catch (error) {
    return {
      found: false,
      files: [],
      canImport: false,
      error: error.message
    };
  }
}

/**
 * Create project with full setup
 * @param {Object} wizardData - Collected wizard data
 * @returns {Promise<Object>} Created project and summary
 */
export async function createProjectWithSetup(wizardData) {
  const {
    name,
    slug,
    promptsPath,
    projectRoot,
    importConfig = true,
    hookStyle = 'full', // 'full' | 'minimal'
    createConfigTemplate = false
  } = wizardData;

  const result = {
    success: false,
    project: null,
    created: [],
    imported: null,
    errors: [],
    warnings: []
  };

  try {
    // 1. Validate before creating (final check)
    const validationData = { name, slug, promptsPath };
    await validateProjectRegistration(validationData);

    // 2. Check if project with this slug already exists
    const existing = await findProjectBySlug(slug);
    if (existing) {
      result.errors.push(`Project with slug "${slug}" already exists`);
      return result;
    }

    // 3. Create directory structure
    const directoriesCreated = await createProjectDirectories(promptsPath);
    result.created.push(...directoriesCreated);

    // 4. Create project in storage
    const project = await createProject({
      name,
      slug,
      promptsPath,
      active: true,
      phases: [],
      modules: [],
      modulePhaseMapping: {}
    });
    result.project = project;
    result.created.push(`Project: ${project.name} (ID: ${project.id})`);

    // 5. Try to import config if requested and files exist
    if (importConfig) {
      try {
        const parser = new ConfigParser(projectRoot);
        const configFiles = await parser.findConfigFiles();

        if (configFiles.length > 0) {
          const importedConfig = await parser.autoImport(project);

          await updateProject(project.id, {
            phases: importedConfig.phases,
            modules: importedConfig.modules,
            modulePhaseMapping: importedConfig.modulePhaseMapping,
            configSource: importedConfig.configSource,
            lastImportedAt: importedConfig.lastImportedAt
          });

          // Update project reference
          project.phases = importedConfig.phases;
          project.modules = importedConfig.modules;
          project.modulePhaseMapping = importedConfig.modulePhaseMapping;
          project.configSource = importedConfig.configSource;

          result.imported = {
            source: importedConfig.configSource,
            phases: importedConfig.phases?.length || 0,
            modules: importedConfig.modules?.length || 0
          };
        }
      } catch (importError) {
        result.warnings.push(`Config import skipped: ${importError.message}`);
      }
    }

    // 6. Create nsma-config.md template if no config was imported and user requested it
    if (createConfigTemplate && !result.imported) {
      try {
        const configPath = join(projectRoot, '.nsma-config.md');
        if (!existsSync(configPath)) {
          const configContent = generateNsmaConfig(name, hookStyle);
          await writeFile(configPath, configContent);
          result.created.push(configPath);

          // 6b. Parse and import the newly-created config
          try {
            const parser = new ConfigParser(projectRoot);
            const newConfigFiles = await parser.findConfigFiles();

            if (newConfigFiles.length > 0) {
              const importedConfig = await parser.autoImport(project);

              await updateProject(project.id, {
                phases: importedConfig.phases,
                modules: importedConfig.modules,
                modulePhaseMapping: importedConfig.modulePhaseMapping,
                configSource: importedConfig.configSource,
                lastImportedAt: importedConfig.lastImportedAt
              });

              // Update local project reference
              project.phases = importedConfig.phases;
              project.modules = importedConfig.modules;
              project.modulePhaseMapping = importedConfig.modulePhaseMapping;
              project.configSource = importedConfig.configSource;

              result.imported = {
                source: importedConfig.configSource,
                phases: importedConfig.phases?.length || 0,
                modules: importedConfig.modules?.length || 0
              };
            }
          } catch (importErr) {
            result.warnings.push(`Created config but failed to import: ${importErr.message}`);
          }
        }
      } catch (err) {
        result.warnings.push(`Failed to create config template: ${err.message}`);
      }
    }

    // 7. Create .claude/hooks/session-start.sh
    try {
      const hooksDir = join(projectRoot, '.claude', 'hooks');
      const hookPath = join(hooksDir, 'session-start.sh');

      if (!existsSync(hooksDir)) {
        await mkdir(hooksDir, { recursive: true });
        result.created.push(hooksDir);
      }

      if (!existsSync(hookPath)) {
        const hookContent = generateSessionStartHook(projectRoot, name, promptsPath, hookStyle);
        await writeFile(hookPath, hookContent);
        await chmod(hookPath, 0o755); // Make executable
        result.created.push(hookPath);
      } else {
        result.warnings.push(`Hook already exists: ${hookPath}`);
      }
    } catch (hookError) {
      result.warnings.push(`Failed to create hook: ${hookError.message}`);
    }

    // 8. Queue Notion sync (offline-first - don't fail if unavailable)
    try {
      const settings = await getSettings();
      if (settings.notionToken && settings.notionDatabaseId) {
        const notion = new NotionClient(settings.notionToken);
        const projects = await getProjects();
        const slugs = projects.map(p => p.slug);
        await notion.syncProjectOptionsToDatabase(settings.notionDatabaseId, slugs);
        result.created.push('Notion: Project slug synced to database');
      } else {
        result.warnings.push('Notion sync skipped: Token not configured');
      }
    } catch (notionError) {
      result.warnings.push(`Notion sync queued for later: ${notionError.message}`);
    }

    result.success = true;
    return result;

  } catch (error) {
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Complete wizard run for programmatic use (Web API)
 * @param {Object} data - All wizard data collected from UI
 * @returns {Promise<Object>} Complete result
 */
export async function runWizardProgrammatic(data) {
  const {
    projectRoot,
    name,
    slug,
    promptsPath,
    importConfig,
    hookStyle,
    createConfigTemplate
  } = data;

  // Generate defaults if not provided
  const defaults = generateProjectDefaults(projectRoot);

  const wizardData = {
    projectRoot: projectRoot || defaults.projectRoot,
    name: name || defaults.name,
    slug: slug || defaults.slug,
    promptsPath: promptsPath || defaults.promptsPath,
    importConfig: importConfig !== false,
    hookStyle: hookStyle || 'full',
    createConfigTemplate: createConfigTemplate === true
  };

  // Validate paths first
  const pathValidation = validatePaths(wizardData.projectRoot, wizardData.promptsPath);
  if (!pathValidation.valid) {
    return {
      success: false,
      step: 'validation',
      errors: pathValidation.errors
    };
  }

  // Apply any corrections
  if (pathValidation.corrections.promptsPath) {
    wizardData.promptsPath = pathValidation.corrections.promptsPath;
  }

  // Execute wizard
  const result = await createProjectWithSetup(wizardData);
  return {
    ...result,
    pathValidation
  };
}
