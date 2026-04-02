// Core action and selector metadata

export type SelectorStrategy =
  | 'id'
  | 'data-testid'
  | 'aria-label'
  | 'name'
  | 'role-text'
  | 'text'
  | 'path'
  | 'tag';

export interface SelectorCandidate {
  selector: string;
  strategy: SelectorStrategy;
  score: number;
}

export interface TargetSnapshot {
  tag: string;
  role?: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  type?: string;
  className?: string;
}

export interface Action {
  type: string;
  selector: string;
  value?: string;
  timestamp: number;
  screenshot?: string;
  url?: string;
  description?: string;
  selectorCandidates?: SelectorCandidate[];
  selectorConfidence?: number;
  targetSnapshot?: TargetSnapshot;
}

// Guide analysis

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
  averageSelectorConfidence: number;
  resilientSelectorCoverage: number;
}

// Export configuration

export type ExportProfile = 'internal' | 'client';

export interface ExportOptions {
  profile: ExportProfile;
  redactSelectors: boolean;
  redactValues: boolean;
  redactUrls: boolean;
  includeDiagnostics: boolean;
}

// Playback / run metrics

export type PlaybackResolution = 'primary' | 'candidate' | 'heuristic' | 'failed';

export interface PlaybackStepMetric {
  index: number;
  selector: string;
  resolvedSelector?: string;
  resolution: PlaybackResolution;
  selectorConfidence?: number;
  attempts: number;
  durationMs: number;
  warning?: string;
  url?: string;
}

export interface PlaybackRunSummary {
  startedAt: number;
  completedAt: number;
  totalSteps: number;
  completedSteps: number;
  recoveredSteps: number;
  failedSteps: number;
  averageConfidence: number;
  assertionPassCount: number;
  assertionFailCount: number;
  flaky: boolean;
  stepMetrics: PlaybackStepMetric[];
}

export interface VideoClip {
  id: string;
  url: string;
  durationSec: number;
  createdAt: number;
  projectId?: string;
}

// Session management

export type SessionKind = 'recording' | 'suite';

export interface SessionRunStats {
  runCount: number;
  passCount: number;
  failCount: number;
  flakyScore: number;
  lastRunAt?: number;
  lastRunSummary?: PlaybackRunSummary;
}

export interface Session {
  id: string;
  name: string;
  actions: Action[];
  assertions: Assertion[];
  guideEdits?: GuideEdits;
  kind?: SessionKind;
  tags?: string[];
  exportOptions?: ExportOptions;
  runStats?: SessionRunStats;
  createdAt: number;
  updatedAt: number;
}

// Guide editor

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
  afterStep: number;
}

export interface GuideEdits {
  guideTitle: string;
  introText: string;
  conclusionText: string;
  steps: GuideStepEdit[];
  sections?: GuideSection[];
  exportOptions?: ExportOptions;
}

// Message bus

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
  | 'WS_GET_STATUS'
  | 'WS_RECONNECT'
  | 'LAUNCH_MCP_SERVER'
  | 'STOP_MCP_SERVER'
  | 'MCP_LAUNCHER_STATUS'
  | 'REMOVE_MCP_LAUNCHER'
  | 'INSTALL_LOCAL_MCP'
  | 'REMOVE_LOCAL_MCP'
  | 'FORCE_RESTART_MCP'
  | 'ATTACH_TAB'
  | 'PING'
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
  | 'API_RUN_SAVED_SESSION'
  | 'GET_SELECTION';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// Playback

export interface PlaybackConfig {
  speed: number;
  stepByStep: boolean;
  sessionId?: string | null;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  stepByStep: boolean;
  runId?: string;
}

// Assertions

export type AssertionType =
  | 'visible'
  | 'hidden'
  | 'text-contains'
  | 'text-equals'
  | 'has-class'
  | 'exists'
  | 'value-equals'
  | 'attribute-equals'
  | 'url-contains'
  | 'url-equals'
  | 'checked'
  | 'unchecked'
  | 'network-idle';

export interface Assertion {
  id: string;
  selector: string;
  type: AssertionType;
  expected?: string;
  attributeName?: string;
  afterStep: number;
  retryMs?: number;
  retryIntervalMs?: number;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual?: string;
  error?: string;
  attempts?: number;
  durationMs?: number;
}

// AI activity log

export interface AiLogEntry {
  id: string;
  timestamp: number;
  command: string;
  label: string;
  detail?: string;
  status: 'success' | 'error';
  durationMs: number;
  error?: string;
}

// Issue tracking

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueType = 'bug' | 'feature-request';

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
  type: 'same-page' | 'same-error-source' | 'same-selector' | 'error-cluster' | 'duplicate-cluster';
}

export interface IssueCluster {
  id: string;
  title: string;
  issueIds: string[];
  fingerprint: string;
  severity: IssueSeverity;
  reason: string;
}

export interface IssueStepCorrelation {
  issueId: string;
  stepIndices: number[];
}

export interface IssueAnalysis {
  totalCount: number;
  bugCount: number;
  featureCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  duplicateCount: number;
  issuesWithScreenshots: string[];
  issuesWithErrors: string[];
  byPage: PageGroup[];
  bySeverity: SeverityGroup[];
  patterns: IssuePattern[];
  clusters: IssueCluster[];
  correlatedSteps: IssueStepCorrelation[];
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
  count?: number;
}

export interface Issue {
  id: string;
  type: IssueType;
  title: string;
  notes: string;
  projectId?: string;
  selector?: string;
  pageUrl: string;
  screenshot?: string;
  severity: IssueSeverity;
  capturedError?: CapturedError;
  context?: IssueContext;
  correlatedStepIndices?: number[];
  fingerprint?: string;
  createdAt: number;
}

// Project management

export interface Project {
  id: string;
  name: string;
  description?: string;
  path: string;
  devUrl: string;
  repositoryUrl?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: {
    notesCount?: number;
    issuesCount?: number;
    sessionsCount?: number;
  };
}

// User Notes

export interface NoteAttachment {
  type: 'screenshot' | 'video' | 'bug' | 'session' | 'quote';
  id: string;
  previewUrl?: string;
  title?: string;
}

export interface UserNote {
  id: string;
  projectId: string;
  title: string;
  content: string;
  tags: string[];
  attachments: NoteAttachment[];
  createdAt: number;
  updatedAt: number;
}
