'use client';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="mb-4 p-4 rounded-full bg-dark-800">
          <Icon size={48} className="text-dark-500" />
        </div>
      )}
      <h3 className="text-xl font-semibold text-dark-300 mb-2">{title}</h3>
      {description && (
        <p className="text-dark-500 mb-6 max-w-md">{description}</p>
      )}
      {action}
    </div>
  );
}
