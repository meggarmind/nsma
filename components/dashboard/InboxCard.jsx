'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, AlertCircle, ArrowRight } from 'lucide-react';

export default function InboxCard() {
  const router = useRouter();
  const [stats, setStats] = useState({ pending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInboxStats();
  }, []);

  const fetchInboxStats = async () => {
    try {
      const res = await fetch('/api/inbox');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch inbox stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = stats.pending || 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-6 cursor-pointer hover:border-amber-500/50 transition-all hover:shadow-lg hover:shadow-amber-500/10"
      onClick={() => router.push('/inbox')}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Inbox className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Inbox</h3>
              <p className="text-sm text-gray-400">Unassigned items</p>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 rounded-full">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">
                {pendingCount} pending
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {loading
              ? 'Loading...'
              : pendingCount === 0
                ? 'All items assigned'
                : `${pendingCount} item${pendingCount !== 1 ? 's' : ''} need${pendingCount === 1 ? 's' : ''} assignment`
            }
          </p>

          <div className="flex items-center gap-1 text-amber-400 text-sm font-medium">
            View Inbox
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
