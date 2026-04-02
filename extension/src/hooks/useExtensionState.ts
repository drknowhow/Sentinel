import { useState, useEffect, useRef } from 'react';
import type { Action, PlaybackState, CapturedError, Issue, GuideEdits, Project, UserNote } from '../types';

export interface ExtensionState {
  isRecording: boolean;
  currentSession: Action[];
  playback: PlaybackState | null;
  isErrorTracking: boolean;
  capturedErrors: CapturedError[];
  issues: Issue[];
  activeSessionId: string | null;
  currentGuideEdits: GuideEdits | null;
  projects: Project[];
  activeProjectId: string | null;
  userNotes: UserNote[];
  draftNote: UserNote | null;
}

const DEFAULT_STATE: ExtensionState = {
  isRecording: false,
  currentSession: [],
  playback: null,
  isErrorTracking: false,
  capturedErrors: [],
  issues: [],
  activeSessionId: null,
  currentGuideEdits: null,
  projects: [],
  activeProjectId: null,
  userNotes: [],
  draftNote: null,
};

const KEYS = [
  'isRecording', 'currentSession', 'playbackState',
  'isErrorTracking', 'capturedErrors', 'sentinel_issues',
  'sentinel_active_session_id', 'currentGuideEdits',
  'sentinel_projects', 'sentinel_active_project', 'sentinel_user_notes',
  'sentinel_draft_note',
] as const;

export function useExtensionState(): ExtensionState {
  const [state, setState] = useState<ExtensionState>(DEFAULT_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    chrome.storage.local.get([...KEYS], (result) => {
      if (!mountedRef.current) return;
      setState({
        isRecording: (result.isRecording as boolean) ?? false,
        currentSession: (result.currentSession as Action[] | undefined) ?? [],
        playback: (result.playbackState as PlaybackState | undefined) ?? null,
        isErrorTracking: (result.isErrorTracking as boolean) ?? false,
        capturedErrors: (result.capturedErrors as CapturedError[] | undefined) ?? [],
        issues: (result.sentinel_issues as Issue[] | undefined) ?? [],
        activeSessionId: (result.sentinel_active_session_id as string | undefined) ?? null,
        currentGuideEdits: (result.currentGuideEdits as GuideEdits | undefined) ?? null,
        projects: (result.sentinel_projects as Project[] | undefined) ?? [],
        activeProjectId: (result.sentinel_active_project as string | undefined) ?? null,
        userNotes: (result.sentinel_user_notes as UserNote[] | undefined) ?? [],
        draftNote: (result.sentinel_draft_note as UserNote | undefined) ?? null,
      });
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local' || !mountedRef.current) return;
      setState(prev => {
        const next = { ...prev };
        if (changes.isRecording) next.isRecording = (changes.isRecording.newValue as boolean) ?? false;
        if (changes.currentSession) next.currentSession = (changes.currentSession.newValue as Action[] | undefined) ?? [];
        if (changes.playbackState) next.playback = (changes.playbackState.newValue as PlaybackState | undefined) ?? null;
        if (changes.isErrorTracking) next.isErrorTracking = (changes.isErrorTracking.newValue as boolean) ?? false;
        if (changes.capturedErrors) next.capturedErrors = (changes.capturedErrors.newValue as CapturedError[] | undefined) ?? [];
        if (changes.sentinel_issues) next.issues = (changes.sentinel_issues.newValue as Issue[] | undefined) ?? [];
        if (changes.sentinel_active_session_id) next.activeSessionId = (changes.sentinel_active_session_id.newValue as string | undefined) ?? null;
        if (changes.currentGuideEdits) next.currentGuideEdits = (changes.currentGuideEdits.newValue as GuideEdits | undefined) ?? null;
        if (changes.sentinel_projects) next.projects = (changes.sentinel_projects.newValue as Project[] | undefined) ?? [];
        if (changes.sentinel_active_project) next.activeProjectId = (changes.sentinel_active_project.newValue as string | undefined) ?? null;
        if (changes.sentinel_user_notes) next.userNotes = (changes.sentinel_user_notes.newValue as UserNote[] | undefined) ?? [];
        if (changes.sentinel_draft_note) next.draftNote = (changes.sentinel_draft_note.newValue as UserNote | undefined) ?? null;
        return next;
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => { mountedRef.current = false; chrome.storage.onChanged.removeListener(listener); };
  }, []);

  return state;
}
