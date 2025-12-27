'use client';

const RANGES = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All Time' },
];

export default function DateRangeSelector({ value = '30d', onChange }) {
  return (
    <div className="flex bg-dark-800 rounded-lg p-1">
      {RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === range.value
              ? 'bg-accent text-white'
              : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
