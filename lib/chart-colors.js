// Client-safe chart colors - can be imported by both server and client components
// Matches the Tailwind dark theme palette

export const CHART_COLORS = {
  // Status colors
  pending: '#f59e0b',    // amber-500
  processed: '#22c55e',  // green-500
  deferred: '#a855f7',   // purple-500
  archived: '#6b7280',   // gray-500

  // Type colors
  Feature: '#6366f1',        // indigo (accent)
  'Bug Fix': '#ef4444',      // red-500
  Improvement: '#22c55e',    // green-500
  'Technical Debt': '#f97316', // orange-500
  Documentation: '#3b82f6',  // blue-500
  'Security Fix': '#dc2626', // red-600
  'Research/Spike': '#8b5cf6', // violet-500
  Unknown: '#6b7280',        // gray-500

  // Priority colors
  High: '#ef4444',     // red-500
  Medium: '#f59e0b',   // amber-500
  Low: '#22c55e',      // green-500

  // Chart theme
  grid: '#40414f',     // dark-700
  text: '#8e8ea0',     // dark-500
  accent: '#6366f1',   // indigo
};
