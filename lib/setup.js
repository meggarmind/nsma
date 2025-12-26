import { mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Create project directory structure
 * @returns {string[]} Array of created directory paths
 */
export async function createProjectDirectories(promptsPath) {
  const subdirs = ['pending', 'processed', 'archived', 'deferred'];
  const created = [];

  // Create base prompts directory if it doesn't exist
  if (!existsSync(promptsPath)) {
    await mkdir(promptsPath, { recursive: true });
    created.push(promptsPath);
  }

  // Create subdirectories
  for (const subdir of subdirs) {
    const dirPath = join(promptsPath, subdir);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
      created.push(dirPath);
    }
  }

  return created;
}
