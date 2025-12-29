import { readFile, writeFile, mkdir, readdir, unlink, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, isAbsolute, dirname } from 'path';
import { CONFIG_DIR, PROJECTS_FILE, SETTINGS_FILE, LOGS_FILE, DEFAULT_SETTINGS, INBOX_PROJECT_ID, INBOX_PROJECT, INBOX_PATH, PROJECTS_BASE_PATH } from './constants.js';

// Ensure config directory exists
async function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Atomically write JSON data to a file
 * Writes to a temp file first, then renames to prevent corruption from interrupted writes
 *
 * @param {string} filepath - Target file path
 * @param {object} data - Data to write as JSON
 */
async function atomicWriteJSON(filepath, data) {
  const tempPath = `${filepath}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2));
  await rename(tempPath, filepath);
}

/**
 * Resolve project prompts path
 * Handles both absolute paths (legacy) and relative paths (Docker)
 *
 * @param {string} promptsPath - The prompts path from project config
 * @returns {string|null} - Resolved absolute path or null
 */
export function resolvePromptsPath(promptsPath) {
  if (!promptsPath) return null;

  // If absolute path, use as-is (backward compatibility)
  if (isAbsolute(promptsPath)) {
    return promptsPath;
  }

  // If relative, resolve against PROJECTS_BASE_PATH
  return join(PROJECTS_BASE_PATH, promptsPath);
}

/**
 * Get project root from prompts path
 * Strips /prompts suffix if present
 *
 * @param {string} promptsPath - The prompts path from project config
 * @returns {string|null} - Project root directory or null
 */
export function getProjectRoot(promptsPath) {
  const resolved = resolvePromptsPath(promptsPath);
  if (!resolved) return null;

  // If path ends with /prompts, strip it to get project root
  if (resolved.endsWith('/prompts') || resolved.endsWith('/prompts/')) {
    return resolved.replace(/\/prompts\/?$/, '');
  }

  // Otherwise use parent directory (legacy behavior)
  return dirname(resolved);
}

// Settings
export async function getSettings() {
  await ensureConfigDir();

  let settings;
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }

  // Override with environment variables if present (for Docker deployment)
  if (process.env.NOTION_TOKEN) {
    settings.notionToken = process.env.NOTION_TOKEN;
  }
  if (process.env.NOTION_DATABASE_ID) {
    settings.notionDatabaseId = process.env.NOTION_DATABASE_ID;
  }
  if (process.env.REGISTRATION_TOKEN) {
    settings.registrationToken = process.env.REGISTRATION_TOKEN;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    settings.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  return settings;
}

export async function saveSettings(settings) {
  await ensureConfigDir();
  await atomicWriteJSON(SETTINGS_FILE, settings);
  return settings;
}

// Projects - ALL projects stored in single file
export async function getProjects() {
  await ensureConfigDir();
  try {
    const data = await readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveProjects(projects) {
  await ensureConfigDir();
  await atomicWriteJSON(PROJECTS_FILE, projects);
  return projects;
}

export async function getProject(id) {
  const projects = await getProjects();
  return projects.find(p => p.id === id) || null;
}

export async function createProject(project) {
  const projects = await getProjects();
  const newProject = {
    ...project,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
    stats: { pending: 0, processed: 0, archived: 0, deferred: 0 }
  };
  projects.push(newProject);
  await saveProjects(projects);
  return newProject;
}

export async function updateProject(id, updates) {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Project not found');
  projects[index] = { ...projects[index], ...updates };
  await saveProjects(projects);
  return projects[index];
}

export async function deleteProject(id) {
  const projects = await getProjects();
  const filtered = projects.filter(p => p.id !== id);
  await saveProjects(filtered);
  return { success: true };
}

// Logs

/**
 * Get logs with optional level filtering
 * @param {number} limit - Maximum number of logs to return
 * @param {string|null} level - Filter by level ('info', 'warn', 'error') or null for all
 * @returns {Promise<Array>} - Array of log entries
 */
export async function getLogs(limit = 100, level = null) {
  await ensureConfigDir();
  try {
    const data = await readFile(LOGS_FILE, 'utf-8');
    let logs = JSON.parse(data);

    // Filter by level if specified
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    return logs.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Add a log entry with structured data
 *
 * Enhanced log structure:
 * {
 *   level: 'info' | 'warn' | 'error',
 *   operation: 'sync' | 'reverse-sync' | 'expand' | 'import',
 *   projectId: string,
 *   projectName: string,
 *   itemId?: string,       // Optional: specific item being processed
 *   itemTitle?: string,    // Optional: human-readable item reference
 *   message: string,       // Descriptive message
 *   details?: object,      // Optional: error details, stack trace
 *   imported?: number,
 *   updated?: number,
 *   errors?: number,
 *   items?: string[],
 *   timestamp: string      // Auto-added
 * }
 */
export async function addLog(entry) {
  await ensureConfigDir();
  const logs = await getLogs(1000);

  // Ensure level is set (default to 'info' for backwards compatibility)
  const logEntry = {
    level: 'info',
    ...entry,
    timestamp: new Date().toISOString()
  };

  logs.push(logEntry);

  // Keep last 1000 entries
  const trimmed = logs.slice(-1000);
  await atomicWriteJSON(LOGS_FILE, trimmed);
  return logEntry;
}

/**
 * Log an info-level entry
 * Use for successful operations, normal sync completion
 */
export async function logInfo(entry) {
  return addLog({ ...entry, level: 'info' });
}

/**
 * Log a warning-level entry
 * Use for partial failures, skipped items, non-critical issues
 */
export async function logWarn(entry) {
  return addLog({ ...entry, level: 'warn' });
}

/**
 * Log an error-level entry
 * Use for failures, exceptions, critical issues
 * @param {Object} entry - Log entry data
 * @param {Error} [error] - Optional error object to extract details from
 */
export async function logError(entry, error = null) {
  const logEntry = { ...entry, level: 'error' };

  // Extract error details if provided
  if (error) {
    logEntry.details = {
      message: error.message,
      code: error.code,
      status: error.status || error.statusCode,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
    };
  }

  return addLog(logEntry);
}

// Inbox functions
/**
 * Get or create the system Inbox project
 */
export async function getOrCreateInboxProject() {
  await ensureConfigDir();

  // Ensure inbox directory exists
  if (!existsSync(INBOX_PATH)) {
    await mkdir(INBOX_PATH, { recursive: true });
  }

  // Ensure inbox subfolders exist
  const subfolders = ['pending', 'processed', 'archived', 'deferred'];
  for (const folder of subfolders) {
    const dir = join(INBOX_PATH, folder);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  return { ...INBOX_PROJECT, promptsPath: INBOX_PATH };
}

/**
 * Get all projects including the Inbox
 */
export async function getAllProjectsWithInbox() {
  const projects = await getProjects();
  const inbox = await getOrCreateInboxProject();
  return [inbox, ...projects];
}

/**
 * Get inbox stats (count of pending items)
 */
export async function getInboxStats() {
  const inboxPath = join(INBOX_PATH, 'pending');

  if (!existsSync(inboxPath)) {
    return { pending: 0, processed: 0, archived: 0, deferred: 0 };
  }

  try {
    const files = await readdir(inboxPath);
    const pending = files.filter(f => f.endsWith('.md')).length;
    return { pending, processed: 0, archived: 0, deferred: 0 };
  } catch {
    return { pending: 0, processed: 0, archived: 0, deferred: 0 };
  }
}

/**
 * Get list of inbox items with metadata
 */
export async function getInboxItems() {
  const inboxPath = join(INBOX_PATH, 'pending');

  if (!existsSync(inboxPath)) {
    return [];
  }

  try {
    const files = await readdir(inboxPath);
    const items = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filepath = join(inboxPath, file);
      const content = await readFile(filepath, 'utf-8');

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const metadata = {};

      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        frontmatter.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            metadata[key.trim()] = valueParts.join(':').trim();
          }
        });
      }

      // Extract title
      const titleMatch = content.match(/^# Development Task: (.+)$/m);
      const title = titleMatch ? titleMatch[1] : file.replace('.md', '');

      items.push({
        id: metadata.notion_page_id || file,
        filename: file,
        filepath,
        title,
        type: metadata.type || 'Unknown',
        priority: metadata.priority || 'Medium',
        capturedDate: metadata.generated_at || null,
        notionUrl: metadata.notion_url || null,
        notionPageId: metadata.notion_page_id || null,
        originalProject: metadata.original_project || null
      });
    }

    return items;
  } catch (error) {
    console.error('Error reading inbox items:', error);
    return [];
  }
}

/**
 * Move an inbox item to a project
 */
export async function moveInboxItemToProject(filename, projectId) {
  const projects = await getProjects();
  const project = projects.find(p => p.id === projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.promptsPath) {
    throw new Error('Project has no prompts path configured');
  }

  const sourcePath = join(INBOX_PATH, 'pending', filename);
  const destPath = join(project.promptsPath, 'pending', filename);

  if (!existsSync(sourcePath)) {
    throw new Error('Inbox item not found');
  }

  // Ensure destination directory exists
  const destDir = join(project.promptsPath, 'pending');
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  // Read, update, and write to new location
  let content = await readFile(sourcePath, 'utf-8');

  // Update project in frontmatter
  content = content.replace(
    /^project: .+$/m,
    `project: ${project.slug}`
  );

  // Write to destination
  await writeFile(destPath, content);

  // Delete from inbox
  await unlink(sourcePath);

  return {
    moved: true,
    from: sourcePath,
    to: destPath,
    project: project.name
  };
}

/**
 * Count prompts in each subfolder of a project's prompts directory
 * Returns live stats from disk (not cached)
 *
 * @param {string} promptsPath - Path to the prompts directory
 * @returns {Promise<{pending: number, processed: number, archived: number, deferred: number}>}
 */
export async function countPrompts(promptsPath) {
  const stats = { pending: 0, processed: 0, archived: 0, deferred: 0 };

  if (!promptsPath || !existsSync(promptsPath)) {
    return stats;
  }

  for (const folder of Object.keys(stats)) {
    const dir = join(promptsPath, folder);
    if (existsSync(dir)) {
      try {
        const files = await readdir(dir);
        stats[folder] = files.filter(f => f.endsWith('.md')).length;
      } catch {
        // Ignore errors reading directory
      }
    }
  }

  return stats;
}

/**
 * Refresh stats for a single project from disk
 * Updates the project in storage and returns the new stats
 *
 * @param {string} projectId - The project ID to refresh
 * @returns {Promise<{pending: number, processed: number, archived: number, deferred: number}|null>}
 */
export async function refreshProjectStats(projectId) {
  const project = await getProject(projectId);
  if (!project) return null;

  const stats = await countPrompts(project.promptsPath);
  await updateProject(projectId, { stats });
  return stats;
}

/**
 * Refresh stats for all projects from disk
 *
 * @returns {Promise<Array<{id: string, name: string, stats: object}>>}
 */
export async function refreshAllProjectStats() {
  const projects = await getProjects();
  const results = [];

  for (const project of projects) {
    const stats = await countPrompts(project.promptsPath);
    await updateProject(project.id, { stats });
    results.push({ id: project.id, name: project.name, stats });
  }

  return results;
}
