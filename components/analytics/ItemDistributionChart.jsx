'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import ChartContainer from './ChartContainer';

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="glass rounded-lg p-3 border border-dark-700">
      <p className="text-sm font-medium text-dark-100">{data.name}</p>
      <p className="text-sm text-dark-300">
        Count: <span style={{ color: data.color }}>{data.value}</span>
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
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-dark-300">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ItemDistributionChart({
  data = [],
  title = 'Distribution',
  subtitle
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!data || data.length === 0) {
    return (
      <ChartContainer title={title} subtitle={subtitle}>
        <div className="flex items-center justify-center h-full text-dark-500">
          No data available
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          {/* Center label */}
          <text
            x="50%"
            y="45%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-dark-100"
          >
            <tspan x="50%" dy="-0.5em" fontSize="24" fontWeight="bold">
              {total}
            </tspan>
            <tspan x="50%" dy="1.5em" fontSize="12" className="fill-dark-500">
              Total
            </tspan>
          </text>
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
