'use client';

import { useState, useEffect } from 'react';
import { Activity, FileText, CheckCircle, AlertTriangle, TrendingUp, Zap } from 'lucide-react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/analytics/StatCard';
import SyncActivityChart from '@/components/analytics/SyncActivityChart';
import ItemDistributionChart from '@/components/analytics/ItemDistributionChart';
import ProjectComparisonChart from '@/components/analytics/ProjectComparisonChart';
import DateRangeSelector from '@/components/analytics/DateRangeSelector';

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/analytics?range=${range}`);
        if (!res.ok) {
          throw new Error('Failed to fetch analytics data');
        }
        const analyticsData = await res.json();
        setData(analyticsData);
      } catch (err) {
        console.error('Analytics fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [range]);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
  };

  if (error) {
    return (
      <div className="p-8">
        <Header title="Analytics" description="Visualize sync statistics and project health" />
        <div className="glass rounded-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => setRange(range)}
            className="mt-4 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Analytics"
        description="Visualize sync statistics and project health"
        actions={
          <DateRangeSelector value={range} onChange={handleRangeChange} />
        }
      />

      {loading ? (
        <div className="space-y-6">
          {/* Loading skeleton for stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-dark-700 rounded w-24 mb-3" />
                <div className="h-8 bg-dark-700 rounded w-16" />
              </div>
            ))}
          </div>
          {/* Loading skeleton for charts */}
          <div className="glass rounded-xl p-6 animate-pulse">
            <div className="h-4 bg-dark-700 rounded w-48 mb-4" />
            <div className="h-64 bg-dark-700/50 rounded" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              label="Total Syncs"
              value={data?.summary?.totalSyncs || 0}
              icon={Activity}
              color="text-accent"
              description={`${data?.summary?.syncFrequency || '0/day'}`}
            />
            <StatCard
              label="Items Processed"
              value={data?.summary?.totalItemsProcessed || 0}
              icon={CheckCircle}
              color="text-green-400"
            />
            <StatCard
              label="Avg per Sync"
              value={data?.summary?.avgItemsPerSync || 0}
              icon={TrendingUp}
              color="text-blue-400"
              suffix="items"
            />
            <StatCard
              label="Error Rate"
              value={data?.summary?.errorRate || 0}
              icon={AlertTriangle}
              color={
                (data?.summary?.errorRate || 0) > 5
                  ? 'text-red-400'
                  : 'text-green-400'
              }
              suffix="%"
              description={
                (data?.summary?.errorRate || 0) > 5
                  ? 'Above threshold'
                  : 'Healthy'
              }
            />
          </div>

          {/* Sync Activity Chart */}
          <SyncActivityChart data={data?.timeSeries} />

          {/* Distribution Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ItemDistributionChart
              data={data?.distributions?.byType || []}
              title="Items by Type"
              subtitle="Distribution of task types"
            />
            <ItemDistributionChart
              data={data?.distributions?.byStatus || []}
              title="Items by Status"
              subtitle="Current workflow state"
            />
          </div>

          {/* Project Comparison Chart */}
          <ProjectComparisonChart data={data?.projectComparison || []} />
        </div>
      )}
    </div>
  );
}
