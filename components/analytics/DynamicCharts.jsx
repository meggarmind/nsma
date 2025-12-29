'use client';

import dynamic from 'next/dynamic';
import ChartSkeleton from './ChartSkeleton';

/**
 * Dynamically imported chart components
 *
 * Uses next/dynamic with ssr: false to lazy-load recharts (~396KB)
 * Charts only load when the analytics page is visited, keeping
 * the main bundle lean for faster initial page loads.
 */

export const DynamicSyncActivityChart = dynamic(
  () => import('./SyncActivityChart'),
  {
    ssr: false,
    loading: () => <ChartSkeleton title="Loading activity chart..." />
  }
);

export const DynamicItemDistributionChart = dynamic(
  () => import('./ItemDistributionChart'),
  {
    ssr: false,
    loading: () => <ChartSkeleton title="Loading distribution..." />
  }
);

export const DynamicProjectComparisonChart = dynamic(
  () => import('./ProjectComparisonChart'),
  {
    ssr: false,
    loading: () => (
      <ChartSkeleton
        title="Loading comparison..."
        subtitle="Items by status across projects"
      />
    )
  }
);
