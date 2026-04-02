import type {
  Project,
  UserNote,
  Action,
  ExportOptions,
  GuideAnalysis,
  GuideChapter,
  GuidePageGroup,
  Issue,
  IssueAnalysis,
  IssueCluster,
  IssuePattern,
  IssueSeverity,
  IssueType,
  PageGroup,
  PlaybackRunSummary,
  Session,
  SessionRunStats,
  SeverityGroup,
} from '../types';

const SESSIONS_KEY = 'sentinel_sessions';
const ACTIVE_SESSION_KEY = 'sentinel_active_session_id';
const ISSUES_KEY = 'sentinel_issues';
const PROJECTS_KEY = 'sentinel_projects';
const ACTIVE_PROJECT_KEY = 'sentinel_active_project';
const USER_NOTES_KEY = 'sentinel_user_notes';

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  profile: 'internal',
  redactSelectors: false,
  redactValues: false,
  redactUrls: false,
  includeDiagnostics: true,
};

function generateId(): string {
  return crypto.randomUUID();
}

function normalizeText(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/#.-]/g, '')
    .trim();
}

function normalizePage(pageUrl: string): string {
  if (!pageUrl) return '';
  try {
    const url = new URL(pageUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return pageUrl.split('?')[0] || pageUrl;
  }
}

function severityRank(severity: IssueSeverity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity];
}

function pickClusterSeverity(issues: Issue[]): IssueSeverity {
  return [...issues].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]?.severity || 'low';
}

function buildIssueFingerprint(issue: Partial<Issue>): string {
  const page = normalizePage(issue.pageUrl || '');
  const selector = normalizeText(issue.selector);
  const error = normalizeText(issue.capturedError?.message);
  const title = normalizeText(issue.title);
  return [page, selector, error || title].filter(Boolean).join('|');
}

function buildRunStats(prev: SessionRunStats | undefined, summary: PlaybackRunSummary): SessionRunStats {
  const nextRunCount = (prev?.runCount || 0) + 1;
  const passed = summary.failedSteps === 0 && summary.assertionFailCount === 0;
  const passCount = (prev?.passCount || 0) + (passed ? 1 : 0);
  const failCount = (prev?.failCount || 0) + (passed ? 0 : 1);
  const prevFlaky = prev?.flakyScore || 0;
  const nextFlaky = Math.min(
    1,
    (prevFlaky * 0.65)
      + (summary.flaky ? 0.35 : 0)
      + (summary.recoveredSteps > 0 ? 0.1 : 0)
      + (summary.failedSteps > 0 ? 0.15 : 0),
  );

  return {
    runCount: nextRunCount,
    passCount,
    failCount,
    flakyScore: Number(nextFlaky.toFixed(3)),
    lastRunAt: summary.completedAt,
    lastRunSummary: summary,
  };
}

// Sessions

export async function getSessions(): Promise<Session[]> {
  const result = await chrome.storage.local.get(SESSIONS_KEY);
  return (result[SESSIONS_KEY] as Session[]) || [];
}

export async function getActiveSessionId(): Promise<string | null> {
  const result = await chrome.storage.local.get(ACTIVE_SESSION_KEY);
  return (result[ACTIVE_SESSION_KEY] as string) || null;
}

export async function setActiveSessionId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: id });
}

export async function getActiveSession(): Promise<Session | null> {
  const id = await getActiveSessionId();
  if (!id) return null;
  const sessions = await getSessions();
  return sessions.find(s => s.id === id) || null;
}

export async function saveSession(session: Partial<Session> & { actions: Session['actions'] }): Promise<Session> {
  const sessions = await getSessions();
  const now = Date.now();

  if (session.id) {
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
      const merged: Session = {
        ...sessions[idx],
        ...session,
        exportOptions: {
          ...DEFAULT_EXPORT_OPTIONS,
          ...(sessions[idx].exportOptions || {}),
          ...(session.exportOptions || {}),
        },
        updatedAt: now,
      };
      sessions[idx] = merged;
      await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
      return merged;
    }
  }

  const newSession: Session = {
    id: generateId(),
    name: session.name || `Session ${sessions.length + 1}`,
    actions: session.actions,
    assertions: session.assertions || [],
    guideEdits: session.guideEdits,
    kind: session.kind || 'recording',
    tags: session.tags || [],
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(session.exportOptions || {}) },
    runStats: session.runStats,
    createdAt: now,
    updatedAt: now,
  };
  sessions.push(newSession);
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
  return newSession;
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  const filtered = sessions.filter(s => s.id !== id);
  await chrome.storage.local.set({ [SESSIONS_KEY]: filtered });

  const activeId = await getActiveSessionId();
  if (activeId === id) {
    await setActiveSessionId(null);
  }
}

export async function renameSession(id: string, name: string): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === id);
  if (session) {
    session.name = name;
    session.updatedAt = Date.now();
    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
  }
}

export async function updateSessionRunStats(id: string, summary: PlaybackRunSummary): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.runStats = buildRunStats(session.runStats, summary);
  session.updatedAt = Date.now();
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

export async function updateSessionKind(id: string, kind: Session['kind']): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  session.kind = kind;
  session.updatedAt = Date.now();
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

// Issues

export async function getIssues(): Promise<Issue[]> {
  const result = await chrome.storage.local.get(ISSUES_KEY);
  return (result[ISSUES_KEY] as Issue[]) || [];
}

export async function saveIssue(data: {
  type: IssueType;
  title: string;
  notes: string;
  projectId?: string;
  selector?: string;
  pageUrl: string;
  screenshot?: string;
  severity: IssueSeverity;
  capturedError?: Issue['capturedError'];
  context?: Issue['context'];
  correlatedStepIndices?: number[];
}): Promise<Issue> {
  const issues = await getIssues();
  const activeProjectId = await getActiveProjectId();
  const issue: Issue = {
    id: generateId(),
    ...data,
    projectId: data.projectId || activeProjectId || undefined,
    fingerprint: buildIssueFingerprint(data),
    createdAt: Date.now(),
  };
  issues.push(issue);
  await chrome.storage.local.set({ [ISSUES_KEY]: issues });
  return issue;
}

export async function deleteIssue(id: string): Promise<void> {
  const issues = await getIssues();
  const filtered = issues.filter(i => i.id !== id);
  await chrome.storage.local.set({ [ISSUES_KEY]: filtered });
}

const ISSUE_UPDATABLE_FIELDS: (keyof Issue)[] = ['title', 'notes', 'severity', 'type', 'selector', 'pageUrl'];

export async function updateIssue(id: string, updates: Partial<Issue>): Promise<void> {
  const issues = await getIssues();
  const issue = issues.find(i => i.id === id);
  if (issue) {
    for (const key of ISSUE_UPDATABLE_FIELDS) {
      if (key in updates) {
        (issue as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
      }
    }
    issue.fingerprint = buildIssueFingerprint(issue);
    await chrome.storage.local.set({ [ISSUES_KEY]: issues });
  }
}

// Project management

export async function getProjects(): Promise<Project[]> {
  const r = await chrome.storage.local.get(PROJECTS_KEY);
  return (r[PROJECTS_KEY] as Project[]) || [];
}

export async function getActiveProjectId(): Promise<string | null> {
  const r = await chrome.storage.local.get(ACTIVE_PROJECT_KEY);
  return (r[ACTIVE_PROJECT_KEY] as string) || null;
}

export async function setActiveProjectId(id: string | null) {
  await chrome.storage.local.set({ [ACTIVE_PROJECT_KEY]: id });
}

export async function saveProject(project: Project) {
  const list = await getProjects();
  const idx = list.findIndex(p => p.id === project.id);
  const next = idx >= 0
    ? list.map(p => p.id === project.id ? project : p)
    : [...list, project];
  await chrome.storage.local.set({ [PROJECTS_KEY]: next });
}

export async function deleteProject(id: string) {
  const list = await getProjects();
  const next = list.filter(p => p.id !== id);
  await chrome.storage.local.set({ [PROJECTS_KEY]: next });
}

// User Notes

export async function getUserNotes(): Promise<UserNote[]> {
  const r = await chrome.storage.local.get(USER_NOTES_KEY);
  return (r[USER_NOTES_KEY] as UserNote[]) || [];
}

export async function saveUserNote(note: UserNote) {
  const list = await getUserNotes();
  const idx = list.findIndex(n => n.id === note.id);
  const next = idx >= 0
    ? list.map(n => n.id === note.id ? note : n)
    : [...list, note];
  await chrome.storage.local.set({ [USER_NOTES_KEY]: next });
}

export async function deleteUserNote(id: string) {
  const list = await getUserNotes();
  const next = list.filter(n => n.id !== id);
  await chrome.storage.local.set({ [USER_NOTES_KEY]: next });
}

export function analyzeIssues(issues: Issue[], actions: Action[] = []): IssueAnalysis {
  const bugs = issues.filter(i => i.type === 'bug');
  const features = issues.filter(i => i.type === 'feature-request');

  const bySeverityMap: Record<IssueSeverity, string[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const issue of issues) bySeverityMap[issue.severity].push(issue.id);

  const byPageMap = new Map<string, string[]>();
  for (const issue of issues) {
    const key = normalizePage(issue.pageUrl);
    if (!byPageMap.has(key)) byPageMap.set(key, []);
    byPageMap.get(key)!.push(issue.id);
  }

  const byPage: PageGroup[] = [...byPageMap.entries()]
    .map(([pageUrl, ids]) => ({
      pageUrl,
      issueIds: ids,
      criticalCount: ids.filter(id => issues.find(i => i.id === id)?.severity === 'critical').length,
      highCount: ids.filter(id => issues.find(i => i.id === id)?.severity === 'high').length,
    }))
    .sort((a, b) => b.issueIds.length - a.issueIds.length);

  const issuesWithScreenshots = issues.filter(i => Boolean(i.screenshot)).map(i => i.id);
  const issuesWithErrors = issues
    .filter(i => Boolean(i.capturedError) || (i.context?.capturedErrors?.length ?? 0) > 0)
    .map(i => i.id);

  const patterns: IssuePattern[] = [];

  for (const pg of byPage) {
    if (pg.issueIds.length >= 3) {
      let pathname = pg.pageUrl;
      try { pathname = new URL(pg.pageUrl).pathname; } catch { /* ignore */ }
      patterns.push({ pattern: `${pg.issueIds.length} issues on ${pathname || 'current page'}`, issueIds: pg.issueIds, type: 'same-page' });
    }
  }

  const bySource = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.capturedError?.source) continue;
    const src = issue.capturedError.source;
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src)!.push(issue.id);
  }
  for (const [src, ids] of bySource.entries()) {
    if (ids.length >= 2) patterns.push({ pattern: `${ids.length} issues from ${src}`, issueIds: ids, type: 'same-error-source' });
  }

  const bySelector = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.selector) continue;
    const key = normalizeText(issue.selector);
    if (!key) continue;
    if (!bySelector.has(key)) bySelector.set(key, []);
    bySelector.get(key)!.push(issue.id);
  }
  for (const [selectorKey, ids] of bySelector.entries()) {
    if (ids.length >= 2) patterns.push({ pattern: `${ids.length} issues tied to ${selectorKey}`, issueIds: ids, type: 'same-selector' });
  }

  const clusterMap = new Map<string, Issue[]>();
  for (const issue of issues) {
    const fingerprint = issue.fingerprint || buildIssueFingerprint(issue);
    if (!fingerprint) continue;
    if (!clusterMap.has(fingerprint)) clusterMap.set(fingerprint, []);
    clusterMap.get(fingerprint)!.push(issue);
  }

  const clusters: IssueCluster[] = [];
  for (const [fingerprint, items] of clusterMap.entries()) {
    if (items.length < 2) continue;
    const title = items[0].capturedError?.message || items[0].title || 'Issue cluster';
    const cluster: IssueCluster = {
      id: generateId(),
      title,
      issueIds: items.map(item => item.id),
      fingerprint,
      severity: pickClusterSeverity(items),
      reason: 'Shared page, selector, and normalized issue signature',
    };
    clusters.push(cluster);
    patterns.push({
      pattern: `${items.length} likely duplicates for ${normalizeText(title) || 'repeated issue'}`,
      issueIds: cluster.issueIds,
      type: 'duplicate-cluster',
    });
  }

  const correlatedSteps = issues.map(issue => {
    const normalizedPage = normalizePage(issue.pageUrl);
    const normalizedSelector = normalizeText(issue.selector);
    const stepIndices = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => {
        const pageMatch = !normalizedPage || normalizePage(action.url || '') === normalizedPage;
        const selectorMatch = normalizedSelector && normalizeText(action.selector) === normalizedSelector;
        const textMatch =
          Boolean(issue.title)
          && Boolean(action.description)
          && normalizeText(action.description).includes(normalizeText(issue.title).slice(0, 32));
        return pageMatch && (selectorMatch || textMatch);
      })
      .map(item => item.index)
      .slice(0, 5);
    return { issueId: issue.id, stepIndices };
  }).filter(item => item.stepIndices.length > 0);

  const duplicateCount = clusters.reduce((sum, cluster) => sum + Math.max(0, cluster.issueIds.length - 1), 0);
  const critN = bySeverityMap.critical.length;
  const highN = bySeverityMap.high.length;
  const titleParts: string[] = [];
  if (critN) titleParts.push(`${critN} Critical`);
  if (highN) titleParts.push(`${highN} High`);
  if (duplicateCount) titleParts.push(`${duplicateCount} Duplicate`);
  const recommendedTitle = `Issue Report${titleParts.length ? ` - ${titleParts.join(', ')}` : ''}`;

  const pageCount = byPage.length;
  const executiveSummary =
    `${issues.length} issue${issues.length !== 1 ? 's' : ''} captured across ${pageCount} page${pageCount !== 1 ? 's' : ''}. `
    + (critN > 0 ? `${critN} require${critN === 1 ? 's' : ''} immediate attention. ` : '')
    + (duplicateCount > 0 ? `${duplicateCount} appear to be duplicate reports. ` : '')
    + (bugs.length > 0 && features.length > 0
      ? `Mix of ${bugs.length} bug${bugs.length !== 1 ? 's' : ''} and ${features.length} feature request${features.length !== 1 ? 's' : ''}.`
      : bugs.length > 0 ? 'All issues are bugs.' : 'All issues are feature requests.');

  const bySeverity: SeverityGroup[] = (['critical', 'high', 'medium', 'low'] as IssueSeverity[]).map(severity => ({
    severity,
    issueIds: bySeverityMap[severity],
    count: bySeverityMap[severity].length,
  }));

  return {
    totalCount: issues.length,
    bugCount: bugs.length,
    featureCount: features.length,
    criticalCount: critN,
    highCount: highN,
    mediumCount: bySeverityMap.medium.length,
    lowCount: bySeverityMap.low.length,
    duplicateCount,
    issuesWithScreenshots,
    issuesWithErrors,
    byPage,
    bySeverity,
    patterns,
    clusters,
    correlatedSteps,
    recommendedTitle,
    executiveSummary,
  };
}

export function analyzeSession(actions: Action[]): GuideAnalysis {
  if (actions.length === 0) {
    return {
      totalSteps: 0,
      stepsWithScreenshots: [],
      stepsWithoutScreenshots: [],
      actionTypeCounts: {},
      uniqueUrls: [],
      byPage: [],
      chapters: [],
      durationMs: 0,
      hasMultiPageFlow: false,
      recommendedTitle: 'Sentinel Guide',
      suggestedIntro: 'No steps have been recorded yet.',
      averageSelectorConfidence: 0,
      resilientSelectorCoverage: 0,
    };
  }

  const stepsWithScreenshots: number[] = [];
  const stepsWithoutScreenshots: number[] = [];
  const actionTypeCounts: Record<string, number> = {};
  const urlOrderSeen = new Set<string>();
  const urlOrder: string[] = [];
  const byPageMap = new Map<string, number[]>();
  let selectorConfidenceTotal = 0;
  let resilientCount = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.screenshot) stepsWithScreenshots.push(i);
    else stepsWithoutScreenshots.push(i);

    actionTypeCounts[action.type] = (actionTypeCounts[action.type] ?? 0) + 1;
    selectorConfidenceTotal += action.selectorConfidence ?? 0;
    if ((action.selectorCandidates?.length ?? 0) > 1) resilientCount++;

    const pageKey = action.url ? normalizePage(action.url) : '__unknown__';
    if (!byPageMap.has(pageKey)) {
      byPageMap.set(pageKey, []);
      if (action.url && !urlOrderSeen.has(pageKey)) {
        urlOrderSeen.add(pageKey);
        urlOrder.push(pageKey);
      }
    }
    byPageMap.get(pageKey)!.push(i);
  }

  const byPage: GuidePageGroup[] = [...byPageMap.entries()]
    .map(([pageUrl, stepIndices]) => ({
      pageUrl: pageUrl === '__unknown__' ? '' : pageUrl,
      stepIndices,
      firstStepIndex: stepIndices[0],
    }))
    .sort((a, b) => a.firstStepIndex - b.firstStepIndex);

  const uniqueUrls = urlOrder;
  const hasMultiPageFlow = uniqueUrls.length > 1;

  const chapters: GuideChapter[] = [];
  if (hasMultiPageFlow) {
    for (const pg of byPage) {
      if (!pg.pageUrl) continue;
      let pathname = pg.pageUrl;
      try { pathname = new URL(pg.pageUrl).pathname; } catch { /* ignore */ }
      const label = pathname === '/'
        ? 'Home'
        : pathname.replace(/^\//, '').replace(/\//g, ' > ');
      const title = label.charAt(0).toUpperCase() + label.slice(1);
      const suggestedAfterStep = pg.firstStepIndex === 0 ? -1 : pg.firstStepIndex - 1;
      chapters.push({ title, pageUrl: pg.pageUrl, stepIndices: pg.stepIndices, suggestedAfterStep });
    }
  }

  const durationMs = actions.length > 1
    ? actions[actions.length - 1].timestamp - actions[0].timestamp
    : 0;

  let recommendedTitle = 'Sentinel Guide';
  if (uniqueUrls.length > 0) {
    try {
      const host = new URL(uniqueUrls[0]).hostname.replace(/^www\./, '');
      recommendedTitle = `Guide - ${host}`;
    } catch {
      // Keep default title.
    }
  }

  const stepWord = actions.length === 1 ? 'step' : 'steps';
  const pageCount = Math.max(uniqueUrls.length, 1);
  const pageWord = pageCount === 1 ? 'page' : 'pages';
  const suggestedIntro = `This guide walks through ${actions.length} ${stepWord} across ${pageCount} ${pageWord}.`;

  return {
    totalSteps: actions.length,
    stepsWithScreenshots,
    stepsWithoutScreenshots,
    actionTypeCounts,
    uniqueUrls,
    byPage,
    chapters,
    durationMs,
    hasMultiPageFlow,
    recommendedTitle,
    suggestedIntro,
    averageSelectorConfidence: Number((selectorConfidenceTotal / actions.length).toFixed(2)),
    resilientSelectorCoverage: Number((resilientCount / actions.length).toFixed(2)),
  };
}
