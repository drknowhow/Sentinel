import type { Action, Message, Assertion, AssertionResult, PlaybackConfig, CapturedError, GuideEdits } from './types';
import { onMessage, sendToTab } from './lib/messages';
import { saveIssue, deleteIssue, getIssues } from './lib/storage';
import { generateGuideHTML, generateIssueReportHTML } from './lib/guideHtml';

// ── Side Panel ──

chrome.action.onClicked.addListener((_tab) => {
  chrome.sidePanel.open({ windowId: _tab.windowId! });
});

// ── Install ──

chrome.runtime.onInstalled.addListener(() => {
  console.log('Sentinel extension installed');
  chrome.storage.local.set({
    isRecording: false,
    currentSession: [],
    playbackState: null,
    assertionResults: [],
  });
});

// ── Helpers ──

async function getIsRecording(): Promise<boolean> {
  const result = await chrome.storage.local.get('isRecording');
  return (result.isRecording as boolean) ?? false;
}

async function captureScreenshot(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 70 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Screenshot failed:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function isSignificantEvent(type: string): boolean {
  return ['click', 'dblclick', 'submit', 'navigation'].includes(type);
}

// ── Message Router ──

onMessage((message: Message, _sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'TOGGLE_RECORDING': {
      const { active } = payload as { active: boolean };
      chrome.storage.local.set({ isRecording: active });

      if (active) {
        chrome.storage.local.set({ currentSession: [] });
      }

      getActiveTabId().then(tabId => {
        if (tabId) sendToTab(tabId, active ? 'START_RECORDING' : 'STOP_RECORDING');
      });
      sendResponse({ status: 'success' });
      break;
    }

    case 'RECORD_ACTION': {
      getIsRecording().then(recording => {
        if (!recording) return;
        const action = payload as Action;
        const shouldScreenshot = isSignificantEvent(action.type);

        (shouldScreenshot ? captureScreenshot() : Promise.resolve(null)).then(screenshot => {
          chrome.storage.local.get(['currentSession'], (result) => {
            const session = (result.currentSession as Action[]) || [];
            session.push({ ...action, screenshot: screenshot ?? undefined });
            chrome.storage.local.set({ currentSession: session });
          });
        });
      });
      break;
    }

    case 'START_PLAYBACK': {
      const config = (payload as PlaybackConfig) || { speed: 1, stepByStep: false };

      chrome.storage.local.get(['currentSession', 'currentAssertions', 'preferredSpeed', 'preferredStepByStep'], (result) => {
        const session = (result.currentSession as Action[]) || [];
        const assertions = (result.currentAssertions as Assertion[]) || [];
        const speed = config.speed || (result.preferredSpeed as number) || 1;
        const stepByStep = config.stepByStep || (result.preferredStepByStep as boolean) || false;

        chrome.storage.local.set({
          playbackState: {
            isPlaying: true,
            isPaused: false,
            currentStep: 0,
            totalSteps: session.length,
            speed,
            stepByStep,
          },
          assertionResults: [],
        });

        getActiveTabId().then(tabId => {
          if (tabId) {
            sendToTab(tabId, 'START_PLAYBACK', { session, assertions, speed, stepByStep });
          }
        });
      });
      break;
    }

    case 'PAUSE_PLAYBACK':
    case 'RESUME_PLAYBACK':
    case 'STOP_PLAYBACK':
    case 'NEXT_STEP': {
      getActiveTabId().then(tabId => {
        if (tabId) sendToTab(tabId, type);
      });

      if (type === 'PAUSE_PLAYBACK') {
        chrome.storage.local.get(['playbackState'], (result) => {
          const state = result.playbackState;
          if (state) chrome.storage.local.set({ playbackState: { ...state, isPaused: true } });
        });
      } else if (type === 'RESUME_PLAYBACK') {
        chrome.storage.local.get(['playbackState'], (result) => {
          const state = result.playbackState;
          if (state) chrome.storage.local.set({ playbackState: { ...state, isPaused: false } });
        });
      } else if (type === 'STOP_PLAYBACK') {
        chrome.storage.local.set({ playbackState: null });
      }
      break;
    }

    case 'PLAYBACK_PROGRESS': {
      const { currentStep, totalSteps } = payload as { currentStep: number; totalSteps: number };
      chrome.storage.local.get(['playbackState'], (result) => {
        const state = result.playbackState;
        if (state) {
          chrome.storage.local.set({ playbackState: { ...state, currentStep, totalSteps } });
        }
      });
      break;
    }

    case 'PLAYBACK_COMPLETE': {
      const results = (payload as { results?: AssertionResult[] })?.results;
      chrome.storage.local.set({
        playbackState: null,
        ...(results ? { assertionResults: results } : {}),
      });
      break;
    }

    case 'START_INSPECTION':
    case 'STOP_INSPECTION':
    case 'START_FEATURE_INSPECTION': {
      getActiveTabId().then(tabId => {
        if (tabId) sendToTab(tabId, type);
      });
      break;
    }

    case 'ELEMENT_SELECTED': {
      // Re-broadcast to all extension pages (side panel) since the background
      // returning true on the listener claims the message channel
      chrome.runtime.sendMessage(message).catch(() => {});
      break;
    }

    // ── Error Tracking ──

    case 'START_ERROR_TRACKING': {
      chrome.storage.local.set({ isErrorTracking: true, capturedErrors: [] });
      getActiveTabId().then(tabId => {
        if (tabId) sendToTab(tabId, 'START_ERROR_TRACKING');
      });
      break;
    }

    case 'STOP_ERROR_TRACKING': {
      chrome.storage.local.set({ isErrorTracking: false });
      getActiveTabId().then(tabId => {
        if (tabId) sendToTab(tabId, 'STOP_ERROR_TRACKING');
      });
      break;
    }

    case 'ERROR_CAPTURED': {
      const error = payload as CapturedError;
      chrome.storage.local.get(['capturedErrors'], (result) => {
        const errors = (result.capturedErrors as CapturedError[]) || [];
        errors.push(error);
        chrome.storage.local.set({ capturedErrors: errors });
      });
      break;
    }

    // ── Issue CRUD ──

    case 'SAVE_ISSUE': {
      const issueData = payload as Parameters<typeof saveIssue>[0];
      // Capture a screenshot at save time
      captureScreenshot().then(screenshot => {
        saveIssue({ ...issueData, screenshot: screenshot ?? undefined });
      });
      break;
    }

    case 'DELETE_ISSUE': {
      const { id } = payload as { id: string };
      deleteIssue(id);
      break;
    }

    case 'EXPORT_ISSUES': {
      getIssues().then(issues => {
        const htmlContent = generateIssueReportHTML(issues);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const reader = new FileReader();
        reader.onload = function () {
          if (typeof reader.result === 'string') {
            chrome.downloads.download({
              url: reader.result,
              filename: `sentinel-issues-${Date.now()}.html`,
              saveAs: true,
            });
          }
        };
        reader.readAsDataURL(blob);
      });
      break;
    }

    case 'GET_TAB_CAPTURE_STREAM_ID': {
      getActiveTabId().then(tabId => {
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        chrome.tabCapture.getMediaStreamId(
          { targetTabId: tabId },
          (streamId) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ streamId });
            }
          }
        );
      });
      break;
    }

    case 'EXPORT_EDITED_GUIDE': {
      const { edits } = payload as { edits: GuideEdits };
      // Read actions from storage (not from the message) to preserve screenshot data URLs
      chrome.storage.local.get(['currentSession'], (result) => {
        const actions = (result.currentSession as Action[]) || [];
        const htmlContent = generateGuideHTML(actions, edits);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const reader = new FileReader();
        reader.onload = function () {
          if (typeof reader.result === 'string') {
            chrome.downloads.download({
              url: reader.result,
              filename: `sentinel-guide-${Date.now()}.html`,
              saveAs: true,
            });
          }
        };
        reader.readAsDataURL(blob);
      });
      break;
    }

    case 'EXPORT_GUIDE': {
      chrome.storage.local.get(['currentSession'], (result) => {
        const session = (result.currentSession as Action[]) || [];
        const htmlContent = generateGuideHTML(session);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const reader = new FileReader();
        reader.onload = function () {
          if (typeof reader.result === 'string') {
            chrome.downloads.download({
              url: reader.result,
              filename: `sentinel-guide-${Date.now()}.html`,
              saveAs: true,
            });
          }
        };
        reader.readAsDataURL(blob);
      });
      break;
    }
  }

  return true; // keep channel open for async responses
});

