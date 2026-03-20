import { useState, useCallback, useMemo } from 'react';
import type { Action, GuideEdits, GuideStepEdit } from '../types';

function initEdits(actions: Action[], existing?: GuideEdits): GuideEdits {
  if (existing && existing.steps.length > 0) return existing;
  return {
    guideTitle: 'Sentinel Visual Guide',
    introText: '',
    conclusionText: '',
    exportOptions: {
      profile: 'internal',
      redactSelectors: false,
      redactValues: false,
      redactUrls: false,
      includeDiagnostics: true,
    },
    steps: actions.map((action, i) => ({
      originalIndex: i,
      title: action.description || action.type.toUpperCase(),
      notes: '',
      includeScreenshot: true,
      included: true,
    })),
  };
}

export function useGuideEditor(actions: Action[], existing?: GuideEdits) {
  const [edits, setEdits] = useState<GuideEdits>(() => initEdits(actions, existing));

  const updateStep = useCallback((index: number, updates: Partial<GuideStepEdit>) => {
    setEdits(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? { ...s, ...updates } : s),
    }));
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setEdits(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.steps.length) return prev;
      const steps = [...prev.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  }, []);

  const deleteStep = useCallback((index: number) => {
    setEdits(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  }, []);

  const setGuideTitle = useCallback((guideTitle: string) => {
    setEdits(prev => ({ ...prev, guideTitle }));
  }, []);

  const setIntroText = useCallback((introText: string) => {
    setEdits(prev => ({ ...prev, introText }));
  }, []);

  const setConclusionText = useCallback((conclusionText: string) => {
    setEdits(prev => ({ ...prev, conclusionText }));
  }, []);

  const includedCount = useMemo(
    () => edits.steps.filter(s => s.included).length,
    [edits.steps]
  );

  return {
    edits,
    setEdits,
    updateStep,
    moveStep,
    deleteStep,
    setGuideTitle,
    setIntroText,
    setConclusionText,
    includedCount,
  };
}
