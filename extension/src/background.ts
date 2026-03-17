import type { Action, Message, Assertion, AssertionResult, PlaybackConfig, CapturedError, GuideEdits, Issue } from './types';
import { onMessage, sendToTab } from './lib/messages';
import { saveIssue, deleteIssue, getIssues } from './lib/storage';
import { generateGuideHTML, generateIssueReportHTML } from './lib/guideHtml';

// ── WebSocket Bridge (MCP ↔ Extension) ──

const WS_URL = 'ws://127.0.0.1:18925';
const WS_RECONNECT_MIN = 3000;
const WS_RECONNECT_MAX = 30000;
const WS_KEEPALIVE_INTERVAL = 'sentinel-ws-keepalive';

let ws: WebSocket | null = null;
let wsReconnectDelay = WS_RECONNECT_MIN;

function wsConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('Sentinel WS: connected to MCP bridge');
    wsReconnectDelay = WS_RECONNECT_MIN;
  };

  ws.onmessage = (event) => {
    let msg: { id: string; command: string; payload?: Record<string, unknown> };
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }
    handleApiCommand(msg.id, msg.command, msg.payload ?? {});
  };

  ws.onclose = () => {
    ws = null;
    // Do NOT clear the keepalive alarm — it must stay running so the service
    // worker is periodically woken to retry the connection.
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  setTimeout(() => {
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX);
    wsConnect();
  }, wsReconnectDelay);
}

function wsSend(id: string, success: boolean, data?: unknown, error?: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id, success, ...(success ? { data } : { error }) }));
  }
}

// Keepalive alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WS_KEEPALIVE_INTERVAL) {
    // Ping to keep service worker alive; reconnect if needed
    if (!ws || ws.readyState !== WebSocket.OPEN) wsConnect();
  }
});

// Keep the alarm running permanently — it wakes the service worker every ~24s
// to retry the WebSocket connection. Without this, the service worker dies after
// 30s of inactivity and all pending setTimeout reconnects are lost.
chrome.alarms.create(WS_KEEPALIVE_INTERVAL, { periodInMinutes: 0.4 });

// Connect on startup
wsConnect();

// Also reconnect when service worker wakes
chrome.runtime.onStartup?.addListener(() => wsConnect());

// ── API Command Dispatcher ──

async function handleApiCommand(id: string, command: string, payload: Record<string, unknown>) {
  try {
    switch (command) {
      case 'API_GET_STATUS': {
        const result = await chrome.storage.local.get(['isRecording', 'isErrorTracking', 'currentSession', 'capturedErrors', 'projectName', 'projectPath', 'projectDevUrl']);
        const session = (result.currentSession as Action[]) || [];
        const errors = (result.capturedErrors as CapturedError[]) || [];
        const issues = await getIssues();
        const tabId = await getActiveTabId();
        const tab = tabId ? await chrome.tabs.get(tabId) : null;
        wsSend(id, true, {
          isRecording: result.isRecording ?? false,
          isErrorTracking: result.isErrorTracking ?? false,
          actionCount: session.length,
          errorCount: errors.length,
          issueCount: issues.length,
          currentUrl: tab?.url ?? null,
          project: {
            name: (result.projectName as string) || null,
            path: (result.projectPath as string) || null,
            devUrl: (result.projectDevUrl as string) || null,
          },
        });
        break;
      }

      case 'API_NAVIGATE': {
        const url = payload.url as string;
        if (!url) { wsSend(id, false, undefined, 'Missing url'); break; }
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        await chrome.tabs.update(tabId, { url });
        // Wait for page load
        await new Promise<void>((resolve) => {
          const listener = (tId: number, info: { status?: string }) => {
            if (tId === tabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // Timeout after 30s
          setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
        });
        const tab = await chrome.tabs.get(tabId);
        wsSend(id, true, { url: tab.url, title: tab.title });
        break;
      }

      case 'API_SCREENSHOT': {
        const dataUrl = await captureScreenshot();
        if (dataUrl) {
          wsSend(id, true, { screenshot: dataUrl });
        } else {
          wsSend(id, false, undefined, 'Screenshot capture failed');
        }
        break;
      }

      case 'API_GET_SESSION': {
        const result = await chrome.storage.local.get('currentSession');
        const session = (result.currentSession as Action[]) || [];
        // Strip screenshot data to reduce payload size
        const stripped = session.map(({ screenshot, ...rest }) => rest);
        wsSend(id, true, { actions: stripped });
        break;
      }

      case 'API_GET_ERRORS': {
        const result = await chrome.storage.local.get('capturedErrors');
        wsSend(id, true, { errors: (result.capturedErrors as CapturedError[]) || [] });
        break;
      }

      case 'API_GET_ISSUES': {
        const issues = await getIssues();
        // Strip screenshots
        const stripped = issues.map(({ screenshot, ...rest }) => rest);
        wsSend(id, true, { issues: stripped });
        break;
      }

      case 'API_START_RECORDING': {
        chrome.storage.local.set({ isRecording: true, currentSession: [] });
        const tabId = await getActiveTabId();
        if (tabId) sendToTab(tabId, 'START_RECORDING');
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_STOP_RECORDING': {
        chrome.storage.local.set({ isRecording: false });
        const tabId = await getActiveTabId();
        if (tabId) sendToTab(tabId, 'STOP_RECORDING');
        const result = await chrome.storage.local.get('currentSession');
        const session = (result.currentSession as Action[]) || [];
        wsSend(id, true, { success: true, actionCount: session.length });
        break;
      }

      case 'API_START_ERROR_TRACKING': {
        chrome.storage.local.set({ isErrorTracking: true, capturedErrors: [] });
        const tabId = await getActiveTabId();
        if (tabId) sendToTab(tabId, 'START_ERROR_TRACKING');
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_STOP_ERROR_TRACKING': {
        chrome.storage.local.set({ isErrorTracking: false });
        const tabId = await getActiveTabId();
        if (tabId) sendToTab(tabId, 'STOP_ERROR_TRACKING');
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_SAVE_ISSUE': {
        const tabId = await getActiveTabId();
        const tab = tabId ? await chrome.tabs.get(tabId) : null;
        const screenshot = await captureScreenshot();
        const issue = await saveIssue({
          type: (payload.type as Issue['type']) || 'bug',
          title: (payload.title as string) || 'Untitled Issue',
          notes: (payload.notes as string) || '',
          severity: (payload.severity as Issue['severity']) || 'medium',
          pageUrl: tab?.url || '',
          screenshot: screenshot ?? undefined,
        });
        wsSend(id, true, { success: true, id: issue.id });
        break;
      }

      case 'API_GENERATE_GUIDE': {
        const result = await chrome.storage.local.get('currentSession');
        const session = (result.currentSession as Action[]) || [];
        const edits: GuideEdits | undefined = (payload.title || payload.intro || payload.conclusion) ? {
          guideTitle: (payload.title as string) || '',
          introText: (payload.intro as string) || '',
          conclusionText: (payload.conclusion as string) || '',
          steps: session.map((_, i) => ({
            originalIndex: i,
            title: '',
            notes: '',
            includeScreenshot: true,
            included: true,
          })),
        } : undefined;
        const html = generateGuideHTML(session, edits);
        wsSend(id, true, { html });
        break;
      }

      case 'API_GENERATE_REPORT': {
        const issues = await getIssues();
        const html = generateIssueReportHTML(issues);
        wsSend(id, true, { html });
        break;
      }

      case 'API_INJECT_ACTION':
      case 'API_WAIT_FOR_ELEMENT':
      case 'API_EVALUATE_SELECTOR': {
        // Forward to content script and relay response
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        try {
          const response = await chrome.tabs.sendMessage(tabId, { type: command, payload });
          wsSend(id, true, response);
        } catch (err) {
          wsSend(id, false, undefined, `Content script error: ${err}`);
        }
        break;
      }

      default:
        wsSend(id, false, undefined, `Unknown command: ${command}`);
    }
  } catch (err) {
    wsSend(id, false, undefined, String(err));
  }
}

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

    case 'WS_GET_STATUS': {
      sendResponse({ connected: ws?.readyState === WebSocket.OPEN });
      break;
    }

    case 'WS_RECONNECT': {
      wsReconnectDelay = WS_RECONNECT_MIN;
      ws?.close();
      wsConnect();
      sendResponse({ ok: true });
      break;
    }

    case 'LAUNCH_MCP_SERVER':
    case 'STOP_MCP_SERVER':
    case 'MCP_LAUNCHER_STATUS':
    case 'REMOVE_MCP_LAUNCHER':
    case 'INSTALL_LOCAL_MCP': {
      const cmd = type === 'LAUNCH_MCP_SERVER'  ? 'start'
                : type === 'STOP_MCP_SERVER'    ? 'stop'
                : type === 'REMOVE_MCP_LAUNCHER'? 'uninstall'
                : type === 'INSTALL_LOCAL_MCP'  ? 'install_local'
                :                                 'status';
      const nativePayload = type === 'INSTALL_LOCAL_MCP'
        ? { command: cmd, payload: { project_path: (payload as Record<string, string>).projectPath } }
        : { command: cmd };
      chrome.runtime.sendNativeMessage('com.sentinel.launcher', nativePayload, (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message ?? 'Unknown error';
          const notInstalled = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not installed');
          sendResponse({ success: false, error: msg, notInstalled });
        } else {
          // After a successful start, attempt immediate WS reconnect
          if (cmd === 'start' && response?.status === 'started') wsConnect();
          sendResponse(response ?? { success: false, error: 'No response' });
        }
      });
      return true; // keep channel open for async sendNativeMessage callback
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

