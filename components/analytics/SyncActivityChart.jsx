'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import ChartContainer from './ChartContainer';
import { CHART_COLORS } from '@/lib/chart-colors';

const CHART_THEME = {
  grid: '#40414f',
  text: '#8e8ea0',
  tooltipBg: '#202123',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="glass rounded-lg p-3 border border-dark-700">
      <p className="text-sm font-medium text-dark-100 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function SyncActivityChart({ data = { daily: [], weekly: [] } }) {
  const [view, setView] = useState('daily');

  const chartData = view === 'daily' ? data.daily : data.weekly;
  const xKey = view === 'daily' ? 'date' : 'week';

  // Format date labels
  const formatXAxis = (value) => {
    if (view === 'daily') {
      const date = new Date(value);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return value; // Week format is already readable
  };

  const toggleButton = (
    <div className="flex bg-dark-800 rounded-lg p-1">
      <button
        onClick={() => setView('daily')}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          view === 'daily'
            ? 'bg-accent text-white'
            : 'text-dark-400 hover:text-dark-200'
        }`}
      >
        Daily
      </button>
      <button
        onClick={() => setView('weekly')}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          view === 'weekly'
            ? 'bg-accent text-white'
            : 'text-dark-400 hover:text-dark-200'
        }`}
      >
        Weekly
      </button>
    </div>
  );

  if (!chartData || chartData.length === 0) {
    return (
      <ChartContainer
        title="Sync Activity Over Time"
        action={toggleButton}
      >
        <div className="flex items-center justify-center h-full text-dark-500">
          No sync data available for this period
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title="Sync Activity Over Time"
      action={toggleButton}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="syncGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="itemsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.processed} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.processed} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
          <XAxis
            dataKey={xKey}
            tickFormatter={formatXAxis}
            stroke={CHART_THEME.text}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke={CHART_THEME.text}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value) => <span className="text-dark-300 text-sm">{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="syncs"
            name="Syncs"
            stroke={CHART_COLORS.accent}
            fill="url(#syncGradient)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="items"
            name="Items Processed"
            stroke={CHART_COLORS.processed}
            fill="url(#itemsGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
