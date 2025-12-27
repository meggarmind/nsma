'use client';

import {
  BarChart,
  Bar,
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
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="glass rounded-lg p-3 border border-dark-700">
      <p className="text-sm font-medium text-dark-100 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
      <p className="text-sm text-dark-300 mt-1 pt-1 border-t border-dark-700">
        Total: {total}
      </p>
    </div>
  );
}

function CustomLegend({ payload }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
      {payload.map((entry, index) => (
        <li key={index} className="flex items-center gap-1.5 text-xs">
          <span
            className="w-2.5 h-2.5 rounded"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-dark-300">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectComparisonChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <ChartContainer title="Project Comparison">
        <div className="flex items-center justify-center h-full text-dark-500">
          No project data available
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title="Project Comparison" subtitle="Items by status across projects">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={CHART_THEME.text}
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={CHART_THEME.text}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          <Bar
            dataKey="pending"
            name="Pending"
            stackId="stack"
            fill={CHART_COLORS.pending}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="processed"
            name="Processed"
            stackId="stack"
            fill={CHART_COLORS.processed}
          />
          <Bar
            dataKey="deferred"
            name="Deferred"
            stackId="stack"
            fill={CHART_COLORS.deferred}
          />
          <Bar
            dataKey="archived"
            name="Archived"
            stackId="stack"
            fill={CHART_COLORS.archived}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
