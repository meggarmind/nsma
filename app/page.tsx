'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Inbox, RefreshCw, Circle, ArrowRight } from 'lucide-react';

const STATUS_BAR_COLORS: Record<string, string> = {
  'Not started': '#5C6370',
  'In progress': '#56B6C2',
  'Done': '#98C379',
  'Blocked': '#E06C75',
  'Deferred': '#7C7CB0'
};

const STATUS_LABELS: Record<string, string> = {
  'Not started': 'Pending',
  'In progress': 'Active',
  'Done': 'Done',
  'Blocked': 'Blocked',
  'Deferred': 'Deferred'
};

function ThroughputBar({ stats }: { stats: Record<string, number> }) {
  const total = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const segments = Object.entries(stats)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      label: STATUS_LABELS[status] || status,
      count,
      width: (count / total) * 100,
      color: STATUS_BAR_COLORS[status] || '#5C6370'
    }));

  return (
    <div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#232836]">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.width}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
        {segments.map((s) => (
          <span key={s.label} className="text-[10px] tracking-wider uppercase flex items-center gap-1" style={{ color: s.color }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
            <span style={{ color: '#6B7389' }}>{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    try {
      const url = force ? '/api/dashboard?force=true' : '/api/dashboard';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load dashboard');
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-[#232836] border-t-[#5B9BD5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-lg mx-auto py-32 text-center">
        <p className="text-[#6B7389] mb-3">{error || 'Could not reach Notion. Check your connection and try again.'}</p>
        <button
          onClick={() => { setLoading(true); setError(null); fetchData(); }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[#5B9BD5]/10 text-[#5B9BD5] hover:bg-[#5B9BD5]/20 transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const { projects = [], unassigned = [], activity = [] } = data;
  const inboxCount = unassigned.length;

  return (
    <>
      {/* Inbox — the hero */}
      <div className="mb-12">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-sm tracking-[0.2em] uppercase text-[#5C6370] font-medium">Inbox</h1>
          <span className="text-[10px] text-[#5C6370] tracking-wider">UNSORTED</span>
        </div>
        <div className="flex items-center justify-between p-6 rounded-xl border border-[#232836] bg-[#161A24]">
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-light text-[#E8ECF1] tabular-nums tracking-tight">
              {inboxCount}
            </span>
            <span className="text-sm text-[#6B7389]">
              {inboxCount === 0 ? 'Clear — nothing waiting' : inboxCount === 1 ? 'item needs assignment' : 'items need assignment'}
            </span>
          </div>
          {inboxCount > 0 && (
            <Link
              href="/inbox"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[#E06C75]/10 text-[#E06C75] hover:bg-[#E06C75]/20 transition-colors"
            >
              Triage <ArrowRight size={14} />
            </Link>
          )}
          {inboxCount === 0 && (
            <span className="flex items-center gap-2 text-sm text-[#6B7389]">
              <Circle size={8} className="fill-[#98C379] text-[#98C379]" /> All clear
            </span>
          )}
        </div>
      </div>

      {/* Projects */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm tracking-[0.2em] uppercase text-[#5C6370] font-medium">
            Projects
          </h2>
          <button
            onClick={() => { setLoading(true); fetchData(true); }}
            className="flex items-center gap-1.5 text-xs text-[#6B7389] hover:text-[#E8ECF1] transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#232836] rounded-xl">
            <p className="text-sm text-[#6B7389]">
              No projects registered. Add them to your NSM Project Slugs page in Notion.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map((project: any) => {
              const { stats } = project;
              const total = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0);
              return (
                <div
                  key={project.slug}
                  className="p-5 rounded-xl border border-[#232836] bg-[#161A24] hover:border-[#5B9BD5]/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[15px] font-medium text-[#E8ECF1]">{project.name}</h3>
                      <span className="text-[11px] text-[#5C6370] font-mono">{project.slug}</span>
                    </div>
                    <span className="text-xs text-[#5C6370] tabular-nums">{total} items</span>
                  </div>
                  <ThroughputBar stats={stats} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity feed */}
      {activity.length > 0 && (
        <div>
          <h2 className="text-sm tracking-[0.2em] uppercase text-[#5C6370] font-medium mb-4">
            Recent completions
          </h2>
          <div className="rounded-xl border border-[#232836] bg-[#161A24] divide-y divide-[#232836]">
            {activity.slice(0, 6).map((item: any) => (
              <div key={item.pageId} className="flex items-center gap-3 px-5 py-3">
                <Circle size={8} className="fill-[#98C379] text-[#98C379] flex-shrink-0" />
                <p className="text-sm text-[#E8ECF1] truncate">{item.title}</p>
                <span className="text-xs text-[#5C6370] ml-auto flex-shrink-0 tabular-nums">{item.processedDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
