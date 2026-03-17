import { useState, useEffect } from 'react';
import type { Session, Action } from '../types';
import { getSessions, saveSession, deleteSession, renameSession, setActiveSessionId, getActiveSessionId } from '../lib/storage';

interface SessionManagerProps {
  currentActions: Action[];
  isRecording: boolean;
}

export default function SessionManager({ currentActions, isRecording }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const refresh = async () => {
    setSessions(await getSessions());
    setActiveId(await getActiveSessionId());
  };

  useEffect(() => { refresh(); }, []);

  const handleSave = async () => {
    if (currentActions.length === 0) return;
    const session = await saveSession({ actions: currentActions });
    await setActiveSessionId(session.id);
    await refresh();
  };

  const handleLoad = async (session: Session) => {
    await chrome.storage.local.set({
      currentSession: session.actions,
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

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        Sessions ({sessions.length})
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
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

          <div className="max-h-48 overflow-y-auto space-y-1">
            {sessions.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-sm ${
                  activeId === s.id ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50'
                }`}
              >
                {editingId === s.id ? (
                  <input
                    className="flex-1 text-sm border rounded px-1"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRename(s.id)}
                    onBlur={() => handleRename(s.id)}
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 truncate cursor-pointer hover:text-blue-600"
                    onClick={() => handleLoad(s)}
                    title={`${s.actions.length} steps - click to load`}
                  >
                    {s.name}
                    <span className="text-xs text-gray-400 ml-1">({s.actions.length})</span>
                  </span>
                )}
                <button
                  onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                  className="text-gray-400 hover:text-blue-500 text-xs px-1"
                  title="Rename"
                >
                  &#9998;
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-gray-400 hover:text-red-500 text-xs px-1"
                  title="Delete"
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
