import { useState, useEffect } from 'react';
import { useExtensionState } from './hooks/useExtensionState';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import StepList from './components/StepList';
import VideoFeed from './components/VideoFeed';
import SessionManager from './components/SessionManager';
import AssertionBuilder from './components/AssertionBuilder';
import TestReport from './components/TestReport';
import FeatureRequestBuilder from './components/FeatureRequestBuilder';
import IssueList from './components/IssueList';
import Footer from './components/Footer';
import SettingsPanel from './components/SettingsPanel';
import AiLog from './components/AiLog';
import ErrorBoundary from './components/ErrorBoundary';
import type { Assertion, AiLogEntry } from './types';

type FeedTab = 'steps' | 'findings' | 'videos' | 'ai' | 'settings';
type StepsPanel = 'sessions' | 'assertions' | 'report' | 'feature' | null;

function TabButton({ active, onClick, label, count, activeColor, icon }: {
  active: boolean; onClick: () => void; label: string; count: number; activeColor: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-2 transition-all relative ${active ? activeColor : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
        }`}
    >
      <div className="relative mb-0.5">
        {icon}
        {count > 0 && (
          <span className={`absolute -top-1.5 -right-2.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm ring-2 ring-white ${active ? 'bg-current text-white mix-blend-hard-light' : 'bg-gray-500 text-white'}`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className={`text-[9px] font-bold tracking-wide uppercase ${active ? 'opacity-100' : 'opacity-80'}`}>{label}</span>
      {active && <span className="absolute top-0 left-1/4 right-1/4 h-[3px] rounded-b-md bg-current opacity-20" />}
    </button>
  );
}

function Pill({ active, onClick, label, count, variant = 'toggle' }: {
  active?: boolean; onClick: () => void; label: string; count?: number; variant?: 'toggle' | 'action';
}) {
  if (variant === 'action') {
    return (
      <button
        onClick={onClick}
        className="px-2.5 py-1 text-[10px] font-semibold rounded-full border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all whitespace-nowrap"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all whitespace-nowrap ${active
        ? 'bg-gray-800 text-white shadow-sm'
        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
        }`}
    >
      {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
    </button>
  );
}

function App() {
  const {
    isRecording, currentSession, playback,
    isErrorTracking, capturedErrors, issues,
  } = useExtensionState();
  const video = useVideoRecorder();
  const [feedTab, setFeedTab] = useState<FeedTab>('steps');
  const [aiLogCount, setAiLogCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [contentScriptReady, setContentScriptReady] = useState(false);
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Steps tab sub-panel state
  const [stepsPanel, setStepsPanel] = useState<StepsPanel>(null);

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

  const [assertions, setAssertions] = useState<Assertion[]>([]);

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg.type === 'ELEMENT_SELECTED') {
        setIsInspecting(false);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

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

  const toggleInspect = () => {
    const nextState = !isInspecting;
    setIsInspecting(nextState);
    chrome.runtime.sendMessage({ type: nextState ? 'START_FEATURE_INSPECTION' : 'STOP_INSPECTION' });
  };

  const toggleStepsPanel = (panel: StepsPanel) => {
    setStepsPanel(prev => prev === panel ? null : panel);
  };

  // Close sub-panel when switching tabs
  useEffect(() => {
    setStepsPanel(null);
  }, [feedTab]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      <Header
        isRecording={isRecording}
        isPlaying={isPlaying}
        isErrorTracking={isErrorTracking}
        isVideoRecording={video.isVideoRecording}
        videoDuration={video.liveDurationSec}
        hasActions={hasActions}
        errorCount={capturedErrors.length}
        stepCount={currentSession.length}
        issueCount={issues.length}
        onToggleVideo={video.toggleRecording}
        wsConnected={wsConnected}
        contentScriptReady={contentScriptReady}
        activeTabUrl={activeTabUrl}
        isInspecting={isInspecting}
        onToggleInspect={toggleInspect}
      />

      {isPlaying && (
        <div className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <PlaybackControls
            playback={playback}
            hasActions={hasActions}
            isRecording={isRecording}
          />
        </div>
      )}

      {/* Contextual Sub-Toolbar */}
      {feedTab === 'steps' && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-gray-100 shrink-0 overflow-x-auto">
          <Pill
            active={stepsPanel === 'sessions'}
            onClick={() => toggleStepsPanel('sessions')}
            label="Sessions"
          />
          <Pill
            active={stepsPanel === 'assertions'}
            onClick={() => toggleStepsPanel('assertions')}
            label="Assertions"
            count={assertions.length}
          />
          <Pill
            active={stepsPanel === 'report'}
            onClick={() => toggleStepsPanel('report')}
            label="Report"
          />
          <Pill
            active={stepsPanel === 'feature'}
            onClick={() => toggleStepsPanel('feature')}
            label="Feature Req"
          />
        </div>
      )}

      {/* Main feed area */}
      <div className="flex-1 overflow-y-auto bg-white min-h-0 relative">
        <ErrorBoundary fallbackMessage="The main feed component crashed. Check the console or try clearing the session.">
          {feedTab === 'steps' && (
            <>
              {/* Expandable sub-panels for Steps tab */}
              {stepsPanel === 'sessions' && (
                <div className="border-b border-gray-200 bg-gray-50/50">
                  <SessionManager currentActions={currentSession} isRecording={isRecording} inline />
                </div>
              )}
              {stepsPanel === 'assertions' && (
                <div className="border-b border-gray-200 bg-gray-50/50">
                  <AssertionBuilder
                    assertions={assertions}
                    onAdd={addAssertion}
                    onRemove={removeAssertion}
                    currentStepCount={currentSession.length}
                    disabled={isPlaying}
                    inline
                  />
                </div>
              )}
              {stepsPanel === 'report' && (
                <div className="border-b border-gray-200 bg-gray-50/50">
                  <TestReport inline />
                </div>
              )}
              {stepsPanel === 'feature' && (
                <div className="border-b border-gray-200 bg-gray-50/50">
                  <FeatureRequestBuilder disabled={isPlaying} inline />
                </div>
              )}
              <StepList
                actions={currentSession}
                currentPlaybackStep={isPlaying ? playback?.currentStep : undefined}
              />
            </>
          )}
          {feedTab === 'findings' && (
            <IssueList issues={issues} />
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
        </ErrorBoundary>
      </div>

      <Footer />

      {/* Bottom Tab Navigation Bar */}
      <div className="flex bg-white border-t border-gray-200 pb-1 pt-1.5 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] z-20">
        <TabButton
          active={feedTab === 'steps'} onClick={() => setFeedTab('steps')} label="Steps" count={currentSession.length} activeColor="text-blue-600"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>}
        />
        <TabButton
          active={feedTab === 'findings'} onClick={() => setFeedTab('findings')} label="Findings" count={issues.length} activeColor="text-orange-500"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>}
        />
        <TabButton
          active={feedTab === 'videos'} onClick={() => setFeedTab('videos')} label="Videos" count={video.clips.length + (video.isVideoRecording ? 1 : 0)} activeColor="text-pink-500"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><path d="M10 8l6 4-6 4V8z" /></svg>}
        />
        <TabButton
          active={feedTab === 'ai'} onClick={() => setFeedTab('ai')} label="AI" count={aiLogCount} activeColor="text-cyan-600"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>}
        />
        <TabButton
          active={feedTab === 'settings'} onClick={() => setFeedTab('settings')} label="Settings" count={0} activeColor="text-gray-800"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>}
        />
      </div>
    </div>
  );
}

export default App;
