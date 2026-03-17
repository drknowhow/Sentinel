import { useState, useEffect } from 'react';
import type { Action, PlaybackState, CapturedError, Issue, GuideEdits } from '../types';

export interface ExtensionState {
  isRecording: boolean;
  currentSession: Action[];
  playback: PlaybackState | null;
  isErrorTracking: boolean;
  capturedErrors: CapturedError[];
  issues: Issue[];
  activeSessionId: string | null;
  currentGuideEdits: GuideEdits | null;
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
};

const KEYS = [
  'isRecording', 'currentSession', 'playbackState',
  'isErrorTracking', 'capturedErrors', 'sentinel_issues',
  'sentinel_active_session_id', 'currentGuideEdits',
] as const;

export function useExtensionState(): ExtensionState {
  const [state, setState] = useState<ExtensionState>(DEFAULT_STATE);

  useEffect(() => {
    chrome.storage.local.get([...KEYS], (result) => {
      setState({
        isRecording: (result.isRecording as boolean) ?? false,
        currentSession: (result.currentSession as Action[] | undefined) ?? [],
        playback: (result.playbackState as PlaybackState | undefined) ?? null,
        isErrorTracking: (result.isErrorTracking as boolean) ?? false,
        capturedErrors: (result.capturedErrors as CapturedError[] | undefined) ?? [],
        issues: (result.sentinel_issues as Issue[] | undefined) ?? [],
        activeSessionId: (result.sentinel_active_session_id as string | undefined) ?? null,
        currentGuideEdits: (result.currentGuideEdits as GuideEdits | undefined) ?? null,
      });
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
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
        return next;
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return state;
}
