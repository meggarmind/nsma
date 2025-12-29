'use client';

import InboxItem from './InboxItem';
import { CheckCircle2 } from 'lucide-react';

export default function InboxList({ items, projects, onAssign, onDelete, onArchive, onRefresh }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="p-4 bg-green-500/10 rounded-full mb-4">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Inbox Empty</h3>
        <p className="text-gray-400 text-center max-w-md">
          All captured items have been assigned to projects.
          New items without a project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <InboxItem
          key={item.id}
          item={item}
          projects={projects}
          onAssign={onAssign}
          onDelete={onDelete}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
