'use client';

import { useState } from 'react';
import {
  FileText,
  Calendar,
  Tag,
  ExternalLink,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Archive
} from 'lucide-react';

export default function InboxItem({ item, projects, onAssign, onDelete, onArchive }) {
  const [selectedProject, setSelectedProject] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [actionComplete, setActionComplete] = useState(null); // 'assigned' | 'deleted' | 'archived'
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(null); // 'delete' | 'archive'

  const handleAssign = async () => {
    if (!selectedProject) return;

    setAssigning(true);
    setError(null);

    try {
      await onAssign(item.id, selectedProject);
      setActionComplete('assigned');
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setDeleting(true);
    setError(null);
    setShowConfirm(null);

    try {
      await onDelete(item.id);
      setActionComplete('deleted');
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async () => {
    if (!onArchive) return;

    setArchiving(true);
    setError(null);
    setShowConfirm(null);

    try {
      await onArchive(item.id);
      setActionComplete('archived');
    } catch (err) {
      setError(err.message);
    } finally {
      setArchiving(false);
    }
  };

  if (actionComplete) {
    const messages = {
      assigned: `Assigned to ${projects.find(p => p.id === selectedProject)?.name}`,
      deleted: 'Item deleted',
      archived: 'Item archived'
    };
    const colors = {
      assigned: 'green',
      deleted: 'red',
      archived: 'amber'
    };
    const color = colors[actionComplete];
    return (
      <div className={`p-4 rounded-lg border border-${color}-500/30 bg-${color}-500/10`}>
        <div className={`flex items-center gap-2 text-${color}-400`}>
          <CheckCircle2 className="w-5 h-5" />
          <span>{messages[actionComplete]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border border-dark-700 bg-dark-800/50 hover:border-dark-600 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-dark-700 rounded-lg mt-0.5">
              <FileText className="w-5 h-5 text-gray-400" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-white truncate">{item.title}</h4>

              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-400">
                {item.type && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    {item.type}
                  </span>
                )}

                {item.priority && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    item.priority === 'High'
                      ? 'bg-red-500/20 text-red-400'
                      : item.priority === 'Medium'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {item.priority}
                  </span>
                )}

                {item.capturedDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(item.capturedDate).toLocaleDateString()}
                  </span>
                )}

                {item.originalProject && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Was: {item.originalProject}
                  </span>
                )}
              </div>

              {item.notionUrl && (
                <a
                  href={item.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:text-accent-light"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View in Notion
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="appearance-none bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer min-w-[160px]"
              disabled={assigning || deleting || archiving}
            >
              <option value="">Assign to...</option>
              {projects.filter(p => !p.isSystem).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={handleAssign}
            disabled={!selectedProject || assigning || deleting || archiving}
            className="px-4 py-2 bg-accent hover:bg-accent-dark disabled:bg-dark-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {assigning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign'
            )}
          </button>

          {/* Archive button */}
          {onArchive && (
            <button
              onClick={() => setShowConfirm('archive')}
              disabled={assigning || deleting || archiving}
              className="p-2 bg-dark-700 hover:bg-amber-500/20 disabled:opacity-50 text-gray-400 hover:text-amber-400 rounded-lg transition-colors"
              title="Archive item"
            >
              {archiving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={() => setShowConfirm('delete')}
              disabled={assigning || deleting || archiving}
              className="p-2 bg-dark-700 hover:bg-red-500/20 disabled:opacity-50 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
              title="Delete item"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="mt-3 p-3 bg-dark-900 border border-dark-600 rounded-lg">
          <p className="text-sm text-gray-300 mb-3">
            {showConfirm === 'delete'
              ? 'Are you sure you want to delete this item? This cannot be undone.'
              : 'Archive this item? It will be moved to the archived folder.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={showConfirm === 'delete' ? handleDelete : handleArchive}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                showConfirm === 'delete'
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
            >
              {showConfirm === 'delete' ? 'Delete' : 'Archive'}
            </button>
            <button
              onClick={() => setShowConfirm(null)}
              className="px-3 py-1.5 bg-dark-700 text-gray-400 hover:text-white text-sm font-medium rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
