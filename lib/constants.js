import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = process.env.NOTION_SYNC_CONFIG_DIR ||
  join(homedir(), '.notion-sync-manager');

// Projects base path - configurable for Docker deployment
export const PROJECTS_BASE_PATH = process.env.PROJECTS_BASE_PATH || '/';

export const PROJECTS_FILE = join(CONFIG_DIR, 'projects.json');
export const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json');
export const LOGS_FILE = join(CONFIG_DIR, 'sync-logs.json');

export const DEFAULT_SETTINGS = {
  notionToken: '',
  notionDatabaseId: '',
  registrationToken: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  aiProviderPriority: ['anthropic', 'gemini'],
  featureDevEnabled: true,
  featureDevTypes: ['Feature', 'Improvement'],
  featureDevSkillEnabled: true,         // Include /feature-dev skill instructions in prompts
  syncIntervalMinutes: 15,
  promptsSubfolders: ['pending', 'processed', 'archived', 'deferred'],
  successCriteriaTemplate: `- [ ] Implementation complete
- [ ] No TypeScript errors (\`npm run build\` passes)
- [ ] Follows existing patterns in related files
- [ ] Audit logging integrated (if data mutation)`
};

export const DEFAULT_PROJECT = {
  id: '',
  name: '',
  slug: '',
  active: true,
  createdAt: '',
  lastSyncAt: null,
  promptsPath: '',
  phases: [],
  modules: [],
  modulePhaseMapping: {},
  configSource: null,        // Which file was imported (.nsma-config.md, etc.)
  lastImportedAt: null,      // When config was last imported from docs
  configFileMtimes: {},      // Modification times of config files for change detection
  stats: { pending: 0, processed: 0, archived: 0, deferred: 0 },
  lastSync: null,            // { timestamp, imported, updated, skipped } after first sync

  // Reverse sync configuration (files → Notion)
  reverseSyncEnabled: true,           // Enable/disable reverse sync for this project
  reverseSyncErrorMode: 'skip',       // 'skip' | 'delete' | 'archive' - how to handle missing Notion pages
  lastReverseSync: null,              // { timestamp, updated, failed, skipped } after reverse sync

  // AI Prompt Configuration
  aiPromptEnabled: true,              // Enable/disable AI prompt expansion for this project
  aiPromptMode: 'extend',             // 'extend' | 'replace' - how custom prompt is applied
  aiPromptCustom: ''                  // Custom prompt text (appended or replacing default)
};

export const EFFORT_ESTIMATES = [
  'XS - < 2 hours',
  'S - 2-4 hours',
  'M - 1-2 days',
  'L - 3-5 days',
  'XL - 1+ week'
];

export const ITEM_TYPES = [
  'Feature',
  'Bug Fix',
  'Improvement',
  'Technical Debt',
  'Documentation',
  'Security Fix',
  'Research/Spike'
];

// Types that should always execute regardless of phase
export const ALWAYS_EXECUTE_TYPES = [
  'Bug Fix',
  'Documentation',
  'Security Fix',
  'Technical Debt'
];

// Inbox configuration
export const INBOX_PROJECT_ID = '__inbox__';
export const INBOX_PATH = join(CONFIG_DIR, 'inbox');

export const INBOX_PROJECT = {
  id: INBOX_PROJECT_ID,
  name: 'Inbox',
  slug: '__inbox__',
  active: true,
  isSystem: true,
  createdAt: new Date().toISOString(),
  lastSyncAt: null,
  promptsPath: INBOX_PATH,
  phases: [],
  modules: [],
  modulePhaseMapping: {},
  stats: { pending: 0, processed: 0, archived: 0, deferred: 0 },
  lastSync: null
};
