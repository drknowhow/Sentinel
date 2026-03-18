import { useState, useEffect } from 'react';
import { useExtensionState } from './hooks/useExtensionState';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import StepList from './components/StepList';
import ErrorFeed from './components/ErrorFeed';
import VideoFeed from './components/VideoFeed';
import SessionManager from './components/SessionManager';
import AssertionBuilder from './components/AssertionBuilder';
import TestReport from './components/TestReport';
import FeatureRequestBuilder from './components/FeatureRequestBuilder';
import IssueList from './components/IssueList';
import Footer from './components/Footer';
import SettingsPanel from './components/SettingsPanel';
import AiLog from './components/AiLog';
import type { Assertion, AiLogEntry } from './types';

type FeedTab = 'steps' | 'errors' | 'videos' | 'ai' | 'settings';

function TabButton({ active, onClick, label, count, activeColor }: {
  active: boolean; onClick: () => void; label: string; count: number; activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-xs font-semibold text-center transition-colors relative ${
        active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
          active ? activeColor : 'bg-gray-100 text-gray-500'
        }`}>{count}</span>
      )}
      {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gray-900 rounded-full" />}
    </button>
  );
}

function App() {
  const {
    isRecording, currentSession, playback,
    isErrorTracking, capturedErrors, issues,
  } = useExtensionState();
  const video = useVideoRecorder();
  const [assertions, setAssertions] = useState<Assertion[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('steps');
  const [aiLogCount, setAiLogCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [contentScriptReady, setContentScriptReady] = useState(false);
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);

  // Track AI log count, WS state, and content script attachment reactively
  useEffect(() => {
    chrome.storage.local.get(['aiActivityLog', 'wsConnected', 'contentScriptReady', 'activeTabUrl'], (r) => {
      setAiLogCount(((r.aiActivityLog as AiLogEntry[]) || []).length);
      setWsConnected((r.wsConnected as boolean) ?? false);
      setContentScriptReady((r.contentScriptReady as boolean) ?? false);
      setActiveTabUrl((r.activeTabUrl as string) ?? null);
    });
    const handler = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes.aiActivityLog) setAiLogCount(((changes.aiActivityLog.newValue as AiLogEntry[]) || []).length);
      if (changes.wsConnected) setWsConnected((changes.wsConnected.newValue as boolean) ?? false);
      if (changes.contentScriptReady) setContentScriptReady((changes.contentScriptReady.newValue as boolean) ?? false);
      if (changes.activeTabUrl) setActiveTabUrl((changes.activeTabUrl.newValue as string) ?? null);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const isPlaying = playback?.isPlaying ?? false;
  const hasActions = currentSession.length > 0;

  const addAssertion = (a: Assertion) => {
    const next = [...assertions, a];
    setAssertions(next);
    chrome.storage.local.set({ currentAssertions: next });
  };

  const removeAssertion = (id: string) => {
    const next = assertions.filter(a => a.id !== id);
    setAssertions(next);
    chrome.storage.local.set({ currentAssertions: next });
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <Header
        isRecording={isRecording}
        isPlaying={isPlaying}
        isPaused={playback?.isPaused ?? false}
        isErrorTracking={isErrorTracking}
        isVideoRecording={video.isVideoRecording}
        videoDuration={video.liveDurationSec}
        hasActions={hasActions}
        errorCount={capturedErrors.length}
        stepCount={currentSession.length}
        onToggleVideo={video.toggleRecording}
        wsConnected={wsConnected}
        contentScriptReady={contentScriptReady}
        activeTabUrl={activeTabUrl}
      />

      {isPlaying && (
        <div className="px-4 py-3 bg-white border-b border-gray-200">
          <PlaybackControls
            playback={playback}
            hasActions={hasActions}
            isRecording={isRecording}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex bg-white border-b border-gray-200">
        <TabButton active={feedTab === 'steps'} onClick={() => setFeedTab('steps')} label="Steps" count={currentSession.length} activeColor="bg-blue-100 text-blue-600" />
        <TabButton active={feedTab === 'errors'} onClick={() => setFeedTab('errors')} label="Errors" count={capturedErrors.length} activeColor="bg-red-100 text-red-600" />
        <TabButton active={feedTab === 'videos'} onClick={() => setFeedTab('videos')} label="Videos" count={video.clips.length + (video.isVideoRecording ? 1 : 0)} activeColor="bg-pink-100 text-pink-600" />
        <TabButton active={feedTab === 'ai'} onClick={() => setFeedTab('ai')} label="AI" count={aiLogCount} activeColor="bg-cyan-100 text-cyan-700" />
        <TabButton active={feedTab === 'settings'} onClick={() => setFeedTab('settings')} label="Settings" count={0} activeColor="bg-gray-200 text-gray-700" />
      </div>

      {/* Main feed area */}
      <div className="flex-1 overflow-y-auto bg-white">
        {feedTab === 'steps' && (
          <StepList
            actions={currentSession}
            currentPlaybackStep={isPlaying ? playback?.currentStep : undefined}
          />
        )}
        {feedTab === 'errors' && (
          <ErrorFeed errors={capturedErrors} isTracking={isErrorTracking} />
        )}
        {feedTab === 'videos' && (
          <VideoFeed
            clips={video.clips}
            isRecording={video.isVideoRecording}
            liveDuration={video.liveDurationSec}
            error={video.error}
            onDownload={video.downloadClip}
            onDiscard={video.discardClip}
          />
        )}
        {feedTab === 'ai' && <AiLog />}
        {feedTab === 'settings' && <SettingsPanel />}
      </div>

      {/* Collapsible panels */}
      <div className="bg-white border-t border-gray-200">
        <SessionManager currentActions={currentSession} isRecording={isRecording} />
        <AssertionBuilder
          assertions={assertions}
          onAdd={addAssertion}
          onRemove={removeAssertion}
          currentStepCount={currentSession.length}
          disabled={isPlaying}
        />
        <TestReport />
        <FeatureRequestBuilder disabled={isPlaying} />
        <IssueList issues={issues} />
      </div>

      <Footer />
    </div>
  );
}

export default App;
