import { useState } from 'react';
import { sendMessage } from '../lib/messages';
import { saveSession } from '../lib/storage';

interface HeaderProps {
  isRecording: boolean;
  isPlaying: boolean;
  isErrorTracking: boolean;
  isVideoRecording: boolean;
  videoDuration: number;
  hasActions: boolean;
  errorCount: number;
  stepCount: number;
  issueCount: number;
  onToggleVideo: () => void;
  isInspecting: boolean;
  onToggleInspect: () => void;
  wsConnected: boolean;
  contentScriptReady: boolean;
  activeTabUrl: string | null;
  projects: import('../types').Project[];
  activeProjectId: string | null;
}

function openGuideEditor() {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Header({
  isRecording, isPlaying, isErrorTracking,
  isVideoRecording, videoDuration,
  hasActions, errorCount, stepCount, issueCount, onToggleVideo,
  isInspecting, onToggleInspect,
  wsConnected, contentScriptReady, activeTabUrl,
  projects, activeProjectId,
}: HeaderProps) {
  const busy = isPlaying;
  const [syncBugTracking, setSyncBugTracking] = useState(true);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const clearSession = () => {
    chrome.storage.local.set({ currentSession: [], currentGuideEdits: null, capturedErrors: [], currentAssertions: [], sentinel_issues: [] });
  };

  const startRecording = (clearFirst: boolean) => {
    if (clearFirst) clearSession();
    sendMessage('TOGGLE_RECORDING', { active: true, clearSession: clearFirst });
    if (syncBugTracking && !isErrorTracking) sendMessage('START_ERROR_TRACKING');
    setShowRestartConfirm(false);
  };

  const handleSaveAndRestart = async () => {
    const data = await chrome.storage.local.get(['currentSession', 'currentAssertions', 'currentGuideEdits']);
    const currentSession = data.currentSession as import('../types').Action[] | undefined;
    const currentAssertions = data.currentAssertions as import('../types').Assertion[] | undefined;
    const currentGuideEdits = data.currentGuideEdits as import('../types').Session['guideEdits'] | undefined;

    if (currentSession && currentSession.length > 0) {
      await saveSession({
        actions: currentSession,
        assertions: currentAssertions || [],
        guideEdits: currentGuideEdits,
        kind: 'recording',
      });
    }
    startRecording(true);
  };

  const handleRecordClick = () => {
    if (isRecording) {
      sendMessage('TOGGLE_RECORDING', { active: false });
      if (syncBugTracking && isErrorTracking) sendMessage('STOP_ERROR_TRACKING');
    } else {
      if (stepCount > 0 || errorCount > 0 || issueCount > 0) {
        setShowRestartConfirm(true);
      } else {
        startRecording(false);
      }
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  const handleProjectSelect = (id: string) => {
    chrome.storage.local.set({ sentinel_active_project: id });
  };

  return (
    <header className="bg-gray-900 text-white relative flex flex-col pt-2 pb-2 border-b border-gray-800 shadow-sm z-10 w-full shrink-0">
      {/* Project Selector Mini-Bar */}
      {projects.length > 0 && (
        <div className="flex items-center px-3 mb-2 gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 max-w-[140px]">
            <svg className="w-3 h-3 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="M3 9V5a2 2 0 0 1 2-2h6l2 3h7a2 2 0 0 1 2 2v1" />
            </svg>
            <select 
              value={activeProjectId || ''}
              onChange={(e) => handleProjectSelect(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none cursor-pointer w-full"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id} className="bg-gray-900 text-white">{p.name}</option>
              ))}
            </select>
          </div>
          <div className="h-3 w-[1px] bg-gray-800" />
          <span className="text-[9px] text-gray-500 font-medium truncate">{activeProject?.devUrl || 'No URL'}</span>
        </div>
      )}
      {/* Confirmation Modal */}
      {showRestartConfirm && (
        <div className="absolute top-10 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 w-64 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <h3 className="text-white text-[11px] font-bold mb-1">Previous Session Found</h3>
          <p className="text-gray-400 text-[10px] mb-3 leading-tight">You have existing recorded steps or errors. What would you like to do?</p>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => startRecording(false)}
              className="w-full text-left px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] transition-colors"
            >
              Continue session (append)
            </button>
            <button
              onClick={handleSaveAndRestart}
              className="w-full text-left px-2.5 py-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-[11px] transition-colors"
            >
              Save old &amp; start fresh
            </button>
            <button
              onClick={() => startRecording(true)}
              className="w-full text-left px-2.5 py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[11px] transition-colors"
            >
              Discard old &amp; start fresh
            </button>
            <button
              onClick={() => setShowRestartConfirm(false)}
              className="w-full text-center px-2.5 py-1 border border-gray-700 rounded text-gray-400 hover:text-white hover:bg-gray-800 text-[10px] mt-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-3 gap-2 w-full">
        {/* Left: Branding & Status Pills */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="icon48.png" alt="Sentinel" className="w-5 h-5 flex-shrink-0" />

          {/* Active Tab Pill */}
          {activeTabUrl && (activeTabUrl.startsWith('http://') || activeTabUrl.startsWith('https://') || activeTabUrl.startsWith('file://')) && (
            <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-tight transition-colors flex-shrink min-w-0 ${contentScriptReady
              ? 'bg-teal-900/40 text-teal-400 border border-teal-800/50'
              : 'bg-red-900/40 text-red-400 border border-red-800/50 cursor-pointer hover:bg-red-900/60'
              }`}
              onClick={!contentScriptReady ? () => {
                sendMessage('ATTACH_TAB');
              } : undefined}
              title={contentScriptReady ? 'Active on this tab' : 'Not attached - Click to repair'}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${contentScriptReady ? 'bg-teal-500 shadow-[0_0_4px_#14b8a6]' : 'bg-red-500 animate-pulse'}`} />
              <span className="truncate max-w-[80px]">
                {(() => { try { return new URL(activeTabUrl).hostname; } catch { return 'Local'; } })()}
              </span>
            </div>
          )}

          {/* AI connection pill */}
          <div
            title={wsConnected ? 'Claude is connected' : 'Claude not connected'}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-all flex-shrink-0 ${wsConnected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-gray-700 bg-transparent'
              }`}
          >
            <span className={`text-[8px] font-bold tracking-wider ${wsConnected ? 'text-emerald-400' : 'text-gray-500'}`}>
              AI
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* The PLAY/GUIDE actions if not recording and has actions */}
          {!isRecording && hasActions && !busy && (
            <div className="flex items-center bg-gray-800/50 rounded p-0.5 mr-0.5 border border-gray-700/50">
              <button
                onClick={() => sendMessage('START_PLAYBACK', { speed: 1, stepByStep: false })}
                className="flex text-purple-400 hover:bg-purple-500/20 px-1.5 py-1 rounded transition-colors"
                title="Start Playback"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              </button>
              <button
                onClick={openGuideEditor}
                className="flex text-green-400 hover:bg-green-500/20 px-1.5 py-1 rounded transition-colors"
                title="Open Guide Editor"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm2 1v2h8V4H4zm0 4v1h8V8H4zm0 3v1h5v-1H4z" />
                </svg>
              </button>
            </div>
          )}

          {/* Central Control Bar (Combined REC, VID, BUG, etc) */}
          <div className="flex items-center bg-gray-800/80 rounded p-0.5 border border-gray-700 shadow-inner">
            <button
              onClick={handleRecordClick}
              disabled={busy}
              className={`flex items-center justify-center w-7 h-6 rounded mr-0.5 transition-colors disabled:opacity-40 ${isRecording ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'hover:bg-gray-700 text-gray-300'}`}
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
            </button>

            {/* Bug Tracking Sync Toggle */}
            <button
              onClick={() => setSyncBugTracking(!syncBugTracking)}
              className={`flex items-center justify-center w-7 h-6 rounded mx-0.5 transition-colors ${syncBugTracking ? 'text-orange-400 bg-orange-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
              title="Auto-capture background bugs with session"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 1A1.5 1.5 0 003 2.5V3H2a1 1 0 00-1 1v1a1 1 0 001 1h1v1H2a1 1 0 00-1 1v1a1 1 0 001 1h1v.5A1.5 1.5 0 004.5 11h7A1.5 1.5 0 0013 9.5V9h1a1 1 0 001-1V7a1 1 0 00-1-1h-1V5h1a1 1 0 001-1V3a1 1 0 00-1-1h-1v-.5A1.5 1.5 0 0011.5 1h-7z" />
              </svg>
            </button>

            <div className="w-[1px] h-3.5 bg-gray-700 mx-0.5" />

            {/* Video Toggle */}
            <button
              onClick={onToggleVideo}
              disabled={busy}
              className={`flex items-center justify-center w-7 h-6 rounded mx-0.5 transition-colors disabled:opacity-40 ${isVideoRecording ? 'bg-pink-500 text-white shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
              title={isVideoRecording ? 'Stop Video Recording' : 'Start Video Recording'}
            >
              {isVideoRecording && videoDuration > 0 ? (
                <span className="text-[9px] font-mono leading-none tracking-tighter mix-blend-screen">{formatDuration(videoDuration)}</span>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 5a2 2 0 012-2h7a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V5zm12 .5l4-2v9l-4-2v-5z" />
                </svg>
              )}
            </button>

            {/* Inspect Toggle */}
            <button
              onClick={onToggleInspect}
              disabled={busy || isRecording}
              className={`flex items-center justify-center w-7 h-6 rounded ml-0.5 transition-colors disabled:opacity-40 ${isInspecting ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-400 hover:bg-gray-700 hover:text-blue-400'
                }`}
              title={isInspecting ? 'Stop Inspecting' : 'Inspect Element'}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0V.5a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0V.5a.5.5 0 01.5-.5zM0 5.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zm12 0a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM.5 10a.5.5 0 000 1h3a.5.5 0 000-1h-3zm12 0a.5.5 0 000 1h3a.5.5 0 000-1h-3zM5.5 12a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-3a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-3a.5.5 0 01.5-.5zM6 6h4v4H6V6z" />
              </svg>
            </button>
          </div>

          {/* Clear Button */}
          {(hasActions || errorCount > 0 || issueCount > 0) && !isRecording && !isVideoRecording && !busy && (
            <button
              onClick={clearSession}
              className="flex items-center justify-center w-6 h-6 ml-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Clear current session"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 110-2h3a1 1 0 011-1h3a1 1 0 011 1h3a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
