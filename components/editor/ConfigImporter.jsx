'use client';

import { useState } from 'react';
import { FileText, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';

export default function ConfigImporter({ projectId, onImportSuccess }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/import-config`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      if (!data.available) {
        setError('No configuration files found in project directory');
        setPreview(null);
      } else {
        setPreview(data);
        setShowPreview(true);
      }
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/import-config`, {
        method: 'POST'
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // Notify parent component of success
      if (onImportSuccess) {
        onImportSuccess(data.project);
      }

      setShowPreview(false);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6 bg-blue-950/20 border border-blue-800/30">
      <div className="flex items-start gap-4">
        <FileText className="text-blue-400 mt-1" size={24} />

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-dark-50 mb-2">
            Import from Documentation
          </h3>
          <p className="text-dark-400 text-sm mb-4">
            Auto-detect phases, modules, and mappings from project documentation
            files (.nsma-config.md, PERSPECTIVE.md, etc.)
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-800/50 rounded-lg flex items-start gap-2">
              <AlertCircle className="text-red-400 mt-0.5" size={16} />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {preview && showPreview && (
            <div className="mb-4 p-4 bg-dark-900/50 rounded-lg border border-dark-700">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="text-green-400" size={18} />
                <h4 className="text-dark-50 font-medium">Import Preview</h4>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-dark-400 block mb-1">
                    Source Files ({preview.files.length}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {preview.files.map((file, idx) => (
                      <span key={idx} className="text-xs font-mono px-2 py-1 bg-dark-800 rounded text-dark-200">
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Phases Found:</span>
                  <span className="text-dark-200">{preview.preview.phases.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Modules Found:</span>
                  <span className="text-dark-200">{preview.preview.modules.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">New Phases:</span>
                  <span className="text-green-400">+{preview.changes.phasesAdded}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">New Modules:</span>
                  <span className="text-green-400">+{preview.changes.modulesAdded}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={executeImport}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Import Now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPreview(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!showPreview && (
            <Button
              onClick={fetchPreview}
              disabled={loading}
              variant="secondary"
              size="sm"
              className="flex items-center gap-2"
            >
              {loading ? (
                <RefreshCw className="animate-spin" size={16} />
              ) : (
                <FileText size={16} />
              )}
              Check for Config Files
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
