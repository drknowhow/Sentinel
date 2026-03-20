import type {
  Action,
  AiLogEntry,
  Assertion,
  AssertionResult,
  CapturedError,
  ExportOptions,
  GuideEdits,
  GuideSection,
  GuideStepEdit,
  Issue,
  Message,
  PlaybackConfig,
  PlaybackRunSummary,
  PlaybackState,
  Session,
} from './types';
import { onMessage, sendToTab } from './lib/messages';
import {
  analyzeIssues,
  analyzeSession,
  deleteIssue,
  getActiveSession,
  getIssues,
  getSessions,
  saveIssue,
  saveSession,
  setActiveSessionId,
  updateIssue,
  updateSessionRunStats,
} from './lib/storage';
import { generateGuideHTML, generateIssueReportHTML, renderBlockReport, renderCustomGuide, renderCustomReport } from './lib/guideHtml';
import type { ReportBlock } from './lib/guideHtml';

// ── AI Activity Log ──

const MAX_LOG_ENTRIES = 60;
const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  profile: 'internal',
  redactSelectors: false,
  redactValues: false,
  redactUrls: false,
  includeDiagnostics: true,
};

function getCommandMeta(command: string, payload: Record<string, unknown>): { label: string; detail?: string } {
  switch (command) {
    case 'API_GET_STATUS': return { label: 'Check Status' };
    case 'API_ATTACH': return { label: 'Attach to Tab' };
    case 'API_NAVIGATE': return { label: 'Navigate', detail: payload.url as string };
    case 'API_SCREENSHOT': return { label: 'Screenshot' };
    case 'API_START_RECORDING': return { label: 'Start Recording' };
    case 'API_STOP_RECORDING': return { label: 'Stop Recording' };
    case 'API_GET_SESSION': return { label: 'Get Session' };
    case 'API_INJECT_ACTION': return { label: `Inject ${payload.type ?? 'action'}`, detail: payload.selector as string };
    case 'API_GENERATE_GUIDE': return { label: 'Generate Guide', detail: (payload.title as string) || undefined };
    case 'API_SET_GUIDE_EDITS': return { label: 'Set Guide Edits' };
    case 'API_START_ERROR_TRACKING': return { label: 'Start Error Tracking' };
    case 'API_STOP_ERROR_TRACKING': return { label: 'Stop Error Tracking' };
    case 'API_GET_ERRORS': return { label: 'Get Errors' };
    case 'API_SAVE_ISSUE': return { label: 'Save Issue', detail: payload.title as string };
    case 'API_GET_ISSUES': return { label: 'Get Issues' };
    case 'API_GENERATE_REPORT': return { label: 'Generate Report' };
    case 'API_GENERATE_CUSTOM_GUIDE': return { label: 'Custom Guide', detail: (payload.title as string) || undefined };
    case 'API_GENERATE_CUSTOM_REPORT': return { label: 'Custom Report', detail: (payload.title as string) || undefined };
    case 'API_ANALYZE_ISSUES': return { label: 'Analyze Issues' };
    case 'API_GET_ISSUES_WITH_SCREENSHOTS': return { label: 'Get Issues (full)' };
    case 'API_UPDATE_ISSUE': return { label: 'Update Issue', detail: payload.id as string };
    case 'API_DELETE_ISSUE': return { label: 'Delete Issue', detail: payload.id as string };
    case 'API_CLEAR_SESSION': return { label: 'Clear Session' };
    case 'API_GET_TEST_RESULTS': return { label: 'Get Test Results' };
    case 'API_GET_ISSUE_CONTEXT': return { label: 'Get Issue Context', detail: payload.id as string };
    case 'API_RENDER_BLOCKS': return { label: 'Render Blocks', detail: `${(payload.blocks as unknown[])?.length ?? 0} blocks` };
    case 'API_ANALYZE_SESSION': return { label: 'Analyze Session' };
    case 'API_GET_SESSION_WITH_SCREENSHOTS': return { label: 'Get Session (full)' };
    case 'API_SET_STEP_DESCRIPTION': return { label: 'Set Step Description', detail: payload.description as string };
    case 'API_WAIT_FOR_ELEMENT': return { label: 'Wait for Element', detail: payload.selector as string };
    case 'API_EVALUATE_SELECTOR': return { label: 'Evaluate Selector', detail: payload.selector as string };
    case 'API_GET_PAGE_SNAPSHOT': return { label: 'Page Snapshot' };
    case 'API_FIND_ELEMENT': return { label: 'Find Element', detail: (payload.text ?? payload.role) as string };
    case 'API_GET_TEXT_CONTENT': return { label: 'Get Text', detail: payload.selector as string };
    case 'API_GET_ELEMENT_STATE': return { label: 'Element State', detail: payload.selector as string };
    case 'API_HOVER': return { label: 'Hover', detail: payload.selector as string };
    case 'API_SELECT_OPTION': return { label: 'Select Option', detail: payload.selector as string };
    case 'API_KEY_SEQUENCE': return { label: 'Key Sequence', detail: payload.keys as string };
    case 'API_DRAG': return { label: 'Drag', detail: `${payload.source} → ${payload.target}` };
    case 'API_WAIT_FOR_TEXT': return { label: 'Wait for Text', detail: payload.text as string };
    case 'API_GET_NETWORK_LOG': return { label: 'Network Log' };
    case 'API_WAIT_FOR_NETWORK_IDLE': return { label: 'Wait Network Idle' };
    case 'API_GET_CONSOLE_LOG': return { label: 'Console Log' };
    case 'API_SAVE_SESSION': return { label: 'Save Session', detail: payload.name as string };
    case 'API_LOAD_SESSION': return { label: 'Load Session', detail: payload.name as string };
    case 'API_LIST_SESSIONS': return { label: 'List Sessions' };
    case 'API_RUN_SAVED_SESSION': return { label: 'Run Session', detail: payload.name as string };
    default: return { label: command.replace(/^API_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) };
  }
}

// Track commands in flight so wsSend can record their outcome
const _pendingCmds = new Map<string, { command: string; payload: Record<string, unknown>; startMs: number }>();

function appendAiLog(command: string, payload: Record<string, unknown>, startMs: number, success: boolean, error?: string): void {
  const { label, detail } = getCommandMeta(command, payload);
  const entry: AiLogEntry = {
    id: `${startMs}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: startMs,
    command,
    label,
    ...(detail ? { detail } : {}),
    status: success ? 'success' : 'error',
    durationMs: Date.now() - startMs,
    ...(error ? { error } : {}),
  };
  chrome.storage.local.get('aiActivityLog', (result) => {
    const log = (result.aiActivityLog as AiLogEntry[]) || [];
    log.unshift(entry);
    if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
    chrome.storage.local.set({ aiActivityLog: log });
  });
}

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
    chrome.storage.local.set({ wsConnected: true });
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
    chrome.storage.local.set({ wsConnected: false });
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
  // Log the completed command
  const pending = _pendingCmds.get(id);
  if (pending) {
    _pendingCmds.delete(id);
    appendAiLog(pending.command, pending.payload, pending.startMs, success, error);
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

// ── Content Script Attachment ──

/** Returns true if the content script is already running in the given tab. */
async function pingTab(tabId: number): Promise<boolean> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return resp?.alive === true;
  } catch {
    return false;
  }
}

/** Injects content.js into the tab if not already present. Returns true on success. */
async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await pingTab(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] });
    // Re-sync recording/error-tracking state into the freshly injected script
    const stored = await chrome.storage.local.get(['isRecording', 'isErrorTracking']);
    if (stored.isRecording) await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' }).catch(() => { });
    if (stored.isErrorTracking) await chrome.tabs.sendMessage(tabId, { type: 'START_ERROR_TRACKING' }).catch(() => { });
    return true;
  } catch {
    return false;
  }
}

async function updateContentScriptStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) { chrome.storage.local.set({ contentScriptReady: false, activeTabUrl: null }); return; }
  // Skip non-injectable pages (chrome://, about:, etc.)
  const url = tab.url ?? '';
  const injectable = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
  if (!injectable) { chrome.storage.local.set({ contentScriptReady: false, activeTabUrl: url }); return; }
  const alive = await pingTab(tab.id);
  chrome.storage.local.set({ contentScriptReady: alive, activeTabUrl: url });
}

// Update status when user switches tabs or a tab finishes loading
chrome.tabs.onActivated.addListener(() => updateContentScriptStatus());
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') updateContentScriptStatus(); });

// ── API Command Dispatcher ──

async function handleApiCommand(id: string, command: string, payload: Record<string, unknown>) {
  _pendingCmds.set(id, { command, payload, startMs: Date.now() });
  try {
    switch (command) {
      case 'API_GET_STATUS': {
        const result = await chrome.storage.local.get(['isRecording', 'isErrorTracking', 'currentSession', 'capturedErrors', 'projectName', 'projectPath', 'projectDevUrl', 'contentScriptReady']);
        const session = (result.currentSession as Action[]) || [];
        const errors = (result.capturedErrors as CapturedError[]) || [];
        const issues = await getIssues();
        const tabId = await getActiveTabId();
        const tab = tabId ? await chrome.tabs.get(tabId) : null;
        wsSend(id, true, {
          isRecording: result.isRecording ?? false,
          isErrorTracking: result.isErrorTracking ?? false,
          isAttached: (result.contentScriptReady as boolean) ?? false,
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

      case 'API_ATTACH': {
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url ?? '';
        const injectable = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
        if (!injectable) { wsSend(id, false, undefined, `Cannot inject into: ${url}`); break; }
        const ok = await ensureContentScript(tabId);
        if (ok) {
          chrome.storage.local.set({ contentScriptReady: true, activeTabUrl: url });
          wsSend(id, true, { attached: true, url, title: tab.title });
        } else {
          wsSend(id, false, undefined, 'Failed to inject content script');
        }
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
        // Re-inject content script after navigation (old page context is destroyed)
        await ensureContentScript(tabId);
        chrome.storage.local.set({ contentScriptReady: true, activeTabUrl: url });
        const tab = await chrome.tabs.get(tabId);
        wsSend(id, true, { url: tab.url, title: tab.title });
        break;
      }

      case 'API_SCREENSHOT': {
        // maxWidth=800 keeps the base64 payload under ~25K chars for AI context
        const dataUrl = await captureScreenshot(800);
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
        // Strip screenshots and context (context fetched on-demand via API_GET_ISSUE_CONTEXT)
        const stripped = issues.map(({ screenshot, context, ...rest }) => rest);
        wsSend(id, true, { issues: stripped });
        break;
      }

      case 'API_START_RECORDING': {
        const append = (payload.append as boolean) ?? false;
        const storageUpdate: Record<string, unknown> = { isRecording: true };
        if (!append) storageUpdate.currentSession = [];
        chrome.storage.local.set(storageUpdate);
        const tabId = await getActiveTabId();
        if (tabId) {
          await ensureContentScript(tabId);
          chrome.storage.local.set({ contentScriptReady: true });
          sendToTab(tabId, 'START_RECORDING');
        }
        wsSend(id, true, { success: true, append });
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
        if (tabId) {
          await ensureContentScript(tabId);
          sendToTab(tabId, 'START_ERROR_TRACKING');
        }
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
        const currentState = await chrome.storage.local.get('currentSession');
        const currentSession = (currentState.currentSession as Action[]) || [];
        // Capture runtime context snapshot at save time (best-effort)
        let context: Issue['context'] | undefined;
        if (tabId) {
          try {
            const [netResp, conResp] = await Promise.allSettled([
              chrome.tabs.sendMessage(tabId, { type: 'API_GET_NETWORK_LOG', payload: {} }),
              chrome.tabs.sendMessage(tabId, { type: 'API_GET_CONSOLE_LOG', payload: {} }),
            ]);
            const errResult = await chrome.storage.local.get('capturedErrors');
            const networkLog = netResp.status === 'fulfilled' ? (netResp.value?.entries ?? []).slice(-20) : undefined;
            const consoleLog = conResp.status === 'fulfilled' ? (conResp.value?.entries ?? []).slice(-30) : undefined;
            const capturedErrors = (errResult.capturedErrors as CapturedError[]) || undefined;
            if (networkLog?.length || consoleLog?.length || capturedErrors?.length) {
              context = { networkLog, consoleLog, capturedErrors };
            }
          } catch { /* context capture is best-effort */ }
        }
        const activeUrl = tab?.url || '';
        const correlatedStepIndices = currentSession
          .map((action, index) => ({ action, index }))
          .filter(({ action }) => {
            const selectorMatch = Boolean(payload.selector) && action.selector === payload.selector;
            const urlMatch = Boolean(activeUrl) && action.url === activeUrl;
            const titleText = String(payload.title || '').toLowerCase();
            const descMatch = titleText && (action.description || '').toLowerCase().includes(titleText.slice(0, 24));
            return selectorMatch || (urlMatch && descMatch);
          })
          .map(item => item.index)
          .slice(0, 5);
        const issue = await saveIssue({
          type: (payload.type as Issue['type']) || 'bug',
          title: (payload.title as string) || 'Untitled Issue',
          notes: (payload.notes as string) || '',
          severity: (payload.severity as Issue['severity']) || 'medium',
          selector: (payload.selector as string) || undefined,
          pageUrl: tab?.url || '',
          screenshot: screenshot ?? undefined,
          context,
          correlatedStepIndices,
        });
        wsSend(id, true, { success: true, id: issue.id });
        break;
      }

      case 'API_SET_GUIDE_EDITS': {
        await chrome.storage.local.set({ pendingGuideEdits: payload.edits ?? payload });
        wsSend(id, true, { saved: true });
        break;
      }

      case 'API_GENERATE_GUIDE': {
        const gr = await chrome.storage.local.get(['currentSession', 'pendingGuideEdits', 'sentinel_active_session_id']);
        const session = (gr.currentSession as Action[]) || [];
        const stored = (gr.pendingGuideEdits as Partial<GuideEdits>) || {};
        const activeSessionId = (gr.sentinel_active_session_id as string | null) || null;
        const activeSession = activeSessionId ? await getActiveSession() : null;
        const exportOptions: ExportOptions = {
          ...DEFAULT_EXPORT_OPTIONS,
          ...(activeSession?.exportOptions || {}),
          ...(stored.exportOptions || {}),
          ...((payload.exportOptions as ExportOptions | undefined) || {}),
        };
        const hasPayload = payload.title || payload.intro || payload.conclusion || payload.stepsJson || payload.sectionsJson;
        let edits: GuideEdits | undefined;
        if (hasPayload || stored.guideTitle || stored.introText || stored.sections?.length) {
          const baseSteps = session.map((_, i) => ({
            originalIndex: i, title: '', notes: '', includeScreenshot: true, included: true,
          }));
          // Merge stored step edits on top of base (by originalIndex)
          const mergedSteps = stored.steps
            ? baseSteps.map(b => {
              const override = stored.steps!.find(s => s.originalIndex === b.originalIndex);
              return override ? { ...b, ...override } : b;
            })
            : baseSteps;
          const parsedSteps = payload.stepsJson
            ? (JSON.parse(payload.stepsJson as string) as GuideStepEdit[])
            : mergedSteps;
          const parsedSections = payload.sectionsJson
            ? (JSON.parse(payload.sectionsJson as string) as GuideSection[])
            : (stored.sections ?? []);
          edits = {
            guideTitle: (payload.title as string) || stored.guideTitle || '',
            introText: (payload.intro as string) || stored.introText || '',
            conclusionText: (payload.conclusion as string) || stored.conclusionText || '',
            steps: parsedSteps,
            sections: parsedSections,
            exportOptions,
          };
        }
        const html = generateGuideHTML(session, edits || { guideTitle: '', introText: '', conclusionText: '', steps: session.map((_, index) => ({ originalIndex: index, title: '', notes: '', includeScreenshot: true, included: true })), exportOptions });
        // Clear pending edits after use
        chrome.storage.local.remove('pendingGuideEdits');
        wsSend(id, true, { html });
        break;
      }

      case 'API_GENERATE_REPORT': {
        const issues = await getIssues();
        const actionResult = await chrome.storage.local.get('currentSession');
        const currentSession = (actionResult.currentSession as Action[]) || [];
        const analysis = analyzeIssues(issues, currentSession);
        const html = generateIssueReportHTML(issues, analysis);
        wsSend(id, true, { html });
        break;
      }

      case 'API_INJECT_ACTION': {
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        await ensureContentScript(tabId);
        try {
          const response = await chrome.tabs.sendMessage(tabId, { type: command, payload });
          if (response?.success) {
            const actionType = payload.type as string;
            const needsScreenshot = ['click', 'dblclick', 'submit', 'navigation'].includes(actionType)
              && !payload.skipScreenshot;
            let screenshot: string | null = null;
            if (needsScreenshot) {
              // Wait for any triggered page navigation to fully load, then a brief paint settle
              await waitForTabIdle(tabId, 3000);
              await new Promise(r => setTimeout(r, 200));
              screenshot = await captureScreenshot();
            }
            // Add action directly to session (bypasses RECORD_ACTION which was suppressed).
            // Awaiting the set prevents the next inject from reading a stale session.
            const sr = await chrome.storage.local.get('currentSession');
            const session = (sr.currentSession as Action[]) || [];
            session.push({
              type: actionType,
              selector: payload.selector as string,
              value: (payload.value as string) || undefined,
              description: (response.description as string) || actionType,
              timestamp: Date.now(),
              url: (response.url as string) || undefined,
              screenshot: screenshot ?? undefined,
              selectorCandidates: (response.selectorCandidates as Action['selectorCandidates']) || undefined,
              selectorConfidence: (response.selectorConfidence as number) || undefined,
              targetSnapshot: (response.targetSnapshot as Action['targetSnapshot']) || undefined,
            });
            await chrome.storage.local.set({ currentSession: session });
          }
          wsSend(id, true, { success: response?.success, description: response?.description });
        } catch (err) {
          wsSend(id, false, undefined, `Content script error: ${err}`);
        }
        break;
      }

      case 'API_WAIT_FOR_ELEMENT':
      case 'API_EVALUATE_SELECTOR':
      case 'API_GET_PAGE_SNAPSHOT':
      case 'API_FIND_ELEMENT':
      case 'API_GET_TEXT_CONTENT':
      case 'API_GET_ELEMENT_STATE':
      case 'API_HOVER':
      case 'API_SELECT_OPTION':
      case 'API_KEY_SEQUENCE':
      case 'API_DRAG':
      case 'API_WAIT_FOR_TEXT':
      case 'API_GET_NETWORK_LOG':
      case 'API_WAIT_FOR_NETWORK_IDLE':
      case 'API_GET_CONSOLE_LOG': {
        // Forward to content script — auto-attach if not already present
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        await ensureContentScript(tabId);
        try {
          const response = await chrome.tabs.sendMessage(tabId, { type: command, payload });
          wsSend(id, true, response);
        } catch (err) {
          wsSend(id, false, undefined, `Content script error: ${err}`);
        }
        break;
      }

      case 'API_SAVE_SESSION': {
        const name = payload.name as string;
        if (!name) { wsSend(id, false, undefined, 'Missing name'); break; }
        const sr = await chrome.storage.local.get(['currentSession', 'currentAssertions', 'currentGuideEdits']);
        const session = (sr.currentSession as Action[]) || [];
        const assertions = (sr.currentAssertions as Assertion[]) || [];
        const guideEdits = (sr.currentGuideEdits as GuideEdits | null) || undefined;
        const saved = await saveSession({
          name,
          actions: session,
          assertions,
          guideEdits,
          kind: (payload.kind as Session['kind']) || 'suite',
          tags: (payload.tags as string[] | undefined) || [],
        });
        await setActiveSessionId(saved.id);
        wsSend(id, true, { name: saved.name, actionCount: saved.actions.length, id: saved.id });
        break;
      }

      case 'API_LOAD_SESSION': {
        const name = payload.name as string;
        if (!name) { wsSend(id, false, undefined, 'Missing name'); break; }
        const sessions = await getSessions();
        const saved = sessions.find(session => session.name === name);
        if (!saved) { wsSend(id, false, undefined, `Session not found: ${name}`); break; }
        await chrome.storage.local.set({
          currentSession: saved.actions,
          currentAssertions: saved.assertions,
          currentGuideEdits: saved.guideEdits ?? null,
        });
        await setActiveSessionId(saved.id);
        wsSend(id, true, { name, actionCount: saved.actions.length, savedAt: saved.updatedAt, id: saved.id });
        break;
      }

      case 'API_LIST_SESSIONS': {
        const sessions = (await getSessions()).map(session => ({
          id: session.id,
          name: session.name,
          kind: session.kind || 'recording',
          actionCount: session.actions.length,
          savedAt: session.updatedAt,
          flakyScore: session.runStats?.flakyScore ?? 0,
        }));
        wsSend(id, true, { sessions });
        break;
      }

      case 'API_RUN_SAVED_SESSION': {
        const name = payload.name as string;
        const speed = (payload.speed as number) || 1;
        const waitForCompletion = (payload.wait as boolean) ?? false;
        if (!name) { wsSend(id, false, undefined, 'Missing name'); break; }
        const sessions = await getSessions();
        const rsaved = sessions.find(session => session.name === name);
        if (!rsaved) { wsSend(id, false, undefined, `Session not found: ${name}`); break; }
        await chrome.storage.local.set({
          currentSession: rsaved.actions,
          currentAssertions: rsaved.assertions,
          currentGuideEdits: rsaved.guideEdits ?? null,
        });
        await setActiveSessionId(rsaved.id);
        const rTabId = await getActiveTabId();
        if (!rTabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        await ensureContentScript(rTabId);
        sendToTab(rTabId, 'START_PLAYBACK', { session: rsaved.actions, assertions: rsaved.assertions, speed, stepByStep: false });
        await chrome.storage.local.set({
          playbackState: {
            isPlaying: true,
            isPaused: false,
            currentStep: 0,
            totalSteps: rsaved.actions.length,
            speed,
            stepByStep: false,
            runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          },
          lastPlaybackSessionId: rsaved.id,
          assertionResults: [],
          lastPlaybackSummary: null,
        });

        if (waitForCompletion) {
          // Poll until playback completes (max 5 min)
          const maxWait = 300_000;
          const pollInterval = 500;
          const start = Date.now();
          await new Promise<void>((resolve) => {
            const check = () => {
              chrome.storage.local.get('playbackState', (r) => {
                const ps = r.playbackState as PlaybackState | undefined;
                if (!ps?.isPlaying || Date.now() - start > maxWait) {
                  resolve();
                } else {
                  setTimeout(check, pollInterval);
                }
              });
            };
            setTimeout(check, pollInterval);
          });
          const tr = await chrome.storage.local.get(['assertionResults', 'lastPlaybackSummary']);
          const results = (tr.assertionResults as AssertionResult[]) || [];
          const summary = (tr.lastPlaybackSummary as PlaybackRunSummary) || null;
          wsSend(id, true, { name, actionCount: rsaved.actions.length, status: 'completed', id: rsaved.id, results, summary });
        } else {
          wsSend(id, true, { name, actionCount: rsaved.actions.length, status: 'playing', id: rsaved.id });
        }
        break;
      }

      case 'API_ANALYZE_SESSION': {
        const asr = await chrome.storage.local.get('currentSession');
        const asSession = (asr.currentSession as Action[]) || [];
        const analysis = analyzeSession(asSession);
        wsSend(id, true, { analysis });
        break;
      }

      case 'API_GET_SESSION_WITH_SCREENSHOTS': {
        const indices = payload.indices as number[] | undefined;
        const gssr = await chrome.storage.local.get('currentSession');
        const gsSession = (gssr.currentSession as Action[]) || [];
        const steps = indices
          ? indices.map(i => ({ ...gsSession[i], index: i })).filter(s => gsSession[s.index] !== undefined)
          : gsSession.map((a, i) => ({ ...a, index: i }));
        wsSend(id, true, { steps });
        break;
      }

      case 'API_SET_STEP_DESCRIPTION': {
        const { index: stepIdx, description: stepDesc } = payload as { index: number; description: string };
        if (typeof stepIdx !== 'number' || !stepDesc) { wsSend(id, false, undefined, 'Missing index or description'); break; }
        const sdResult = await chrome.storage.local.get('currentSession');
        const sdSession = (sdResult.currentSession as Action[]) || [];
        if (stepIdx < 0 || stepIdx >= sdSession.length) { wsSend(id, false, undefined, `Index ${stepIdx} out of range`); break; }
        sdSession[stepIdx] = { ...sdSession[stepIdx], description: stepDesc };
        await chrome.storage.local.set({ currentSession: sdSession });
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_ANALYZE_ISSUES': {
        const issues = await getIssues();
        const actionResult = await chrome.storage.local.get('currentSession');
        const analysis = analyzeIssues(issues, (actionResult.currentSession as Action[]) || []);
        wsSend(id, true, { analysis });
        break;
      }

      case 'API_GET_ISSUES_WITH_SCREENSHOTS': {
        const ids = payload.ids as string[] | undefined;
        const allIssues = await getIssues();
        const result = ids ? allIssues.filter(i => ids.includes(i.id)) : allIssues;
        wsSend(id, true, { issues: result });
        break;
      }

      case 'API_UPDATE_ISSUE': {
        const { id: issueId, updates } = payload as { id: string; updates: Partial<Issue> };
        if (!issueId) { wsSend(id, false, undefined, 'Missing issue id'); break; }
        await updateIssue(issueId, updates);
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_DELETE_ISSUE': {
        const issueId = payload.id as string;
        if (!issueId) { wsSend(id, false, undefined, 'Missing issue id'); break; }
        await deleteIssue(issueId);
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_CLEAR_SESSION': {
        chrome.storage.local.set({
          currentSession: [],
          currentGuideEdits: null,
          capturedErrors: [],
          currentAssertions: [],
          sentinel_issues: [],
        });
        wsSend(id, true, { success: true });
        break;
      }

      case 'API_GET_TEST_RESULTS': {
        const tr = await chrome.storage.local.get(['assertionResults', 'lastPlaybackSummary', 'lastPlaybackSessionId']);
        const results = (tr.assertionResults as AssertionResult[]) || [];
        const summary = (tr.lastPlaybackSummary as PlaybackRunSummary) || null;
        const sessionId = (tr.lastPlaybackSessionId as string) || null;
        wsSend(id, true, { results, summary, sessionId });
        break;
      }

      case 'API_GET_ISSUE_CONTEXT': {
        const ctxId = payload.id as string;
        if (!ctxId) { wsSend(id, false, undefined, 'Missing issue id'); break; }
        const allIssues = await getIssues();
        const issue = allIssues.find(i => i.id === ctxId);
        if (!issue) { wsSend(id, false, undefined, `Issue not found: ${ctxId}`); break; }
        wsSend(id, true, {
          id: ctxId,
          context: issue.context ?? null,
          capturedError: issue.capturedError ?? null,
        });
        break;
      }

      case 'API_GENERATE_CUSTOM_GUIDE': {
        const body = (payload.body as string) || '';
        const title = (payload.title as string) || 'Sentinel Guide';
        if (!body) { wsSend(id, false, undefined, 'Missing body'); break; }
        // Build screenshot map keyed by step index from current session
        const cgr = await chrome.storage.local.get('currentSession');
        const cgSession = (cgr.currentSession as Action[]) || [];
        const screenshots: Record<number, string> = {};
        cgSession.forEach((a, i) => { if (a.screenshot) screenshots[i] = a.screenshot; });
        const html = renderCustomGuide(body, title, screenshots);
        wsSend(id, true, { html });
        break;
      }

      case 'API_GENERATE_CUSTOM_REPORT': {
        const body = (payload.body as string) || '';
        const title = (payload.title as string) || 'Sentinel Issue Report';
        if (!body) { wsSend(id, false, undefined, 'Missing body'); break; }
        // Build screenshot map keyed by issue id
        const issueList = await getIssues();
        const issueScreenshots: Record<string, string> = {};
        issueList.forEach(issue => { if (issue.screenshot) issueScreenshots[issue.id] = issue.screenshot; });
        const html = renderCustomReport(body, title, issueScreenshots);
        wsSend(id, true, { html });
        break;
      }

      case 'API_RENDER_BLOCKS': {
        const rbTitle = (payload.title as string) || 'Sentinel Report';
        const blocks = (payload.blocks as ReportBlock[]) || [];
        if (blocks.length === 0) { wsSend(id, false, undefined, 'No blocks provided'); break; }
        const rbData = await chrome.storage.local.get(['currentSession', 'assertionResults', 'lastPlaybackSummary']);
        const rbIssues = await getIssues();
        const rbActions = (rbData.currentSession as Action[]) || [];
        const rbTestResults = (rbData.assertionResults as AssertionResult[]) || [];
        const rbTestSummary = (rbData.lastPlaybackSummary as PlaybackRunSummary) || null;
        const html = renderBlockReport(rbTitle, blocks, {
          issues: rbIssues,
          actions: rbActions,
          testResults: rbTestResults,
          testSummary: rbTestSummary,
        });
        wsSend(id, true, { html });
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

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  // lastFocusedWindow is reliable from a service worker; currentWindow is not
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true });
  return tab ?? null;
}

// Convert a data URL to Blob without fetch (fetch rejects data: URLs in service workers)
function _dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',', 2);
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Convert a Blob to a data URL without FileReader (FileReader is not available in service workers)
async function _blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

// Wait for the active tab to finish loading (e.g. after a click triggers navigation).
// Returns as soon as status === 'complete' or the timeout is reached.
async function waitForTabIdle(tabId: number, maxMs = 3000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch { return; } // Tab was closed/replaced — proceed
    await new Promise(r => setTimeout(r, 100));
  }
}

async function captureScreenshot(maxWidth = 1280): Promise<string | null> {
  const tab = await getActiveTab();
  if (!tab?.windowId) return null;
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'jpeg', quality: 60 }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Screenshot failed:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      // Downscale if image is wider than maxWidth
      try {
        const blob = _dataUrlToBlob(dataUrl);
        const bitmap = await createImageBitmap(blob);
        if (bitmap.width <= maxWidth) { bitmap.close(); resolve(dataUrl); return; }
        const scale = maxWidth / bitmap.width;
        const canvas = new OffscreenCanvas(maxWidth, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
        resolve(await _blobToDataUrl(outBlob));
      } catch {
        resolve(dataUrl); // downscaling unavailable — return original
      }
    });
  });
}

async function getActiveTabId(): Promise<number | null> {
  return (await getActiveTab())?.id ?? null;
}

function isSignificantEvent(type: string): boolean {
  return ['click', 'dblclick', 'submit', 'navigation'].includes(type);
}

// ── Message Router ──

onMessage((message: Message, _sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'TOGGLE_RECORDING': {
      const { active, clearSession: shouldClear } = payload as { active: boolean; clearSession?: boolean };
      chrome.storage.local.set({ isRecording: active });

      if (active && shouldClear !== false) {
        chrome.storage.local.set({ currentSession: [] });
      }

      getActiveTabId().then(async tabId => {
        if (!tabId) return;
        if (active) {
          const ok = await ensureContentScript(tabId);
          if (ok) {
            chrome.storage.local.set({ contentScriptReady: true });
            sendToTab(tabId, 'START_RECORDING');
          }
        } else {
          sendToTab(tabId, 'STOP_RECORDING');
        }
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
            session.push({
              ...action,
              url: action.url || undefined,
              screenshot: screenshot ?? undefined,
            });
            chrome.storage.local.set({ currentSession: session });
          });
        });
      });
      break;
    }

    case 'START_PLAYBACK': {
      const config = (payload as PlaybackConfig) || { speed: 1, stepByStep: false };

      chrome.storage.local.get(['currentSession', 'currentAssertions', 'preferredSpeed', 'preferredStepByStep', 'sentinel_active_session_id'], async (result) => {
        const session = (result.currentSession as Action[]) || [];
        const assertions = (result.currentAssertions as Assertion[]) || [];
        const speed = config.speed || (result.preferredSpeed as number) || 1;
        const stepByStep = config.stepByStep || (result.preferredStepByStep as boolean) || false;
        const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const activeSessionId = config.sessionId ?? (result.sentinel_active_session_id as string | null) ?? null;

        await chrome.storage.local.set({
          playbackState: {
            isPlaying: true,
            isPaused: false,
            currentStep: 0,
            totalSteps: session.length,
            speed,
            stepByStep,
            runId,
          },
          assertionResults: [],
          lastPlaybackSummary: null,
          lastPlaybackSessionId: activeSessionId,
        });

        getActiveTabId().then(async tabId => {
          if (tabId) {
            await ensureContentScript(tabId);
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
      const { results, summary } = (payload as { results?: AssertionResult[]; summary?: PlaybackRunSummary }) || {};
      chrome.storage.local.get('lastPlaybackSessionId', async result => {
        const lastPlaybackSessionId = (result.lastPlaybackSessionId as string | null) || null;
        if (lastPlaybackSessionId && summary) {
          await updateSessionRunStats(lastPlaybackSessionId, summary);
        }
      });
      chrome.storage.local.set({
        playbackState: null,
        ...(summary ? { lastPlaybackSummary: summary } : {}),
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
      chrome.runtime.sendMessage(message).catch(() => { });
      break;
    }

    // ── Error Tracking ──

    case 'START_ERROR_TRACKING': {
      chrome.storage.local.set({ isErrorTracking: true, capturedErrors: [] });
      getActiveTabId().then(async tabId => {
        if (tabId) {
          await ensureContentScript(tabId);
          sendToTab(tabId, 'START_ERROR_TRACKING');
        }
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
        // Deduplicate: find an existing error with the same source + message
        const existingIdx = errors.findIndex(
          e => e.source === error.source && e.message === error.message
        );
        if (existingIdx >= 0) {
          // Increment count and update timestamp
          const updatedError = {
            ...errors[existingIdx],
            count: (errors[existingIdx].count || 1) + 1,
            timestamp: error.timestamp,
          };
          errors[existingIdx] = updatedError;

          // Propagate updated count to the auto-created Issue
          chrome.storage.local.get(['issues'], (res) => {
            const issues = (res.issues as Issue[]) || [];
            let updated = false;
            for (let i = 0; i < issues.length; i++) {
              if (
                issues[i].capturedError?.source === error.source &&
                issues[i].capturedError?.message === error.message
              ) {
                issues[i].capturedError = updatedError;
                updated = true;
              }
            }
            if (updated) {
              chrome.storage.local.set({ issues });
            }
          });
        } else {
          errors.push({ ...error, count: 1 });
          // Auto-create an Issue for each new unique error
          const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
            'unhandled-exception': 'high',
            'unhandled-rejection': 'high',
            'network-error': 'medium',
            'console-error': 'medium',
            'csp-violation': 'low',
          };
          getActiveTab().then(tab => {
            saveIssue({
              type: 'bug',
              title: error.message.slice(0, 120),
              notes: `Auto-captured ${error.source.replace(/-/g, ' ')}` +
                (error.stack ? `\n\nStack trace:\n${error.stack.slice(0, 500)}` : ''),
              pageUrl: tab?.url || error.url || 'unknown',
              severity: severityMap[error.source] || 'medium',
              capturedError: error,
            });
          });
        }
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
      Promise.all([getIssues(), chrome.storage.local.get('currentSession')]).then(([issues, result]) => {
        const currentSession = (result.currentSession as Action[]) || [];
        const htmlContent = generateIssueReportHTML(issues, analyzeIssues(issues, currentSession));
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
      chrome.storage.local.get(['currentSession', 'sentinel_active_session_id'], async result => {
        const actions = (result.currentSession as Action[]) || [];
        const activeSessionId = (result.sentinel_active_session_id as string | null) || null;
        const activeSession = activeSessionId ? await getActiveSession() : null;
        const htmlContent = generateGuideHTML(actions, {
          ...edits,
          exportOptions: {
            ...DEFAULT_EXPORT_OPTIONS,
            ...(activeSession?.exportOptions || {}),
            ...(edits.exportOptions || {}),
          },
        });
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
    case 'INSTALL_LOCAL_MCP':
    case 'REMOVE_LOCAL_MCP':
    case 'FORCE_RESTART_MCP': {
      const cmd = type === 'LAUNCH_MCP_SERVER' ? 'start'
        : type === 'STOP_MCP_SERVER' ? 'stop'
          : type === 'REMOVE_MCP_LAUNCHER' ? 'uninstall'
            : type === 'INSTALL_LOCAL_MCP' ? 'install_local'
              : type === 'REMOVE_LOCAL_MCP' ? 'remove_local'
                : type === 'FORCE_RESTART_MCP' ? 'force_restart'
                  : 'status';
      const nativePayload = (type === 'INSTALL_LOCAL_MCP' || type === 'REMOVE_LOCAL_MCP')
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
      chrome.storage.local.get(['currentSession', 'sentinel_active_session_id'], async result => {
        const session = (result.currentSession as Action[]) || [];
        const activeSessionId = (result.sentinel_active_session_id as string | null) || null;
        const activeSession = activeSessionId ? await getActiveSession() : null;
        const htmlContent = generateGuideHTML(session, {
          guideTitle: activeSession?.guideEdits?.guideTitle || 'Sentinel Visual Guide',
          introText: activeSession?.guideEdits?.introText || '',
          conclusionText: activeSession?.guideEdits?.conclusionText || '',
          steps: activeSession?.guideEdits?.steps || session.map((_, index) => ({
            originalIndex: index,
            title: '',
            notes: '',
            includeScreenshot: true,
            included: true,
          })),
          sections: activeSession?.guideEdits?.sections || [],
          exportOptions: {
            ...DEFAULT_EXPORT_OPTIONS,
            ...(activeSession?.exportOptions || {}),
            ...(activeSession?.guideEdits?.exportOptions || {}),
          },
        });
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
