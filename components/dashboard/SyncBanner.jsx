'use client';

import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';

export default function SyncBanner({ syncing = false, lastSync, onSync }) {
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className={`glass rounded-xl p-4 mb-8 border-2 ${
      syncing ? 'border-accent animate-pulse' : 'border-transparent'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {syncing ? (
            <>
              <RefreshCw className="text-accent animate-spin" size={24} />
              <div>
                <p className="font-semibold text-dark-50">Sync in progress...</p>
                <p className="text-sm text-dark-500">Fetching updates from Notion</p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="text-green-400" size={24} />
              <div>
                <p className="font-semibold text-dark-50">Ready to sync</p>
                <p className="text-sm text-dark-500">
                  Last sync: {formatDate(lastSync)}
                </p>
              </div>
            </>
          )}
        </div>
        <Button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-2"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync All Projects'}
        </Button>
      </div>
    </div>
  );
}
