'use client';

import { useState } from 'react';
import { Pause, Play, Clock, ChevronDown } from 'lucide-react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';

const PAUSE_DURATIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' }
];

export default function SyncConfig({ settings, onChange }) {
  const [showDurationMenu, setShowDurationMenu] = useState(false);

  const isPaused = Boolean(settings.syncPausedUntil);
  const isManualPause = settings.syncPauseType === 'manual';

  // Calculate remaining time for timed pause
  const getRemainingTime = () => {
    if (!settings.syncPausedUntil || isManualPause) return null;
    const pauseUntil = new Date(settings.syncPausedUntil).getTime();
    const now = Date.now();
    const remaining = pauseUntil - now;
    if (remaining <= 0) return null;

    const minutes = Math.ceil(remaining / 60000);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  const handlePauseFor = (minutes) => {
    const pauseUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    onChange({
      syncPausedUntil: pauseUntil,
      syncPauseType: 'timed'
    });
    setShowDurationMenu(false);
  };

  const handlePauseIndefinitely = () => {
    // For manual pause, set a far-future date (100 years)
    const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    onChange({
      syncPausedUntil: farFuture,
      syncPauseType: 'manual'
    });
    setShowDurationMenu(false);
  };

  const handleResume = () => {
    onChange({
      syncPausedUntil: null,
      syncPauseType: null
    });
  };

  const remainingTime = getRemainingTime();

  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Sync Configuration</h3>

      {/* Sync Interval */}
      <div className="space-y-4 mb-6">
        <Input
          type="number"
          label="Sync Interval (minutes)"
          value={settings.syncIntervalMinutes}
          onChange={(e) => onChange({ syncIntervalMinutes: parseInt(e.target.value) })}
          placeholder="15"
          required
        />
        <p className="text-sm text-dark-500">
          How often the systemd daemon should sync projects
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-dark-700 my-6" />

      {/* Pause Controls */}
      <div>
        <h4 className="text-lg font-medium text-dark-100 mb-3">Auto-Sync Pause</h4>
        <p className="text-sm text-dark-500 mb-4">
          Temporarily pause automatic syncing. Manual syncs from the dashboard will still work.
        </p>

        {/* Status Display */}
        <div className="flex items-center gap-3 p-4 bg-dark-800/50 rounded-lg mb-4">
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-green-400'}`} />
          <div className="flex-1">
            <span className={`font-medium ${isPaused ? 'text-amber-400' : 'text-green-400'}`}>
              {isPaused ? 'Paused' : 'Active'}
            </span>
            {isPaused && (
              <span className="text-dark-400 ml-2">
                {isManualPause
                  ? '(until manually resumed)'
                  : remainingTime
                    ? `(${remainingTime} remaining)`
                    : '(expiring soon)'
                }
              </span>
            )}
          </div>
          {isPaused && (
            <div className="flex items-center gap-1 text-dark-500">
              <Clock className="w-4 h-4" />
              <span className="text-sm">
                {isManualPause
                  ? 'Manual'
                  : new Date(settings.syncPausedUntil).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                }
              </span>
            </div>
          )}
        </div>

        {/* Pause/Resume Buttons */}
        <div className="flex flex-wrap gap-3">
          {isPaused ? (
            <Button
              variant="primary"
              onClick={handleResume}
              className="flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Resume Now
            </Button>
          ) : (
            <>
              {/* Dropdown for timed pause */}
              <div className="relative">
                <Button
                  variant="secondary"
                  onClick={() => setShowDurationMenu(!showDurationMenu)}
                  className="flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause for
                  <ChevronDown className={`w-4 h-4 transition-transform ${showDurationMenu ? 'rotate-180' : ''}`} />
                </Button>

                {showDurationMenu && (
                  <>
                    {/* Backdrop to close menu */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowDurationMenu(false)}
                    />
                    {/* Dropdown menu */}
                    <div className="absolute top-full left-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-20 min-w-[160px] py-1">
                      {PAUSE_DURATIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handlePauseFor(value)}
                          className="w-full px-4 py-2 text-left text-dark-200 hover:bg-dark-700 hover:text-dark-50 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Pause indefinitely */}
              <Button
                variant="ghost"
                onClick={handlePauseIndefinitely}
                className="flex items-center gap-2 text-dark-400 hover:text-amber-400"
              >
                <Pause className="w-4 h-4" />
                Pause Indefinitely
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
