import { useState } from 'react';
import { sendMessage } from '../lib/messages';
import type { CapturedError, IssueSeverity } from '../types';

interface ErrorFeedProps {
  errors: CapturedError[];
  isTracking: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  'console-error': 'LOG',
  'unhandled-exception': 'ERR',
  'unhandled-rejection': 'PRM',
  'network-error': 'NET',
  'csp-violation': 'CSP',
};

const SOURCE_COLORS: Record<string, string> = {
  'console-error': 'bg-red-100 text-red-600',
  'unhandled-exception': 'bg-orange-100 text-orange-600',
  'unhandled-rejection': 'bg-yellow-100 text-yellow-700',
  'network-error': 'bg-blue-100 text-blue-600',
  'csp-violation': 'bg-purple-100 text-purple-600',
};

export default function ErrorFeed({ errors, isTracking }: ErrorFeedProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [annotatingIdx, setAnnotatingIdx] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [addingManual, setAddingManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualSeverity, setManualSeverity] = useState<IssueSeverity>('medium');

  const startAnnotating = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const error = errors[idx];
    setAnnotatingIdx(idx);
    setTitle(error.message.slice(0, 100));
    setNotes('');
    setSeverity(error.source === 'unhandled-exception' ? 'high' : 'medium');
  };

  const saveBug = () => {
    if (annotatingIdx === null || !title.trim()) return;
    const error = errors[annotatingIdx];
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

  const saveManualBug = () => {
    if (!manualTitle.trim()) return;
    sendMessage('SAVE_ISSUE', {
      type: 'bug',
      title: manualTitle.trim(),
      notes: manualNotes.trim(),
      pageUrl: location.href,
      severity: manualSeverity,
    });
    setManualTitle('');
    setManualNotes('');
    setManualSeverity('medium');
    setAddingManual(false);
  };

  const manualForm = addingManual && (
    <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 space-y-1.5">
      <input
        type="text"
        placeholder="Bug title"
        value={manualTitle}
        onChange={e => setManualTitle(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
        autoFocus
      />
      <textarea
        placeholder="Description / steps to reproduce..."
        value={manualNotes}
        onChange={e => setManualNotes(e.target.value)}
        rows={2}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none"
      />
      <div className="flex gap-1.5">
        <select
          value={manualSeverity}
          onChange={e => setManualSeverity(e.target.value as IssueSeverity)}
          className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button
          onClick={saveManualBug}
          disabled={!manualTitle.trim()}
          className="flex-1 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => setAddingManual(false)}
          className="py-1 px-2 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const addButton = !addingManual && (
    <button
      onClick={() => setAddingManual(true)}
      className="w-full px-3 py-1.5 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 font-medium text-left border-b border-gray-100 transition-colors"
    >
      + Add bug manually
    </button>
  );

  if (errors.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {addButton}
        {manualForm}
        <div className="flex flex-col items-center justify-center flex-1 py-10 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01M5.07 19h13.86c1.1 0 1.8-1.2 1.25-2.14l-6.93-12a1.44 1.44 0 00-2.5 0l-6.93 12C3.27 17.8 3.97 19 5.07 19z" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            {isTracking ? 'Listening...' : 'No errors captured'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {isTracking ? 'Errors will appear here' : 'Click BUG to start tracking'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {addButton}
      {manualForm}
      {errors.map((error, i) => {
        const isExpanded = expandedIdx === i;
        const isAnnotating = annotatingIdx === i;
        return (
          <div
            key={error.timestamp + '-' + i}
            className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpandedIdx(isExpanded ? null : i)}
          >
            {/* Collapsed row */}
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${SOURCE_COLORS[error.source] || 'bg-gray-100 text-gray-500'}`}>
                {SOURCE_LABELS[error.source] || error.source.slice(0, 3).toUpperCase()}
              </span>
              {(error.count ?? 1) > 1 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 text-white flex-shrink-0">
                  ×{error.count}
                </span>
              )}
              <span className="text-xs text-gray-700 truncate flex-1">{error.message}</span>
              <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-2 pt-0.5 space-y-1.5 text-[11px]" onClick={e => e.stopPropagation()}>
                {error.stack && (
                  <pre className="text-[10px] text-gray-500 bg-gray-50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap max-h-24">
                    {error.stack}
                  </pre>
                )}
                {error.url && (
                  <p className="text-gray-500 break-all">{error.url}</p>
                )}
                {error.statusCode && (
                  <p className="text-gray-500">Status: {error.statusCode}</p>
                )}
                <p className="text-gray-400">{new Date(error.timestamp).toLocaleTimeString()}</p>

                {!isAnnotating ? (
                  <button
                    onClick={(e) => startAnnotating(i, e)}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                  >
                    + Save as bug report
                  </button>
                ) : (
                  <div className="p-2 bg-white border border-gray-200 rounded space-y-1.5">
                    <input
                      type="text"
                      placeholder="Bug title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                    <textarea
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none"
                    />
                    <div className="flex gap-1.5">
                      <select
                        value={severity}
                        onChange={e => setSeverity(e.target.value as IssueSeverity)}
                        className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button
                        onClick={saveBug}
                        className="flex-1 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setAnnotatingIdx(null)}
                        className="py-1 px-2 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
