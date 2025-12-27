'use client';

export default function ChartContainer({
  title,
  subtitle,
  children,
  className = '',
  action
}) {
  return (
    <div className={`glass rounded-xl p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-dark-50">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-dark-500 mt-1">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="h-64">
        {children}
      </div>
    </div>
  );
}
