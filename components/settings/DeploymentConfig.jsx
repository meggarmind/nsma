'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Check,
  AlertCircle,
  Server,
  GitBranch,
  Clock,
  Download,
  AlertTriangle,
  Undo2,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

export default function DeploymentConfig({ settings }) {
  const [versionInfo, setVersionInfo] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [error, setError] = useState(null);

  // Check for updates
  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    setUpdateResult(null);

    try {
      const res = await fetch('/api/deployment/version');
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setVersionInfo(data);
      }
    } catch (err) {
      setError('Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  // Fetch status/history
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/deployment/status');
      const data = await res.json();

      if (!data.error) {
        setStatusInfo(data);
      }
    } catch (err) {
      // Ignore status fetch errors
    }
  };

  // Execute update with confirmation
  const executeUpdate = async () => {
    setShowConfirmModal(false);
    setUpdating(true);
    setError(null);
    setUpdateResult(null);

    try {
      const res = await fetch('/api/deployment/update', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.registrationToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (data.error || data.success === false) {
        setError(data.error || data.message);
        setUpdateResult({
          success: false,
          message: data.error || data.message,
          rolledBack: data.rolledBack,
          rollbackCommit: data.rollbackCommit,
        });
      } else {
        setUpdateResult({
          success: true,
          message: data.message,
          previousVersion: data.previousVersion,
          newVersion: data.newVersion,
        });
        // Refresh data after successful update
        setTimeout(() => {
          checkForUpdates();
          fetchStatus();
        }, 3000);
      }
    } catch (err) {
      setError('Update request failed');
      setUpdateResult({ success: false, message: err.message });
    } finally {
      setUpdating(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    checkForUpdates();
    fetchStatus();
  }, []);

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <>
      {/* Instance Info Card */}
      <Card className="mb-6">
        <h3 className="text-xl font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <Server size={20} />
          Deployment Instance
        </h3>

        {versionInfo?.instance ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-dark-400">Instance:</span>
              <span className="ml-2 text-dark-100 font-medium">
                {versionInfo.instance.instance === 'prod' ? (
                  <span className="text-green-400">Production</span>
                ) : (
                  <span className="text-amber-400">Development</span>
                )}
              </span>
            </div>
            <div>
              <span className="text-dark-400">Port:</span>
              <span className="ml-2 text-dark-100">{versionInfo.instance.port}</span>
            </div>
            <div>
              <span className="text-dark-400">Environment:</span>
              <span className="ml-2 text-dark-100">{versionInfo.instance.nodeEnv}</span>
            </div>
            <div className="col-span-2">
              <span className="text-dark-400">Install Directory:</span>
              <span className="ml-2 text-dark-300 text-xs font-mono">
                {versionInfo.instance.installDir}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-dark-400">Loading instance info...</div>
        )}
      </Card>

      {/* Version & Updates Card */}
      <Card className="mb-6">
        <h3 className="text-xl font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <GitBranch size={20} />
          Version & Updates
        </h3>

        <div className="space-y-4">
          {/* Current Version */}
          <div className="flex items-center justify-between p-4 bg-dark-800 rounded-lg">
            <div>
              <div className="text-dark-400 text-sm">Current Version</div>
              <div className="text-dark-100 font-mono text-lg">
                v{versionInfo?.currentVersion || '...'}
              </div>
              <div className="text-dark-500 text-xs mt-1">
                Commit: {versionInfo?.currentCommit || '...'}
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={checkForUpdates} disabled={checking}>
              {checking ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Check Updates</span>
            </Button>
          </div>

          {/* Update Available */}
          {versionInfo?.hasUpdates && (
            <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-accent font-medium">
                    <Download size={18} />
                    Update Available
                  </div>
                  <div className="text-dark-300 text-sm mt-1">
                    {versionInfo.commitCount} new commit
                    {versionInfo.commitCount !== 1 ? 's' : ''} available
                  </div>

                  {/* Commit List */}
                  {versionInfo.commits?.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto">
                      {versionInfo.commits.slice(0, 5).map((commit, i) => (
                        <div key={i} className="text-xs text-dark-400 font-mono py-0.5">
                          {commit}
                        </div>
                      ))}
                      {versionInfo.commits.length > 5 && (
                        <div className="text-xs text-dark-500 mt-1">
                          +{versionInfo.commits.length - 5} more commits
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={updating || !settings.registrationToken}
                >
                  {updating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    'Update Now'
                  )}
                </Button>
              </div>

              {!settings.registrationToken && (
                <div className="mt-3 text-amber-400 text-xs flex items-center gap-1">
                  <AlertCircle size={14} />
                  Registration token required for updates (set in Advanced tab)
                </div>
              )}
            </div>
          )}

          {/* Up to Date */}
          {versionInfo && !versionInfo.hasUpdates && !checking && !versionInfo.updateCheckError && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
              <Check className="text-green-400" size={18} />
              <span className="text-green-400">You&apos;re running the latest version</span>
            </div>
          )}

          {/* Update Check Error */}
          {versionInfo?.updateCheckError && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={18} />
              <span className="text-amber-400 text-sm">
                Could not check for updates: {versionInfo.updateCheckError}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="text-red-400" size={18} />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {/* Update Result */}
          {updateResult && (
            <div
              className={`p-4 rounded-lg ${
                updateResult.success
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
            >
              <div className="flex items-start gap-2">
                {updateResult.success ? (
                  <Check className="text-green-400 mt-0.5" size={18} />
                ) : (
                  <AlertCircle className="text-red-400 mt-0.5" size={18} />
                )}
                <div>
                  <span className={updateResult.success ? 'text-green-400' : 'text-red-400'}>
                    {updateResult.message}
                  </span>
                  {updateResult.rolledBack && (
                    <div className="text-amber-400 text-sm mt-1 flex items-center gap-1">
                      <Undo2 size={14} />
                      Changes rolled back to commit {updateResult.rollbackCommit}
                    </div>
                  )}
                  {updateResult.success && updateResult.previousVersion && (
                    <div className="text-dark-400 text-sm mt-1">
                      Updated from v{updateResult.previousVersion} to v{updateResult.newVersion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Update History Card */}
      <Card>
        <h3 className="text-xl font-semibold text-dark-50 mb-4 flex items-center gap-2">
          <Clock size={20} />
          Update History
        </h3>

        {statusInfo?.updateHistory?.length > 0 ? (
          <div className="space-y-2">
            {statusInfo.updateHistory.slice(0, 5).map((update, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-dark-800 rounded-lg text-sm"
              >
                <div className="flex items-center gap-3">
                  {update.status === 'completed' ? (
                    <Check className="text-green-400" size={16} />
                  ) : (
                    <AlertCircle className="text-red-400" size={16} />
                  )}
                  <div>
                    <span
                      className={update.status === 'completed' ? 'text-green-400' : 'text-red-400'}
                    >
                      {update.status === 'completed' ? 'Updated' : 'Failed'}
                    </span>
                    {update.previousVersion && update.newVersion && (
                      <span className="text-dark-400 ml-2">
                        v{update.previousVersion} → v{update.newVersion}
                      </span>
                    )}
                    {update.error && (
                      <span className="text-dark-500 ml-2 text-xs">{update.error}</span>
                    )}
                  </div>
                </div>
                <span className="text-dark-500 text-xs">
                  {formatRelativeTime(update.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-dark-500 text-sm">No update history</div>
        )}
      </Card>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Update"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={executeUpdate}>
              Update & Restart
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-dark-200">
            This will update NSMA to the latest version from GitHub and restart the services.
          </p>

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-amber-400 mt-0.5" size={18} />
              <div>
                <p className="text-amber-200 font-medium">Service Restart Required</p>
                <p className="text-amber-300 text-sm mt-1">
                  The web interface will be briefly unavailable while services restart. This
                  typically takes 10-30 seconds.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-dark-800 rounded-lg">
            <p className="text-dark-300 text-sm mb-2">Update will perform:</p>
            <ul className="list-disc list-inside text-dark-400 text-sm space-y-1">
              <li>
                <code className="text-dark-300">git pull origin master</code>
              </li>
              <li>
                <code className="text-dark-300">npm install</code>
              </li>
              <li>
                <code className="text-dark-300">npm run build</code>
              </li>
              <li>
                <code className="text-dark-300">systemctl restart services</code>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Undo2 className="text-green-400 mt-0.5" size={18} />
              <div>
                <p className="text-green-200 font-medium">Auto-Rollback Enabled</p>
                <p className="text-green-300 text-sm mt-1">
                  If the update fails, changes will be automatically rolled back to the previous
                  version.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
