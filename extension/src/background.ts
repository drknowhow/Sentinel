import type { Action, Message, Assertion, AssertionResult, PlaybackConfig, CapturedError, GuideEdits, GuideStepEdit, GuideSection, Issue, AiLogEntry } from './types';
import { onMessage, sendToTab } from './lib/messages';
import { saveIssue, deleteIssue, getIssues, updateIssue, analyzeIssues, analyzeSession } from './lib/storage';
import { generateGuideHTML, generateIssueReportHTML, renderCustomGuide, renderCustomReport } from './lib/guideHtml';

// ── AI Activity Log ──

const MAX_LOG_ENTRIES = 60;

function getCommandMeta(command: string, payload: Record<string, unknown>): { label: string; detail?: string } {
  switch (command) {
    case 'API_GET_STATUS':           return { label: 'Check Status' };
    case 'API_ATTACH':               return { label: 'Attach to Tab' };
    case 'API_NAVIGATE':             return { label: 'Navigate', detail: payload.url as string };
    case 'API_SCREENSHOT':           return { label: 'Screenshot' };
    case 'API_START_RECORDING':      return { label: 'Start Recording' };
    case 'API_STOP_RECORDING':       return { label: 'Stop Recording' };
    case 'API_GET_SESSION':          return { label: 'Get Session' };
    case 'API_INJECT_ACTION':        return { label: `Inject ${payload.type ?? 'action'}`, detail: payload.selector as string };
    case 'API_GENERATE_GUIDE':       return { label: 'Generate Guide', detail: (payload.title as string) || undefined };
    case 'API_START_ERROR_TRACKING': return { label: 'Start Error Tracking' };
    case 'API_STOP_ERROR_TRACKING':  return { label: 'Stop Error Tracking' };
    case 'API_GET_ERRORS':           return { label: 'Get Errors' };
    case 'API_SAVE_ISSUE':           return { label: 'Save Issue', detail: payload.title as string };
    case 'API_GET_ISSUES':           return { label: 'Get Issues' };
    case 'API_GENERATE_REPORT':              return { label: 'Generate Report' };
    case 'API_GENERATE_CUSTOM_GUIDE':        return { label: 'Custom Guide', detail: (payload.title as string) || undefined };
    case 'API_GENERATE_CUSTOM_REPORT':       return { label: 'Custom Report', detail: (payload.title as string) || undefined };
    case 'API_ANALYZE_ISSUES':               return { label: 'Analyze Issues' };
    case 'API_GET_ISSUES_WITH_SCREENSHOTS':  return { label: 'Get Issues (full)' };
    case 'API_UPDATE_ISSUE':                 return { label: 'Update Issue', detail: payload.id as string };
    case 'API_ANALYZE_SESSION':              return { label: 'Analyze Session' };
    case 'API_GET_SESSION_WITH_SCREENSHOTS': return { label: 'Get Session (full)' };
    case 'API_SET_STEP_DESCRIPTION':         return { label: 'Set Step Description', detail: payload.description as string };
    case 'API_WAIT_FOR_ELEMENT':       return { label: 'Wait for Element', detail: payload.selector as string };
    case 'API_EVALUATE_SELECTOR':      return { label: 'Evaluate Selector', detail: payload.selector as string };
    case 'API_GET_PAGE_SNAPSHOT':      return { label: 'Page Snapshot' };
    case 'API_FIND_ELEMENT':           return { label: 'Find Element', detail: (payload.text ?? payload.role) as string };
    case 'API_GET_TEXT_CONTENT':       return { label: 'Get Text', detail: payload.selector as string };
    case 'API_GET_ELEMENT_STATE':      return { label: 'Element State', detail: payload.selector as string };
    case 'API_HOVER':                  return { label: 'Hover', detail: payload.selector as string };
    case 'API_SELECT_OPTION':          return { label: 'Select Option', detail: payload.selector as string };
    case 'API_KEY_SEQUENCE':           return { label: 'Key Sequence', detail: payload.keys as string };
    case 'API_DRAG':                   return { label: 'Drag', detail: `${payload.source} → ${payload.target}` };
    case 'API_WAIT_FOR_TEXT':          return { label: 'Wait for Text', detail: payload.text as string };
    case 'API_GET_NETWORK_LOG':        return { label: 'Network Log' };
    case 'API_WAIT_FOR_NETWORK_IDLE':  return { label: 'Wait Network Idle' };
    case 'API_GET_CONSOLE_LOG':        return { label: 'Console Log' };
    case 'API_SAVE_SESSION':           return { label: 'Save Session', detail: payload.name as string };
    case 'API_LOAD_SESSION':           return { label: 'Load Session', detail: payload.name as string };
    case 'API_LIST_SESSIONS':          return { label: 'List Sessions' };
    case 'API_RUN_SAVED_SESSION':      return { label: 'Run Session', detail: payload.name as string };
    default:                         return { label: command.replace(/^API_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) };
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
    if (stored.isRecording) await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' }).catch(() => {});
    if (stored.isErrorTracking) await chrome.tabs.sendMessage(tabId, { type: 'START_ERROR_TRACKING' }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function updateContentScriptStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) { chrome.storage.local.set({ contentScriptReady: false, activeTabUrl: null }); return; }
  // Skip non-http pages (chrome://, about:, etc.)
  const url = tab.url ?? '';
  const injectable = url.startsWith('http://') || url.startsWith('https://');
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

      case 'API_ATTACH': {
        const tabId = await getActiveTabId();
        if (!tabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url ?? '';
        const injectable = url.startsWith('http://') || url.startsWith('https://');
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
        // Capture runtime context snapshot at save time (best-effort)
        let context: Issue['context'] | undefined;
        if (tabId) {
          try {
            const [netResp, conResp] = await Promise.allSettled([
              chrome.tabs.sendMessage(tabId, { type: 'API_GET_NETWORK_LOG', payload: {} }),
              chrome.tabs.sendMessage(tabId, { type: 'API_GET_CONSOLE_LOG', payload: {} }),
            ]);
            const errResult = await chrome.storage.local.get('capturedErrors');
            const networkLog = netResp.status === 'fulfilled' ? (netResp.value?.log ?? []).slice(-20) : undefined;
            const consoleLog = conResp.status === 'fulfilled' ? (conResp.value?.log ?? []).slice(-30) : undefined;
            const capturedErrors = (errResult.capturedErrors as CapturedError[]) || undefined;
            if (networkLog?.length || consoleLog?.length || capturedErrors?.length) {
              context = { networkLog, consoleLog, capturedErrors };
            }
          } catch { /* context capture is best-effort */ }
        }
        const issue = await saveIssue({
          type: (payload.type as Issue['type']) || 'bug',
          title: (payload.title as string) || 'Untitled Issue',
          notes: (payload.notes as string) || '',
          severity: (payload.severity as Issue['severity']) || 'medium',
          selector: (payload.selector as string) || undefined,
          pageUrl: tab?.url || '',
          screenshot: screenshot ?? undefined,
          context,
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
        const gr = await chrome.storage.local.get(['currentSession', 'pendingGuideEdits']);
        const session = (gr.currentSession as Action[]) || [];
        const stored = (gr.pendingGuideEdits as Partial<GuideEdits>) || {};
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
          };
        }
        const html = generateGuideHTML(session, edits);
        // Clear pending edits after use
        chrome.storage.local.remove('pendingGuideEdits');
        wsSend(id, true, { html });
        break;
      }

      case 'API_GENERATE_REPORT': {
        const issues = await getIssues();
        const html = generateIssueReportHTML(issues);
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
              screenshot: screenshot ?? undefined,
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
        const sr = await chrome.storage.local.get(['currentSession', 'savedSessions']);
        const session = (sr.currentSession as Action[]) || [];
        const savedSessions = (sr.savedSessions as Record<string, { actions: Action[]; savedAt: number }>) || {};
        savedSessions[name] = { actions: session, savedAt: Date.now() };
        await chrome.storage.local.set({ savedSessions });
        wsSend(id, true, { name, actionCount: session.length });
        break;
      }

      case 'API_LOAD_SESSION': {
        const name = payload.name as string;
        if (!name) { wsSend(id, false, undefined, 'Missing name'); break; }
        const lr = await chrome.storage.local.get('savedSessions');
        const ss = (lr.savedSessions as Record<string, { actions: Action[]; savedAt: number }>) || {};
        const saved = ss[name];
        if (!saved) { wsSend(id, false, undefined, `Session not found: ${name}`); break; }
        await chrome.storage.local.set({ currentSession: saved.actions });
        wsSend(id, true, { name, actionCount: saved.actions.length, savedAt: saved.savedAt });
        break;
      }

      case 'API_LIST_SESSIONS': {
        const lsr = await chrome.storage.local.get('savedSessions');
        const allSessions = (lsr.savedSessions as Record<string, { actions: Action[]; savedAt: number }>) || {};
        const sessions = Object.entries(allSessions).map(([n, s]) => ({ name: n, actionCount: s.actions.length, savedAt: s.savedAt }));
        wsSend(id, true, { sessions });
        break;
      }

      case 'API_RUN_SAVED_SESSION': {
        const name = payload.name as string;
        const speed = (payload.speed as number) || 1;
        if (!name) { wsSend(id, false, undefined, 'Missing name'); break; }
        const rsr = await chrome.storage.local.get('savedSessions');
        const rss = (rsr.savedSessions as Record<string, { actions: Action[]; savedAt: number }>) || {};
        const rsaved = rss[name];
        if (!rsaved) { wsSend(id, false, undefined, `Session not found: ${name}`); break; }
        await chrome.storage.local.set({ currentSession: rsaved.actions });
        const rTabId = await getActiveTabId();
        if (!rTabId) { wsSend(id, false, undefined, 'No active tab'); break; }
        sendToTab(rTabId, 'START_PLAYBACK', { session: rsaved.actions, assertions: [], speed, stepByStep: false });
        wsSend(id, true, { name, actionCount: rsaved.actions.length, status: 'playing' });
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
        const analysis = analyzeIssues(issues);
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
    case 'INSTALL_LOCAL_MCP':
    case 'REMOVE_LOCAL_MCP':
    case 'FORCE_RESTART_MCP': {
      const cmd = type === 'LAUNCH_MCP_SERVER'  ? 'start'
                : type === 'STOP_MCP_SERVER'    ? 'stop'
                : type === 'REMOVE_MCP_LAUNCHER'? 'uninstall'
                : type === 'INSTALL_LOCAL_MCP'  ? 'install_local'
                : type === 'REMOVE_LOCAL_MCP'   ? 'remove_local'
                : type === 'FORCE_RESTART_MCP'  ? 'force_restart'
                :                                 'status';
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

