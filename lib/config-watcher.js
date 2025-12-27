import chokidar from 'chokidar';
import { stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { ConfigParser } from './config-parser.js';
import { getProjects, updateProject, getProject } from './storage.js';

/**
 * ConfigWatcher monitors project documentation files and automatically
 * refreshes phases, modules, and mappings when changes are detected.
 */
export class ConfigWatcher {
  constructor(options = {}) {
    this.watchers = new Map(); // projectId -> chokidar watcher
    this.debounceTimers = new Map(); // projectId -> timer
    this.debounceMs = options.debounceMs || 300;
    this.verbose = options.verbose || false;
  }

  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Get the project root path (parent of promptsPath)
   */
  getProjectRoot(project) {
    if (!project.promptsPath) return null;
    // promptsPath is typically /path/to/project/prompts or /path/to/project
    // We want the project root, which contains the config files
    const promptsPath = project.promptsPath;
    // If promptsPath ends with 'prompts', go up one level
    if (promptsPath.endsWith('/prompts') || promptsPath.endsWith('\\prompts')) {
      return dirname(promptsPath);
    }
    return promptsPath;
  }

  /**
   * Get list of config file paths to watch for a project
   */
  async getWatchPaths(project) {
    const projectRoot = this.getProjectRoot(project);
    if (!projectRoot || !existsSync(projectRoot)) {
      return [];
    }

    const parser = new ConfigParser(projectRoot);
    const configFiles = await parser.findConfigFiles();
    return configFiles.map(f => f.filepath);
  }

  /**
   * Start watching a project's config files
   */
  async watchProject(project) {
    if (this.watchers.has(project.id)) {
      return; // Already watching
    }

    const watchPaths = await this.getWatchPaths(project);
    if (watchPaths.length === 0) {
      this.log(`  No config files found for ${project.name}`);
      return;
    }

    this.log(`  Watching ${watchPaths.length} config files for ${project.name}`);

    const watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    watcher.on('change', (path) => {
      this.log(`  Config file changed: ${path}`);
      this.debouncedRefresh(project);
    });

    watcher.on('error', (error) => {
      console.error(`  Watcher error for ${project.name}:`, error.message);
    });

    this.watchers.set(project.id, watcher);
  }

  /**
   * Stop watching a project
   */
  async unwatchProject(projectId) {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(projectId);
    }

    const timer = this.debounceTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectId);
    }
  }

  /**
   * Stop all watchers
   */
  async unwatchAll() {
    for (const [projectId] of this.watchers) {
      await this.unwatchProject(projectId);
    }
  }

  /**
   * Debounced config refresh to handle rapid file changes
   */
  debouncedRefresh(project) {
    const existingTimer = this.debounceTimers.get(project.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(project.id);
      await this.refreshConfig(project);
    }, this.debounceMs);

    this.debounceTimers.set(project.id, timer);
  }

  /**
   * Check if config files have changed since last import
   * Uses file modification times for detection
   */
  async hasConfigChanged(project) {
    const projectRoot = this.getProjectRoot(project);
    if (!projectRoot || !existsSync(projectRoot)) {
      return false;
    }

    const parser = new ConfigParser(projectRoot);

    try {
      const configFiles = await parser.findConfigFiles();
      const lastMtimes = project.configFileMtimes || {};

      for (const file of configFiles) {
        try {
          const stats = await stat(file.filepath);
          const lastMtime = lastMtimes[file.filepath];

          if (!lastMtime || stats.mtimeMs > lastMtime) {
            return true;
          }
        } catch {
          // File might have been deleted or is inaccessible
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get current modification times for all config files
   */
  async getConfigMtimes(project) {
    const projectRoot = this.getProjectRoot(project);
    if (!projectRoot || !existsSync(projectRoot)) {
      return {};
    }

    const parser = new ConfigParser(projectRoot);
    const mtimes = {};

    try {
      const configFiles = await parser.findConfigFiles();

      for (const file of configFiles) {
        try {
          const stats = await stat(file.filepath);
          mtimes[file.filepath] = stats.mtimeMs;
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore errors
    }

    return mtimes;
  }

  /**
   * Refresh config for a single project
   * Returns object with what changed
   */
  async refreshConfig(project) {
    const projectRoot = this.getProjectRoot(project);
    if (!projectRoot || !existsSync(projectRoot)) {
      return { success: false, error: 'Project path not found' };
    }

    const parser = new ConfigParser(projectRoot);

    try {
      // Get current project state for comparison
      const currentProject = await getProject(project.id);
      if (!currentProject) {
        return { success: false, error: 'Project not found' };
      }

      const beforePhases = currentProject.phases?.length || 0;
      const beforeModules = currentProject.modules?.length || 0;

      // Parse and merge config
      const importedConfig = await parser.autoImport(currentProject);

      // Get current modification times
      const configFileMtimes = await this.getConfigMtimes(project);

      // Update project
      await updateProject(project.id, {
        phases: importedConfig.phases,
        modules: importedConfig.modules,
        modulePhaseMapping: importedConfig.modulePhaseMapping,
        configSource: importedConfig.configSource,
        lastImportedAt: importedConfig.lastImportedAt,
        configFileMtimes
      });

      const afterPhases = importedConfig.phases?.length || 0;
      const afterModules = importedConfig.modules?.length || 0;

      console.log(`  Config refreshed for ${project.name}:`);
      console.log(`    Phases: ${beforePhases} -> ${afterPhases}`);
      console.log(`    Modules: ${beforeModules} -> ${afterModules}`);

      return {
        success: true,
        changes: {
          phasesBefore: beforePhases,
          phasesAfter: afterPhases,
          modulesBefore: beforeModules,
          modulesAfter: afterModules
        }
      };
    } catch (error) {
      console.error(`  Config refresh failed for ${project.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Refresh configs for all active projects (interval-based)
   * Only refreshes if changes detected
   */
  async refreshAllConfigs() {
    const projects = await getProjects();
    const activeProjects = projects.filter(p => p.active);

    let refreshed = 0;
    let checked = 0;

    for (const project of activeProjects) {
      checked++;

      const hasChanged = await this.hasConfigChanged(project);
      if (hasChanged) {
        const result = await this.refreshConfig(project);
        if (result.success) {
          refreshed++;
        }
      }
    }

    if (refreshed > 0) {
      console.log(`  Config refresh: ${refreshed}/${checked} projects updated`);
    }

    return { checked, refreshed };
  }

  /**
   * Start watching all active projects
   */
  async watchAllProjects() {
    const projects = await getProjects();
    const activeProjects = projects.filter(p => p.active);

    console.log(`Starting config watchers for ${activeProjects.length} active projects`);

    for (const project of activeProjects) {
      await this.watchProject(project);
    }
  }
}
