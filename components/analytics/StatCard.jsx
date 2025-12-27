'use client';

import Card from '../ui/Card';

export default function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-accent',
  suffix = '',
  description
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dark-500 mb-1">{label}</p>
          <p className="text-3xl font-bold text-dark-50">
            {value}
            {suffix && <span className="text-lg text-dark-400 ml-1">{suffix}</span>}
          </p>
          {description && (
            <p className="text-xs text-dark-500 mt-1">{description}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 bg-dark-900/50 rounded-lg ${color}`}>
            <Icon size={24} />
          </div>
        )}
      </div>
    </Card>
  );
}
