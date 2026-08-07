'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ClipboardList, AlertCircle, CheckCircle2, Clock, PauseCircle, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const STATUS_ICONS: Record<string, any> = {
  'Not started': AlertCircle,
  'In progress': Clock,
  'Done': CheckCircle2,
  'Blocked': PauseCircle,
  'Deferred': PauseCircle
};

const STATUS_COLORS: Record<string, string> = {
  'Not started': 'text-amber-400',
  'In progress': 'text-blue-400',
  'Done': 'text-emerald-400',
  'Blocked': 'text-red-400',
  'Deferred': 'text-slate-400'
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    try {
      const url = force ? '/api/dashboard?force=true' : '/api/dashboard';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load dashboard');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <Header title="Dashboard" description="Loading..." />
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header title="Dashboard" description="Manage your projects and inbox" />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">{error || 'No data available'}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); setError(null); fetchData(); }}>
            <RefreshCw size={16} /> Retry
          </Button>
        </Card>
      </>
    );
  }

  const { projects = [], unassigned = [], analytics, activity = [] } = data;

  return (
    <>
      <Header
        title="Dashboard"
        description="Triage inbox items and track project status"
        actions={
          <Button variant="ghost" onClick={() => { setLoading(true); fetchData(true); }} className="flex items-center gap-1 text-sm">
            <RefreshCw size={14} /> Refresh
          </Button>
        }
      />

      {/* Unassigned Inbox Card */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ClipboardList size={22} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-neutral-100">Inbox</h2>
              <p className="text-sm text-neutral-400">
                {unassigned.length === 0
                  ? 'No items need assignment'
                  : `${unassigned.length} item${unassigned.length > 1 ? 's' : ''} waiting to be assigned`}
              </p>
            </div>
          </div>
          {unassigned.length > 0 && (
            <Link href="/inbox" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors">
              <ClipboardList size={16} /> Triage ({unassigned.length})
            </Link>
          )}
        </div>
      </Card>

      {/* Project Cards */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Projects</h2>
        {projects.length === 0 ? (
          <Card className="p-8 text-center text-neutral-500">
            No projects found. Add projects to your NSM Project Slugs page in Notion.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project: any) => {
              const { stats } = project;
              const total = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0);
              return (
                <Card key={project.slug} className="p-5 hover:border-neutral-600 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-neutral-100">{project.name}</h3>
                    <span className="text-xs text-neutral-500 font-mono">{project.slug}</span>
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    {Object.entries(stats).map(([status, count]: [string, any]) => {
                      const Icon = STATUS_ICONS[status] || AlertCircle;
                      return (
                        <div key={status} className="flex items-center gap-1" title={status}>
                          <Icon size={14} className={STATUS_COLORS[status] || 'text-neutral-500'} />
                          <span className="text-sm text-neutral-300">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{total} total</span>
                    {project.phases && <span className="truncate max-w-[60%]">{project.phases}</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {activity && activity.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">Recent Activity</h2>
          <Card className="divide-y divide-neutral-800">
            {activity.slice(0, 5).map((item: any) => (
              <div key={item.pageId} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200 truncate">{item.title}</p>
                  <p className="text-xs text-neutral-500">
                    {item.project || 'unassigned'} — {item.type} — {item.processedDate}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}
