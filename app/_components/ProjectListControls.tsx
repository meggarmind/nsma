'use client';

import { Search, CheckSquare, Square } from 'lucide-react';
import type { Project } from '@/types';

export type FilterStatus = 'all' | 'active' | 'paused';

export interface ProjectListControlsProps {
  /** Search query value */
  searchQuery: string;
  /** Called when search query changes */
  onSearchChange: (query: string) => void;
  /** Current filter status */
  filterStatus: FilterStatus;
  /** Called when filter status changes */
  onFilterChange: (status: FilterStatus) => void;
  /** Whether selection mode is active */
  selectionMode: boolean;
  /** Called when selection mode is toggled */
  onSelectionModeToggle: () => void;
  /** Number of filtered projects (for "Select All" button) */
  filteredCount: number;
  /** Called when "Select All" is clicked */
  onSelectAll: () => void;
}

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' }
];

export default function ProjectListControls({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  selectionMode,
  onSelectionModeToggle,
  filteredCount,
  onSelectAll
}: ProjectListControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500"
          aria-hidden="true"
        />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search projects"
          className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2" role="group" aria-label="Filter by status">
        {filterOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onFilterChange(value)}
            aria-pressed={filterStatus === value}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === value
                ? 'bg-accent text-white'
                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Selection Mode Toggle */}
      <button
        onClick={onSelectionModeToggle}
        aria-pressed={selectionMode}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
          selectionMode
            ? 'bg-accent text-white'
            : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
        }`}
      >
        {selectionMode ? (
          <CheckSquare size={16} aria-hidden="true" />
        ) : (
          <Square size={16} aria-hidden="true" />
        )}
        {selectionMode ? 'Selecting' : 'Select'}
      </button>

      {/* Select All (only shown in selection mode) */}
      {selectionMode && filteredCount > 0 && (
        <button
          onClick={onSelectAll}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 transition-colors"
        >
          Select All ({filteredCount})
        </button>
      )}
    </div>
  );
}
