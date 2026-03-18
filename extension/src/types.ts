// ── Core Action Types ──

export interface Action {
  type: string;
  selector: string;
  value?: string;
  timestamp: number;
  screenshot?: string;
  url?: string;
  description?: string;
}

// ── Session Management ──

export interface Session {
  id: string;
  name: string;
  actions: Action[];
  assertions: Assertion[];
  guideEdits?: GuideEdits;
  createdAt: number;
  updatedAt: number;
}

// ── Guide Editor ──

export interface GuideStepEdit {
  originalIndex: number;
  title: string;
  notes: string;
  includeScreenshot: boolean;
  included: boolean;
}

export interface GuideEdits {
  guideTitle: string;
  introText: string;
  conclusionText: string;
  steps: GuideStepEdit[];
}

// ── Message Bus ──

export type MessageType =
  | 'TOGGLE_RECORDING'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'RECORD_ACTION'
  | 'START_PLAYBACK'
  | 'PAUSE_PLAYBACK'
  | 'RESUME_PLAYBACK'
  | 'STOP_PLAYBACK'
  | 'NEXT_STEP'
  | 'PLAYBACK_PROGRESS'
  | 'PLAYBACK_COMPLETE'
  | 'EXPORT_GUIDE'
  | 'START_INSPECTION'
  | 'STOP_INSPECTION'
  | 'ELEMENT_SELECTED'
  | 'EVALUATE_ASSERTION'
  | 'START_ERROR_TRACKING'
  | 'STOP_ERROR_TRACKING'
  | 'ERROR_CAPTURED'
  | 'SAVE_ISSUE'
  | 'DELETE_ISSUE'
  | 'EXPORT_ISSUES'
  | 'START_FEATURE_INSPECTION'
  | 'EXPORT_EDITED_GUIDE'
  | 'GET_TAB_CAPTURE_STREAM_ID'
  // ── MCP WebSocket bridge control ──
  | 'WS_GET_STATUS'
  | 'WS_RECONNECT'
  // ── MCP Launcher (native messaging) ──
  | 'LAUNCH_MCP_SERVER'
  | 'STOP_MCP_SERVER'
  | 'MCP_LAUNCHER_STATUS'
  | 'REMOVE_MCP_LAUNCHER'
  | 'INSTALL_LOCAL_MCP'
  | 'FORCE_RESTART_MCP'
  // ── API (MCP WebSocket bridge) ──
  | 'API_NAVIGATE'
  | 'API_SCREENSHOT'
  | 'API_GET_SESSION'
  | 'API_GET_ERRORS'
  | 'API_GET_ISSUES'
  | 'API_INJECT_ACTION'
  | 'API_GENERATE_GUIDE'
  | 'API_GENERATE_REPORT'
  | 'API_GET_STATUS'
  | 'API_WAIT_FOR_ELEMENT'
  | 'API_EVALUATE_SELECTOR';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// ── Playback ──

export interface PlaybackConfig {
  speed: number;
  stepByStep: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  stepByStep: boolean;
}

// ── Assertions ──

export type AssertionType =
  | 'visible'
  | 'hidden'
  | 'text-contains'
  | 'text-equals'
  | 'has-class'
  | 'exists';

export interface Assertion {
  id: string;
  selector: string;
  type: AssertionType;
  expected?: string;
  afterStep: number;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual?: string;
  error?: string;
}

// ── AI Activity Log ──

export interface AiLogEntry {
  id: string;
  timestamp: number;       // ms since epoch (start of command)
  command: string;         // raw API_* command name
  label: string;           // human-readable label
  detail?: string;         // key param (URL, selector, title…)
  status: 'success' | 'error';
  durationMs: number;
  error?: string;
}

// ── Issue Tracking ──

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueType = 'bug' | 'feature-request';

export type ErrorSource =
  | 'console-error'
  | 'unhandled-exception'
  | 'unhandled-rejection'
  | 'network-error'
  | 'csp-violation';

export interface CapturedError {
  source: ErrorSource;
  message: string;
  stack?: string;
  url?: string;
  statusCode?: number;
  timestamp: number;
}

export interface Issue {
  id: string;
  type: IssueType;
  title: string;
  notes: string;
  selector?: string;
  pageUrl: string;
  screenshot?: string;
  severity: IssueSeverity;
  capturedError?: CapturedError;
  createdAt: number;
}
