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

// ── Guide Analysis ──

export interface GuideStep {
  index: number;
  type: string;
  description: string;
  selector: string;
  value?: string;
  url?: string;
  hasScreenshot: boolean;
  timestamp: number;
}

export interface GuidePageGroup {
  pageUrl: string;
  stepIndices: number[];
  firstStepIndex: number;
}

export interface GuideChapter {
  title: string;
  pageUrl: string;
  stepIndices: number[];
  suggestedAfterStep: number;
}

export interface GuideAnalysis {
  totalSteps: number;
  stepsWithScreenshots: number[];
  stepsWithoutScreenshots: number[];
  actionTypeCounts: Record<string, number>;
  uniqueUrls: string[];
  byPage: GuidePageGroup[];
  chapters: GuideChapter[];
  durationMs: number;
  hasMultiPageFlow: boolean;
  recommendedTitle: string;
  suggestedIntro: string;
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

export type GuideSectionType = 'note' | 'warning' | 'tip' | 'heading' | 'html';

export interface GuideSection {
  type: GuideSectionType;
  content: string;
  afterStep: number; // -1 = before all steps, 0 = after step 0, N = after step N
}

export interface GuideEdits {
  guideTitle: string;
  introText: string;
  conclusionText: string;
  steps: GuideStepEdit[];
  sections?: GuideSection[];
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
  | 'REMOVE_LOCAL_MCP'
  | 'FORCE_RESTART_MCP'
  | 'PING'
  // ── API (MCP WebSocket bridge) ──
  | 'API_ATTACH'
  | 'API_NAVIGATE'
  | 'API_SCREENSHOT'
  | 'API_GET_SESSION'
  | 'API_GET_ERRORS'
  | 'API_GET_ISSUES'
  | 'API_INJECT_ACTION'
  | 'API_GENERATE_GUIDE'
  | 'API_GENERATE_REPORT'
  | 'API_GENERATE_CUSTOM_GUIDE'
  | 'API_GENERATE_CUSTOM_REPORT'
  | 'API_ANALYZE_ISSUES'
  | 'API_GET_ISSUES_WITH_SCREENSHOTS'
  | 'API_UPDATE_ISSUE'
  | 'API_ANALYZE_SESSION'
  | 'API_GET_SESSION_WITH_SCREENSHOTS'
  | 'API_SET_STEP_DESCRIPTION'
  | 'API_GET_STATUS'
  | 'API_WAIT_FOR_ELEMENT'
  | 'API_EVALUATE_SELECTOR'
  // ── Extended AI Tools ──
  | 'API_GET_PAGE_SNAPSHOT'
  | 'API_FIND_ELEMENT'
  | 'API_GET_TEXT_CONTENT'
  | 'API_GET_ELEMENT_STATE'
  | 'API_HOVER'
  | 'API_SELECT_OPTION'
  | 'API_KEY_SEQUENCE'
  | 'API_DRAG'
  | 'API_WAIT_FOR_TEXT'
  | 'API_GET_NETWORK_LOG'
  | 'API_WAIT_FOR_NETWORK_IDLE'
  | 'API_GET_CONSOLE_LOG'
  | 'API_SET_GUIDE_EDITS'
  | 'API_SAVE_SESSION'
  | 'API_LOAD_SESSION'
  | 'API_LIST_SESSIONS'
  | 'API_RUN_SAVED_SESSION';

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

// Capture-time context snapshot attached to each saved issue
export interface NetworkEntry {
  url: string;
  method: string;
  status: number | null;
  error?: string;
  durationMs?: number;
  timestamp: number;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
}

export interface IssueContext {
  networkLog?: NetworkEntry[];
  consoleLog?: ConsoleEntry[];
  capturedErrors?: CapturedError[];
}

// Pre-computed analysis object returned by API_ANALYZE_ISSUES
export interface PageGroup {
  pageUrl: string;
  issueIds: string[];
  criticalCount: number;
  highCount: number;
}

export interface SeverityGroup {
  severity: IssueSeverity;
  issueIds: string[];
  count: number;
}

export interface IssuePattern {
  pattern: string;
  issueIds: string[];
  type: 'same-page' | 'same-error-source' | 'same-selector' | 'error-cluster';
}

export interface IssueAnalysis {
  totalCount: number;
  bugCount: number;
  featureCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  issuesWithScreenshots: string[];
  issuesWithErrors: string[];
  byPage: PageGroup[];
  bySeverity: SeverityGroup[];
  patterns: IssuePattern[];
  recommendedTitle: string;
  executiveSummary: string;
}

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
  context?: IssueContext;
  createdAt: number;
}
