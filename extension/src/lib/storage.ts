import type { Session, Issue, IssueSeverity, IssueType } from '../types';

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
