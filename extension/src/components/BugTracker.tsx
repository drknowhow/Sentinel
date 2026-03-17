import { useState } from 'react';
import { sendMessage } from '../lib/messages';
import type { CapturedError, IssueSeverity } from '../types';

interface BugTrackerProps {
  isErrorTracking: boolean;
  capturedErrors: CapturedError[];
  disabled: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  'console-error': 'Console',
  'unhandled-exception': 'Exception',
  'unhandled-rejection': 'Promise',
  'network-error': 'Network',
  'csp-violation': 'CSP',
};

const SOURCE_COLORS: Record<string, string> = {
  'console-error': 'bg-red-100 text-red-700',
  'unhandled-exception': 'bg-orange-100 text-orange-700',
  'unhandled-rejection': 'bg-yellow-100 text-yellow-700',
  'network-error': 'bg-blue-100 text-blue-700',
  'csp-violation': 'bg-purple-100 text-purple-700',
};

export default function BugTracker({ isErrorTracking, capturedErrors, disabled }: BugTrackerProps) {
  const [expanded, setExpanded] = useState(false);
  const [annotatingIdx, setAnnotatingIdx] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');

  const toggleTracking = () => {
    sendMessage(isErrorTracking ? 'STOP_ERROR_TRACKING' : 'START_ERROR_TRACKING');
  };

  const startAnnotating = (idx: number) => {
    const error = capturedErrors[idx];
    setAnnotatingIdx(idx);
    setTitle(error.message.slice(0, 100));
    setNotes('');
    setSeverity(error.source === 'unhandled-exception' ? 'high' : 'medium');
  };

  const saveBug = () => {
    if (annotatingIdx === null || !title.trim()) return;
    const error = capturedErrors[annotatingIdx];
    sendMessage('SAVE_ISSUE', {
      type: 'bug',
      title: title.trim(),
      notes: notes.trim(),
      pageUrl: error.url || location.href,
      severity,
      capturedError: error,
    });
    setAnnotatingIdx(null);
    setTitle('');
    setNotes('');
  };

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        <span>
          Bug Tracker
          {capturedErrors.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-red-500 text-white">
              {capturedErrors.length}
            </span>
          )}
        </span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <button
            onClick={toggleTracking}
            disabled={disabled}
            className={`w-full py-1.5 text-sm rounded font-medium transition-colors disabled:opacity-50 ${
              isErrorTracking
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isErrorTracking ? 'Stop Tracking Errors' : 'Start Tracking Errors'}
          </button>

          {capturedErrors.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              {isErrorTracking ? 'Listening for errors...' : 'Enable tracking to capture errors.'}
            </p>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {capturedErrors.map((error, i) => (
              <div key={error.timestamp + '-' + i}>
                <div
                  className="flex items-start gap-2 bg-gray-50 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-100"
                  onClick={() => annotatingIdx === i ? setAnnotatingIdx(null) : startAnnotating(i)}
                >
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SOURCE_COLORS[error.source] || 'bg-gray-100 text-gray-600'}`}>
                    {SOURCE_LABELS[error.source] || error.source}
                  </span>
                  <span className="flex-1 truncate text-gray-700">{error.message}</span>
                </div>

                {annotatingIdx === i && (
                  <div className="ml-2 mt-1 p-2 bg-white border border-gray-200 rounded space-y-1.5">
                    <input
                      type="text"
                      placeholder="Bug title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <textarea
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <select
                        value={severity}
                        onChange={e => setSeverity(e.target.value as IssueSeverity)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button
                        onClick={saveBug}
                        className="flex-1 py-1 text-sm rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                      >
                        Save Bug Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
