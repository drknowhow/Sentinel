import { useEffect, useState } from 'react';
import type { Action, Session } from '../types';
import {
  deleteSession,
  getActiveSessionId,
  getSessions,
  renameSession,
  saveSession,
  setActiveSessionId,
  updateSessionKind,
} from '../lib/storage';
import { sendMessage } from '../lib/messages';

interface SessionManagerProps {
  currentActions: Action[];
  isRecording: boolean;
  inline?: boolean;
}

export default function SessionManager({ currentActions, isRecording, inline }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saveAsSuite, setSaveAsSuite] = useState(true);

  const refresh = async () => {
    setSessions(await getSessions());
    setActiveId(await getActiveSessionId());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    if (currentActions.length === 0) return;
    const assertionState = await chrome.storage.local.get(['currentAssertions', 'currentGuideEdits']);
    const session = await saveSession({
      actions: currentActions,
      assertions: (assertionState.currentAssertions as Session['assertions']) || [],
      guideEdits: (assertionState.currentGuideEdits as Session['guideEdits']) || undefined,
      kind: saveAsSuite ? 'suite' : 'recording',
    });
    await setActiveSessionId(session.id);
    await refresh();
  };

  const handleLoad = async (session: Session) => {
    await chrome.storage.local.set({
      currentSession: session.actions,
      currentAssertions: session.assertions,
      currentGuideEdits: session.guideEdits ?? null,
    });
    await setActiveSessionId(session.id);
    setActiveId(session.id);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    await refresh();
  };

  const handleRename = async (id: string) => {
    if (editName.trim()) {
      await renameSession(id, editName.trim());
      setEditingId(null);
      await refresh();
    }
  };

  const handleRun = async (session: Session) => {
    await handleLoad(session);
    sendMessage('START_PLAYBACK', { speed: 1, stepByStep: false, sessionId: session.id });
  };

  const toggleKind = async (session: Session) => {
    await updateSessionKind(session.id, session.kind === 'suite' ? 'recording' : 'suite');
    await refresh();
  };

  const content = (
    <div className="px-4 pb-3 space-y-2">
      <label className="flex items-center gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={saveAsSuite}
          onChange={e => setSaveAsSuite(e.target.checked)}
        />
        Save new sessions as reusable test suites
      </label>

      <button
        onClick={handleSave}
        disabled={currentActions.length === 0 || isRecording}
        className="w-full py-1.5 text-sm rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
      >
        Save Current Session
      </button>

      {sessions.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No saved sessions.</p>
      )}

      <div className="max-h-64 overflow-y-auto space-y-1">
        {sessions.map(session => (
          <div
            key={session.id}
            className={`px-2 py-2 rounded text-sm ${
              activeId === session.id ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-1">
              {editingId === session.id ? (
                <input
                  className="flex-1 text-sm border rounded px-1"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename(session.id)}
                  onBlur={() => handleRename(session.id)}
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 truncate cursor-pointer hover:text-blue-600"
                  onClick={() => handleLoad(session)}
                  title={`${session.actions.length} steps - click to load`}
                >
                  {session.name}
                </span>
              )}
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${session.kind === 'suite' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'}`}>
                {session.kind === 'suite' ? 'SUITE' : 'REC'}
              </span>
              <button
                onClick={() => { setEditingId(session.id); setEditName(session.name); }}
                className="text-gray-400 hover:text-blue-500 text-xs px-1"
                title="Rename"
              >
                &#9998;
              </button>
              <button
                onClick={() => handleDelete(session.id)}
                className="text-gray-400 hover:text-red-500 text-xs px-1"
                title="Delete"
              >
                &#10005;
              </button>
            </div>

            <div className="mt-1 text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
              <span>{session.actions.length} steps</span>
              <span>{session.assertions.length} assertions</span>
              {session.runStats?.runCount ? <span>{session.runStats.runCount} runs</span> : null}
              {session.runStats?.flakyScore !== undefined ? <span>flaky {Math.round(session.runStats.flakyScore * 100)}%</span> : null}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleLoad(session)}
                className="px-2 py-1 text-[11px] rounded bg-white border border-gray-200 text-gray-600 hover:text-gray-800"
              >
                Load
              </button>
              <button
                onClick={() => handleRun(session)}
                className="px-2 py-1 text-[11px] rounded bg-green-100 text-green-700 hover:bg-green-200"
              >
                Run
              </button>
              <button
                onClick={() => toggleKind(session)}
                className="px-2 py-1 text-[11px] rounded bg-purple-50 text-purple-700 hover:bg-purple-100"
              >
                {session.kind === 'suite' ? 'Mark Recording' : 'Promote to Suite'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (inline) {
    return <div className="pt-2">{content}</div>;
  }

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        Sessions ({sessions.length})
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>
      {expanded && content}
    </div>
  );
}
