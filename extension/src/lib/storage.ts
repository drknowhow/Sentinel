import type { Action, Session, Issue, IssueSeverity, IssueType, IssueAnalysis, IssuePattern, PageGroup, SeverityGroup, GuideAnalysis, GuidePageGroup, GuideChapter } from '../types';

const SESSIONS_KEY = 'sentinel_sessions';
const ACTIVE_SESSION_KEY = 'sentinel_active_session_id';
const ISSUES_KEY = 'sentinel_issues';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Sessions ──

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
      sessions[idx] = { ...sessions[idx], ...session, updatedAt: now };
      await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
      return sessions[idx];
    }
  }

  const newSession: Session = {
    id: generateId(),
    name: session.name || `Session ${sessions.length + 1}`,
    actions: session.actions,
    assertions: session.assertions || [],
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

// ── Issues ──

export async function getIssues(): Promise<Issue[]> {
  const result = await chrome.storage.local.get(ISSUES_KEY);
  return (result[ISSUES_KEY] as Issue[]) || [];
}

export async function saveIssue(data: {
  type: IssueType;
  title: string;
  notes: string;
  selector?: string;
  pageUrl: string;
  screenshot?: string;
  severity: IssueSeverity;
  capturedError?: Issue['capturedError'];
  context?: Issue['context'];
}): Promise<Issue> {
  const issues = await getIssues();
  const issue: Issue = {
    id: generateId(),
    ...data,
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

export async function updateIssue(id: string, updates: Partial<Issue>): Promise<void> {
  const issues = await getIssues();
  const issue = issues.find(i => i.id === id);
  if (issue) {
    Object.assign(issue, updates);
    await chrome.storage.local.set({ [ISSUES_KEY]: issues });
  }
}

export function analyzeIssues(issues: Issue[]): IssueAnalysis {
  const bugs = issues.filter(i => i.type === 'bug');
  const features = issues.filter(i => i.type === 'feature-request');

  const bySeverityMap: Record<IssueSeverity, string[]> = {
    critical: [], high: [], medium: [], low: [],
  };
  for (const issue of issues) bySeverityMap[issue.severity].push(issue.id);

  // Group by page URL (strip query string for grouping key)
  const byPageMap = new Map<string, string[]>();
  for (const issue of issues) {
    const key = issue.pageUrl.split('?')[0] || issue.pageUrl;
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

  // Pattern detection
  const patterns: IssuePattern[] = [];

  for (const pg of byPage) {
    if (pg.issueIds.length >= 3) {
      let pathname = pg.pageUrl;
      try { pathname = new URL(pg.pageUrl).pathname; } catch { /* not a full URL */ }
      patterns.push({ pattern: `${pg.issueIds.length} issues on ${pathname}`, issueIds: pg.issueIds, type: 'same-page' });
    }
  }

  const bySource = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.capturedError) {
      const src = issue.capturedError.source;
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(issue.id);
    }
  }
  for (const [src, ids] of bySource.entries()) {
    if (ids.length >= 2) {
      patterns.push({ pattern: `${ids.length} issues from ${src}`, issueIds: ids, type: 'same-error-source' });
    }
  }

  const critN = bySeverityMap.critical.length;
  const highN = bySeverityMap.high.length;
  const titleParts: string[] = [];
  if (critN) titleParts.push(`${critN} Critical`);
  if (highN) titleParts.push(`${highN} High`);
  const recommendedTitle = `Issue Report${titleParts.length ? ` — ${titleParts.join(', ')}` : ''}`;

  const pageCount = byPage.length;
  const executiveSummary =
    `${issues.length} issue${issues.length !== 1 ? 's' : ''} captured across ${pageCount} page${pageCount !== 1 ? 's' : ''}. ` +
    (critN > 0 ? `${critN} require${critN === 1 ? 's' : ''} immediate attention. ` : '') +
    (bugs.length > 0 && features.length > 0
      ? `Mix of ${bugs.length} bug${bugs.length !== 1 ? 's' : ''} and ${features.length} feature request${features.length !== 1 ? 's' : ''}.`
      : bugs.length > 0 ? 'All issues are bugs.' : 'All issues are feature requests.');

  const bySeverity: SeverityGroup[] = (['critical', 'high', 'medium', 'low'] as IssueSeverity[]).map(s => ({
    severity: s,
    issueIds: bySeverityMap[s],
    count: bySeverityMap[s].length,
  }));

  return {
    totalCount: issues.length,
    bugCount: bugs.length,
    featureCount: features.length,
    criticalCount: critN,
    highCount: highN,
    mediumCount: bySeverityMap.medium.length,
    lowCount: bySeverityMap.low.length,
    issuesWithScreenshots,
    issuesWithErrors,
    byPage,
    bySeverity,
    patterns,
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
    };
  }

  const stepsWithScreenshots: number[] = [];
  const stepsWithoutScreenshots: number[] = [];
  const actionTypeCounts: Record<string, number> = {};
  const urlOrderSeen = new Set<string>();
  const urlOrder: string[] = [];
  const byPageMap = new Map<string, number[]>();

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];

    if (a.screenshot) stepsWithScreenshots.push(i);
    else stepsWithoutScreenshots.push(i);

    actionTypeCounts[a.type] = (actionTypeCounts[a.type] ?? 0) + 1;

    const pageKey = a.url ? a.url.split('?')[0] : '__unknown__';
    if (!byPageMap.has(pageKey)) {
      byPageMap.set(pageKey, []);
      if (a.url && !urlOrderSeen.has(pageKey)) {
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
      try { pathname = new URL(pg.pageUrl).pathname; } catch { /* keep raw */ }
      const label = pathname === '/' ? 'Home'
        : pathname.replace(/^\//, '').replace(/\//g, ' › ');
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
      recommendedTitle = `Guide — ${host}`;
    } catch { /* keep default */ }
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
  };
}
