import { existsSync } from 'fs';
import { join } from 'path';
import { getProjects } from './storage.js';

// Slug format: lowercase, numbers, hyphens only
const SLUG_REGEX = /^[a-z0-9-]+$/;

// Reserved slugs that cannot be used
const RESERVED_SLUGS = ['__inbox__', 'inbox', 'settings', 'api', 'admin'];

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate project registration data
 * @throws {ValidationError} If validation fails
 */
export async function validateProjectRegistration(data) {
  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    throw new ValidationError('Project name is required', 'name');
  }

  if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '') {
    throw new ValidationError('Project slug is required', 'slug');
  }

  if (!data.promptsPath || typeof data.promptsPath !== 'string' || data.promptsPath.trim() === '') {
    throw new ValidationError('Prompts path is required', 'promptsPath');
  }

  // Slug format validation
  const slug = data.slug.trim();

  if (!SLUG_REGEX.test(slug)) {
    throw new ValidationError(
      'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
      'slug'
    );
  }

  if (slug.startsWith('-') || slug.endsWith('-')) {
    throw new ValidationError(
      'Slug cannot start or end with a hyphen',
      'slug'
    );
  }

  if (slug.includes('--')) {
    throw new ValidationError(
      'Slug cannot contain consecutive hyphens',
      'slug'
    );
  }

  if (RESERVED_SLUGS.includes(slug)) {
    throw new ValidationError(
      `Slug "${slug}" is reserved and cannot be used`,
      'slug'
    );
  }

  // Path validation
  let promptsPath = data.promptsPath.trim();

  if (!promptsPath.startsWith('/')) {
    throw new ValidationError(
      'Prompts path must be an absolute path',
      'promptsPath'
    );
  }

  // Validate and auto-correct /prompts suffix
  const pathValidation = validatePromptsPath(promptsPath);
  if (pathValidation.corrected) {
    promptsPath = pathValidation.path;
    data.promptsPath = promptsPath;  // Mutate the input to fix it
    console.warn(`Auto-corrected promptsPath: ${data.promptsPath.trim()} → ${promptsPath}`);
  }

  // Check if path exists (parent directory must exist)
  const parentPath = promptsPath.split('/').slice(0, -1).join('/');
  if (parentPath && !existsSync(parentPath)) {
    throw new ValidationError(
      `Parent directory does not exist: ${parentPath}`,
      'promptsPath'
    );
  }

  return true;
}

/**
 * Validate and optionally correct a prompts path
 * Path must end with '/prompts' to prevent creating folders in project root
 *
 * @param {string} path - The prompts path to validate
 * @returns {{ valid: boolean, corrected: boolean, path: string, warning?: string }}
 */
export function validatePromptsPath(path) {
  if (!path) {
    return { valid: false, corrected: false, path, warning: 'Path is required' };
  }

  const normalizedPath = path.trim();

  // Check if path ends with /prompts
  if (normalizedPath.endsWith('/prompts') || normalizedPath.endsWith('\\prompts')) {
    return { valid: true, corrected: false, path: normalizedPath };
  }

  // Check if it ends with /prompts/ (trailing slash)
  if (normalizedPath.endsWith('/prompts/') || normalizedPath.endsWith('\\prompts\\')) {
    const correctedPath = normalizedPath.slice(0, -1);  // Remove trailing slash
    return { valid: true, corrected: true, path: correctedPath };
  }

  // Auto-correct by appending /prompts
  const correctedPath = join(normalizedPath, 'prompts');
  return {
    valid: true,
    corrected: true,
    path: correctedPath,
    warning: `Path should end with '/prompts'. Auto-corrected to: ${correctedPath}`
  };
}

/**
 * Check if slug is already in use
 * @returns {Object|null} Existing project or null
 */
export async function findProjectBySlug(slug) {
  const projects = await getProjects();
  return projects.find(p => p.slug === slug) || null;
}
