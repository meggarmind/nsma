'use client';

import { RefreshCw, ArrowDown, X } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface BulkActionBarProps {
  /** Number of selected projects */
  selectedCount: number;
  /** Whether bulk sync is in progress */
  bulkSyncing: boolean;
  /** Whether bulk refresh is in progress */
  bulkRefreshing: boolean;
  /** Called when bulk sync is triggered */
  onBulkSync: () => void;
  /** Called when bulk refresh is triggered */
  onBulkRefresh: () => void;
  /** Called when selection is cleared */
  onClearSelection: () => void;
}

export default function BulkActionBar({
  selectedCount,
  bulkSyncing,
  bulkRefreshing,
  onBulkSync,
  onBulkRefresh,
  onClearSelection
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const isLoading = bulkSyncing || bulkRefreshing;

  return (
    <div
      className="flex items-center gap-4 mb-6 p-4 bg-accent/10 border border-accent/30 rounded-lg"
      role="region"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium text-accent">
        {selectedCount} project{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="flex gap-2 ml-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={onBulkRefresh}
          disabled={isLoading}
          aria-label={bulkRefreshing ? 'Refreshing stats...' : 'Refresh stats for selected projects'}
          className="flex items-center gap-2"
        >
          <RefreshCw size={16} className={bulkRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {bulkRefreshing ? 'Refreshing...' : 'Refresh Stats'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onBulkSync}
          disabled={isLoading}
          aria-label={bulkSyncing ? 'Syncing from Notion...' : 'Sync selected projects from Notion'}
          className="flex items-center gap-2"
        >
          <ArrowDown size={16} className={bulkSyncing ? 'animate-spin' : ''} aria-hidden="true" />
          {bulkSyncing ? 'Syncing...' : 'Sync from Notion'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          aria-label="Cancel selection"
          className="flex items-center gap-2"
        >
          <X size={16} aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
