'use client';

/**
 * Skeleton loader for chart components
 * Matches the ChartContainer dimensions and styling
 */
export default function ChartSkeleton({
  title = 'Loading...',
  subtitle,
  height = 'h-64'
}) {
  return (
    <div className="glass rounded-xl p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-5 bg-dark-700 rounded w-48 mb-2" />
          {subtitle && <div className="h-4 bg-dark-700/50 rounded w-32" />}
        </div>
        {/* Action button placeholder */}
        <div className="h-8 bg-dark-700 rounded w-20" />
      </div>

      {/* Chart area skeleton with spinner */}
      <div className={`${height} bg-dark-700/30 rounded flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-dark-600 border-t-accent rounded-full animate-spin" />
          <span className="text-sm text-dark-500">{title}</span>
        </div>
      </div>
    </div>
  );
}
