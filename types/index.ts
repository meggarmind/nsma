// =============================================================================
// NSMA Type Definitions
// =============================================================================

import type { ReactNode, ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

// =============================================================================
// Project Types
// =============================================================================

export interface ProjectStats {
  totalPages: number;
  processedItems: number;
  lastUpdated: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  rootPageId: string;
  active: boolean;
  lastSync?: string;
  stats?: ProjectStats;
  promptConfig?: PromptConfig;
}

export interface PromptConfig {
  customPrompt?: string;
  expansionMode?: 'default' | 'concise' | 'detailed';
}

// =============================================================================
// Sync Types
// =============================================================================

export interface DaemonStatus {
  running: boolean;
  status: string;
  uptime: string | null;
}

export interface SyncMetrics {
  lastSync?: {
    timestamp: string;
    processed: number;
  };
  totalSyncs?: number;
  failedSyncs?: number;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  type: 'sync' | 'error' | 'info';
  message: string;
  projectId?: string;
}

export type SyncPauseType = 'timed' | 'manual' | null;

export interface SyncStatus {
  daemon: DaemonStatus;
  metrics: SyncMetrics;
  recentLogs?: SyncLog[];
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  lastCheckAt: string | null;
  syncPausedUntil: string | null;
  syncPauseType: SyncPauseType;
}

// =============================================================================
// Inbox Types
// =============================================================================

export interface InboxItem {
  id: string;
  title: string;
  type: string;
  url?: string;
  createdAt: string;
  projectId?: string;
  processed?: boolean;
}

export interface InboxStats {
  total: number;
  processed: number;
  pending: number;
}

export interface InboxData {
  items: InboxItem[];
  stats: InboxStats;
  count: number;
}

// =============================================================================
// Settings Types
// =============================================================================

export interface Settings {
  notionToken?: string;
  anthropicApiKey?: string;
  syncIntervalMinutes: number;
  hasNotionToken?: boolean;
  hasAnthropicKey?: boolean;
  selectedDatabaseId?: string;
  autoSync?: boolean;
  syncPausedUntil?: string | null;
  syncPauseType?: SyncPauseType;
}

// =============================================================================
// UI Types
// =============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface SelectOption {
  value: string;
  label: string;
}

// =============================================================================
// App Data Context Types
// =============================================================================

export interface AppDataState {
  projects: Project[];
  status: SyncStatus | null;
  inbox: InboxData;
  isLoading: boolean;
  errors: Record<string, string | null>;
}

export interface AppDataContextValue extends AppDataState {
  refresh: (type: 'projects' | 'status' | 'inbox') => Promise<unknown>;
  refreshAll: () => Promise<void>;
  inboxCount: number;
  daemonRunning: boolean;
  lastSync: SyncMetrics['lastSync'] | null;
}

// =============================================================================
// Component Prop Types (common patterns)
// =============================================================================

export interface WithChildren {
  children: ReactNode;
}

export interface WithClassName {
  className?: string;
}

export interface IconProps {
  icon: LucideIcon | ComponentType<{ size?: number; className?: string }>;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}
