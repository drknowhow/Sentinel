import { sendMessage } from '../lib/messages';

interface HeaderProps {
  isRecording: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isErrorTracking: boolean;
  isVideoRecording: boolean;
  videoDuration: number;
  hasActions: boolean;
  errorCount: number;
  stepCount: number;
  onToggleVideo: () => void;
  wsConnected: boolean;
  contentScriptReady: boolean;
  activeTabUrl: string | null;
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
  isRecording, isPlaying, isPaused, isErrorTracking,
  isVideoRecording, videoDuration,
  hasActions, errorCount, stepCount, onToggleVideo,
  wsConnected, contentScriptReady, activeTabUrl,
}: HeaderProps) {
  const busy = isPlaying;

  let statusLabel = 'Idle';
  let statusColor = 'bg-gray-400';
  if (isRecording) {
    statusLabel = 'REC';
    statusColor = 'bg-red-500 animate-pulse';
  } else if (isVideoRecording) {
    statusLabel = 'VID';
    statusColor = 'bg-pink-500 animate-pulse';
  } else if (isPlaying && isPaused) {
    statusLabel = 'Paused';
    statusColor = 'bg-yellow-500';
  } else if (isPlaying) {
    statusLabel = 'Playing';
    statusColor = 'bg-purple-500 animate-pulse';
  }

  const clearSession = () => {
    chrome.storage.local.set({ currentSession: [], currentGuideEdits: null, capturedErrors: [] });
  };

  return (
    <header className="bg-gray-900 text-white">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <img src="icon48.png" alt="Sentinel" className="w-6 h-6" />
        <h1 className="text-sm font-bold tracking-wide flex-1">SENTINEL</h1>

        {/* AI connection indicator */}
        <div
          title={wsConnected ? 'Claude is connected and ready' : 'Claude not connected — open an AI session'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
            wsConnected
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-gray-600/40 bg-transparent'
          }`}
        >
          {/* Sparkle / AI icon */}
          <svg
            className={`w-3 h-3 ${wsConnected ? 'text-emerald-400' : 'text-gray-600'}`}
            viewBox="0 0 16 16" fill="currentColor"
          >
            <path d="M8 1a.5.5 0 01.5.5v1.586l1.121-1.12a.5.5 0 01.707.707L9.207 3.793 10.793 5.38a.5.5 0 01-.707.707L8.5 4.5v1.086l1.121 1.121a.5.5 0 01-.707.707L8 6.293l-1.414 1.121a.5.5 0 01-.707-.707L7.5 5.586V4.5L5.914 6.087a.5.5 0 01-.707-.707L6.793 3.793 5.672 2.672a.5.5 0 01.707-.707L7.5 3.086V1.5A.5.5 0 018 1zM2.5 8a.5.5 0 000 1h1.086l-1.12 1.121a.5.5 0 00.707.707L4.293 9.707l1.586 1.586a.5.5 0 00.707-.707L5.5 9.5h1.086l1.121 1.121a.5.5 0 00.707-.707L7.293 8.5H8.5v1.086l-1.121 1.121a.5.5 0 00.707.707L9.207 10.293l1.586 1.586a.5.5 0 00.707-.707L10.207 9.5H11.5a.5.5 0 000-1H2.5z"/>
          </svg>
          <span className={`text-[10px] font-semibold tracking-wide ${wsConnected ? 'text-emerald-400' : 'text-gray-600'}`}>
            AI
          </span>
          {wsConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>

        <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-[11px] text-gray-400 font-medium">{statusLabel}</span>
        {stepCount > 0 && (
          <span className="text-[11px] text-gray-500">{stepCount} steps</span>
        )}
      </div>

      {/* Active tab status bar */}
      {activeTabUrl && (activeTabUrl.startsWith('http://') || activeTabUrl.startsWith('https://')) && (
        <div className={`flex items-center gap-1.5 px-4 py-1 text-[10px] border-t transition-colors ${
          contentScriptReady
            ? 'border-teal-700/40 bg-teal-900/20 text-teal-400'
            : 'border-gray-700/40 bg-gray-800/30 text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${contentScriptReady ? 'bg-teal-400' : 'bg-gray-600'}`} />
          <span className="font-medium flex-shrink-0">{contentScriptReady ? 'Live on active tab' : 'Not attached —'}</span>
          <span className="truncate opacity-70 min-w-0">
            {(() => { try { return new URL(activeTabUrl).hostname; } catch { return activeTabUrl; } })()}
          </span>
          {!contentScriptReady && (
            <button
              onClick={async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab?.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
                chrome.storage.local.set({ contentScriptReady: true });
              }}
              className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            >
              Attach
            </button>
          )}
        </div>
      )}

      {/* Row 1: main toggles */}
      <div className="flex items-center gap-1 px-3 pb-1">
        {/* Record toggle */}
        <button
          onClick={() => sendMessage('TOGGLE_RECORDING', { active: !isRecording })}
          disabled={busy}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all disabled:opacity-40 ${
            isRecording
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/40'
              : 'bg-white/10 text-gray-300 hover:bg-white/15'
          }`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400' : 'bg-gray-500'}`} />
          REC
        </button>

        {/* Video recording toggle */}
        <button
          onClick={onToggleVideo}
          disabled={busy}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all disabled:opacity-40 ${
            isVideoRecording
              ? 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 ring-1 ring-pink-500/40'
              : 'bg-white/10 text-gray-300 hover:bg-white/15'
          }`}
          title={isVideoRecording ? 'Stop Video Recording' : 'Start Video Recording'}
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 5a2 2 0 012-2h7a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V5zm12 .5l4-2v9l-4-2v-5z"/>
          </svg>
          VID
          {isVideoRecording && (
            <span className="text-[9px] text-pink-300 font-mono">{formatDuration(videoDuration)}</span>
          )}
        </button>

        {/* Bug tracking toggle */}
        <button
          onClick={() => sendMessage(isErrorTracking ? 'STOP_ERROR_TRACKING' : 'START_ERROR_TRACKING')}
          disabled={busy}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all disabled:opacity-40 ${
            isErrorTracking
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 ring-1 ring-orange-500/40'
              : 'bg-white/10 text-gray-300 hover:bg-white/15'
          }`}
          title={isErrorTracking ? 'Stop Error Tracking' : 'Start Error Tracking'}
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.5 1A1.5 1.5 0 003 2.5V3H2a1 1 0 00-1 1v1a1 1 0 001 1h1v1H2a1 1 0 00-1 1v1a1 1 0 001 1h1v.5A1.5 1.5 0 004.5 11h7A1.5 1.5 0 0013 9.5V9h1a1 1 0 001-1V7a1 1 0 00-1-1h-1V5h1a1 1 0 001-1V3a1 1 0 00-1-1h-1v-.5A1.5 1.5 0 0011.5 1h-7z"/>
          </svg>
          BUG
          {errorCount > 0 && (
            <span className="bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
              {errorCount > 9 ? '9+' : errorCount}
            </span>
          )}
        </button>

        {/* Element inspect */}
        <button
          onClick={() => sendMessage('START_FEATURE_INSPECTION')}
          disabled={busy || isRecording}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-white/10 text-gray-300 hover:bg-white/15 transition-all disabled:opacity-40"
          title="Inspect element"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0V.5a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0V.5a.5.5 0 01.5-.5zM0 5.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zm12 0a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zM.5 10a.5.5 0 000 1h3a.5.5 0 000-1h-3zm12 0a.5.5 0 000 1h3a.5.5 0 000-1h-3zM5.5 12a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-3a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-3a.5.5 0 01.5-.5zM6 6h4v4H6V6z"/>
          </svg>
        </button>

        <div className="flex-1" />

        {/* Clear session */}
        {(hasActions || errorCount > 0) && !isRecording && !isVideoRecording && !busy && (
          <button
            onClick={clearSession}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-semibold text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Clear steps & errors"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 5.5a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5.5a.5.5 0 011 0v6a.5.5 0 01-1 0V6zm3.5-.5a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z"/>
              <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 110-2h3a1 1 0 011-1h3a1 1 0 011 1h3a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z"/>
            </svg>
            CLR
          </button>
        )}
      </div>

      {/* Row 2: actions */}
      {!isRecording && hasActions && !busy && (
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <button
            onClick={() => sendMessage('START_PLAYBACK', { speed: 1, stepByStep: false })}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-all"
            title="Start Playback"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6V2z"/>
            </svg>
            PLAY
          </button>

          <button
            onClick={openGuideEditor}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all"
            title="Open Guide Editor (new tab)"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm2 1v2h8V4H4zm0 4v1h8V8H4zm0 3v1h5v-1H4z"/>
            </svg>
            GUIDE
          </button>
        </div>
      )}
    </header>
  );
}
