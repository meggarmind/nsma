import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = process.env.NOTION_SYNC_CONFIG_DIR ||
  join(homedir(), '.notion-sync-manager');

export const PROJECTS_FILE = join(CONFIG_DIR, 'projects.json');
export const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json');
export const LOGS_FILE = join(CONFIG_DIR, 'sync-logs.json');

export const DEFAULT_SETTINGS = {
  notionToken: '',
  notionDatabaseId: '2d22bfe3ea0c81059ebef821673358c3',
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
  stats: { pending: 0, processed: 0, archived: 0, deferred: 0 }
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
  stats: { pending: 0, processed: 0, archived: 0, deferred: 0 }
};
