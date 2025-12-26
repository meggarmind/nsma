import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Configuration Parser for extracting project config from markdown documentation files
 * Supports multiple documentation formats and intelligent merging with existing config
 */
export class ConfigParser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.supportedFiles = [
      '.nsma-config.md',
      '.nsma/config.md',
      'PERSPECTIVE.md',
      'ARCHITECTURE.md',
      'PROJECT_CONFIG.md',
      'Claude.md',
      'TODO.md'
    ];
    this.docsFolders = ['architecture', 'setup', 'security', 'api'];
  }

  /**
   * Find configuration files in project directory
   * @returns {Promise<Array<{filename: string, filepath: string}>>}
   */
  async findConfigFiles() {
    const found = [];

    // Scan root-level supported files
    for (const filename of this.supportedFiles) {
      const filepath = join(this.projectPath, filename);
      if (existsSync(filepath)) {
        found.push({ filename, filepath });
      }
    }

    // Scan docs/ subfolders
    const docsFiles = await this.scanDocsFolder();
    found.push(...docsFiles);

    return found;
  }

  /**
   * Scan docs/ subfolders for markdown files
   * @returns {Promise<Array<{filename: string, filepath: string}>>}
   */
  async scanDocsFolder() {
    const found = [];
    const docsPath = join(this.projectPath, 'docs');

    if (!existsSync(docsPath)) {
      return found;
    }

    for (const folder of this.docsFolders) {
      const folderPath = join(docsPath, folder);

      if (!existsSync(folderPath)) {
        continue;
      }

      try {
        const files = await readdir(folderPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filepath = join(folderPath, file);
            found.push({
              filename: `docs/${folder}/${file}`,
              filepath
            });
          }
        }
      } catch (error) {
        // Skip folders we can't read
        continue;
      }
    }

    return found;
  }

  /**
   * Parse a single config file
   * @param {string} filepath - Path to the config file
   * @returns {Promise<Object>} Parsed configuration
   */
  async parseConfigFile(filepath) {
    const content = await readFile(filepath, 'utf-8');

    // Parse YAML frontmatter
    const frontmatter = this.parseFrontmatter(content);

    // Parse markdown content
    const phases = this.parsePhases(content);
    const modules = this.parseModules(content);
    const mapping = this.generateMapping(modules, phases);

    return {
      frontmatter,
      phases,
      modules,
      modulePhaseMapping: mapping,
      sourceFile: filepath
    };
  }

  /**
   * Parse YAML frontmatter from markdown
   * @param {string} content - File content
   * @returns {Object} Frontmatter data
   */
  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim();
        // Remove quotes if present
        frontmatter[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }

    return frontmatter;
  }

  /**
   * Parse phases from markdown sections
   * @param {string} content - File content
   * @returns {Array<Object>} Array of phase objects
   */
  parsePhases(content) {
    const phases = [];
    const phaseRegex = /###\s+(.+?)\n([\s\S]*?)(?=###|##\s+Modules|$)/g;

    // Find the "Development Phases" section
    const phasesSection = content.match(/##\s+Development Phases\n([\s\S]*?)(?=##\s+Modules|$)/);
    if (!phasesSection) return phases;

    const section = phasesSection[1];
    let match;

    while ((match = phaseRegex.exec(section)) !== null) {
      const name = match[1].trim();
      const body = match[2].trim();

      // Extract metadata from bullet points
      const idMatch = body.match(/\*\*ID\*\*:\s*`([^`]+)`/);
      const descMatch = body.match(/\*\*Description\*\*:\s*(.+?)(?:\n|$)/);
      const keywordsMatch = body.match(/\*\*Keywords\*\*:\s*(.+?)(?:\n|$)/);
      const priorityMatch = body.match(/\*\*Priority\*\*:\s*(\d+)/);

      const phase = {
        id: idMatch ? idMatch[1] : this.generateId(name),
        name,
        description: descMatch ? descMatch[1].trim() : '',
        keywords: keywordsMatch
          ? keywordsMatch[1].split(',').map(k => k.trim()).filter(Boolean)
          : [],
        priority: priorityMatch ? parseInt(priorityMatch[1]) : 99
      };

      phases.push(phase);
    }

    // Sort by priority
    return phases.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Parse modules from markdown sections
   * @param {string} content - File content
   * @returns {Array<Object>} Array of module objects
   */
  parseModules(content) {
    const modules = [];
    const moduleRegex = /###\s+(.+?)\n([\s\S]*?)(?=###|##\s+Module-Phase|$)/g;

    // Find the "Modules" section
    const modulesSection = content.match(/##\s+Modules\n([\s\S]*?)(?=##\s+Module-Phase|$)/);
    if (!modulesSection) return modules;

    const section = modulesSection[1];
    let match;

    while ((match = moduleRegex.exec(section)) !== null) {
      const name = match[1].trim();
      const body = match[2].trim();

      // Extract metadata
      const idMatch = body.match(/\*\*ID\*\*:\s*`([^`]+)`/);
      const phaseMatch = body.match(/\*\*Phase\*\*:\s*`?([^`\n]+)`?/);

      // Extract file paths (look for list items with path-like strings)
      const pathsMatch = body.match(/\*\*Paths\*\*:\s*([\s\S]*?)(?=\n\*\*|$)/);
      let filePaths = [];

      if (pathsMatch) {
        const pathsText = pathsMatch[1];
        const pathLines = pathsText.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-'))
          .map(line => line.replace(/^-\s*`?/, '').replace(/`$/, '').trim())
          .filter(Boolean);
        filePaths = pathLines;
      }

      const module = {
        id: idMatch ? idMatch[1] : this.generateId(name),
        name,
        filePaths,
        phase: phaseMatch ? phaseMatch[1].trim() : null
      };

      modules.push(module);
    }

    return modules;
  }

  /**
   * Generate module-phase mapping from module definitions
   * @param {Array<Object>} modules - Parsed modules
   * @param {Array<Object>} phases - Parsed phases
   * @returns {Object} Module ID to Phase ID mapping
   */
  generateMapping(modules, phases) {
    const mapping = {};

    for (const module of modules) {
      if (!module.phase) continue;

      // Find matching phase by name or ID
      const phase = phases.find(p =>
        p.name === module.phase ||
        p.id === module.phase ||
        p.name.includes(module.phase)
      );

      if (phase) {
        mapping[module.id] = phase.id;
      }
    }

    return mapping;
  }

  /**
   * Generate stable ID from name
   * @param {string} name - Name to generate ID from
   * @returns {string} Generated ID
   */
  generateId(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  /**
   * Merge parsed config with existing project config
   * Preserves existing IDs when possible
   * @param {Object} parsedConfig - Newly parsed configuration
   * @param {Object} existingProject - Existing project data
   * @returns {Object} Merged configuration
   */
  mergeWithExisting(parsedConfig, existingProject) {
    const merged = {
      phases: this.mergePhases(parsedConfig.phases, existingProject.phases || []),
      modules: this.mergeModules(parsedConfig.modules, existingProject.modules || []),
    };

    // Regenerate mapping after merge (IDs may have changed)
    merged.modulePhaseMapping = this.regenerateMapping(
      merged.modules,
      merged.phases,
      parsedConfig.modulePhaseMapping
    );

    return merged;
  }

  /**
   * Merge phases, preserving existing IDs
   * @param {Array<Object>} newPhases - New phases from docs
   * @param {Array<Object>} existingPhases - Existing phases from project
   * @returns {Array<Object>} Merged phases
   */
  mergePhases(newPhases, existingPhases) {
    const merged = [];

    for (const newPhase of newPhases) {
      // Try to find matching existing phase by name
      const existing = existingPhases.find(p =>
        p.name === newPhase.name || p.id === newPhase.id
      );

      if (existing) {
        // Preserve existing ID, update other fields
        merged.push({
          ...newPhase,
          id: existing.id
        });
      } else {
        // New phase, keep generated ID
        merged.push(newPhase);
      }
    }

    return merged;
  }

  /**
   * Merge modules, preserving existing IDs
   * @param {Array<Object>} newModules - New modules from docs
   * @param {Array<Object>} existingModules - Existing modules from project
   * @returns {Array<Object>} Merged modules
   */
  mergeModules(newModules, existingModules) {
    const merged = [];

    for (const newModule of newModules) {
      const existing = existingModules.find(m =>
        m.name === newModule.name || m.id === newModule.id
      );

      if (existing) {
        merged.push({
          ...newModule,
          id: existing.id
        });
      } else {
        merged.push(newModule);
      }
    }

    return merged;
  }

  /**
   * Regenerate mapping with preserved IDs
   * @param {Array<Object>} modules - Merged modules
   * @param {Array<Object>} phases - Merged phases
   * @param {Object} originalMapping - Original parsed mapping
   * @returns {Object} Regenerated mapping
   */
  regenerateMapping(modules, phases, originalMapping) {
    const mapping = {};

    for (const module of modules) {
      if (!module.phase) continue;

      const phase = phases.find(p =>
        p.name === module.phase || p.id === module.phase
      );

      if (phase) {
        mapping[module.id] = phase.id;
      }
    }

    return mapping;
  }

  /**
   * Parse multiple config files and merge their content
   * @param {Array<Object>} configFiles - Array of {filename, filepath} objects
   * @returns {Promise<Object>} Merged configuration
   */
  async parseMultipleFiles(configFiles) {
    const configs = [];

    for (const {filename, filepath} of configFiles) {
      try {
        const config = await this.parseConfigFile(filepath);
        config.sourceFile = filename;
        configs.push(config);
      } catch (error) {
        // Skip files that can't be parsed
        console.log(`Skipping ${filename}: ${error.message}`);
        continue;
      }
    }

    if (configs.length === 0) {
      throw new Error('No valid configuration found in any file');
    }

    // If only one config, return it directly
    if (configs.length === 1) {
      return configs[0];
    }

    // Merge multiple configs
    return this.mergeConfigs(configs);
  }

  /**
   * Merge configurations from multiple files
   * @param {Array<Object>} configs - Array of parsed configs
   * @returns {Object} Merged configuration
   */
  mergeConfigs(configs) {
    const merged = {
      phases: [],
      modules: [],
      modulePhaseMapping: {},
      sourceFiles: configs.map(c => c.sourceFile)
    };

    const phaseMap = new Map(); // Track phases by name for deduplication
    const moduleMap = new Map(); // Track modules by name for deduplication

    // Merge phases from all configs
    for (const config of configs) {
      for (const phase of config.phases || []) {
        const existing = phaseMap.get(phase.name);

        if (existing) {
          // Merge keywords (union)
          const mergedKeywords = [...new Set([...existing.keywords, ...phase.keywords])];
          existing.keywords = mergedKeywords;
          // Keep first description (priority order)
        } else {
          phaseMap.set(phase.name, { ...phase });
        }
      }
    }

    // Merge modules from all configs
    for (const config of configs) {
      for (const module of config.modules || []) {
        const existing = moduleMap.get(module.name);

        if (existing) {
          // Merge file paths (union)
          const mergedPaths = [...new Set([...existing.filePaths, ...module.filePaths])];
          existing.filePaths = mergedPaths;
          // Keep first phase assignment (priority order)
          if (!existing.phase && module.phase) {
            existing.phase = module.phase;
          }
        } else {
          moduleMap.set(module.name, { ...module });
        }
      }
    }

    merged.phases = Array.from(phaseMap.values()).sort((a, b) => a.priority - b.priority);
    merged.modules = Array.from(moduleMap.values());

    // Generate mapping from merged modules and phases
    merged.modulePhaseMapping = this.generateMapping(merged.modules, merged.phases);

    return merged;
  }

  /**
   * Main entry point: Auto-import config
   * @param {Object} existingProject - Optional existing project data
   * @returns {Promise<Object>} Imported configuration
   */
  async autoImport(existingProject = null) {
    const configFiles = await this.findConfigFiles();

    if (configFiles.length === 0) {
      throw new Error('No configuration files found in project directory');
    }

    // Parse and merge all found config files
    const parsedConfig = await this.parseMultipleFiles(configFiles);

    // Determine config source(s)
    const configSource = parsedConfig.sourceFiles
      ? parsedConfig.sourceFiles.join(', ')
      : parsedConfig.sourceFile;

    // If existing project data, merge intelligently
    if (existingProject) {
      return {
        ...this.mergeWithExisting(parsedConfig, existingProject),
        configSource,
        lastImportedAt: new Date().toISOString()
      };
    }

    // New project, use parsed config as-is
    return {
      phases: parsedConfig.phases,
      modules: parsedConfig.modules,
      modulePhaseMapping: parsedConfig.modulePhaseMapping,
      configSource,
      lastImportedAt: new Date().toISOString()
    };
  }
}
