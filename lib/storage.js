import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { CONFIG_DIR, PROJECTS_FILE, SETTINGS_FILE, LOGS_FILE, DEFAULT_SETTINGS } from './constants.js';

// Ensure config directory exists
async function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

// Settings
export async function getSettings() {
  await ensureConfigDir();
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  await ensureConfigDir();
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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
  await writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
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
export async function getLogs(limit = 100) {
  await ensureConfigDir();
  try {
    const data = await readFile(LOGS_FILE, 'utf-8');
    const logs = JSON.parse(data);
    return logs.slice(-limit);
  } catch {
    return [];
  }
}

export async function addLog(entry) {
  await ensureConfigDir();
  const logs = await getLogs(1000);
  logs.push({
    ...entry,
    timestamp: new Date().toISOString()
  });
  // Keep last 1000 entries
  const trimmed = logs.slice(-1000);
  await writeFile(LOGS_FILE, JSON.stringify(trimmed, null, 2));
  return entry;
}
