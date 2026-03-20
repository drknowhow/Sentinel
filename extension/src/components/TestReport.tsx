import { useEffect, useState } from 'react';
import type { AssertionResult, PlaybackRunSummary } from '../types';

export default function TestReport({ inline }: { inline?: boolean } = {}) {
  const [results, setResults] = useState<AssertionResult[]>([]);
  const [summary, setSummary] = useState<PlaybackRunSummary | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['assertionResults', 'lastPlaybackSummary'], result => {
      setResults((result.assertionResults as AssertionResult[] | undefined) ?? []);
      setSummary((result.lastPlaybackSummary as PlaybackRunSummary | undefined) ?? null);
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local') return;
      if (changes.assertionResults) {
        const nextResults = (changes.assertionResults.newValue as AssertionResult[] | undefined) ?? [];
        setResults(nextResults);
        if (nextResults.length > 0) setVisible(true);
      }
      if (changes.lastPlaybackSummary) {
        setSummary((changes.lastPlaybackSummary.newValue as PlaybackRunSummary | undefined) ?? null);
        if (changes.lastPlaybackSummary.newValue) setVisible(true);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const hasData = visible && (results.length > 0 || !!summary);

  if (!inline && !hasData) return null;

  const passed = results.filter(result => result.passed).length;
  const failed = results.length - passed;
  const allPassed = failed === 0 && (summary?.failedSteps ?? 0) === 0;

  if (inline && !hasData) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-gray-400 font-medium">No test report yet</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Run a playback session to generate results</p>
      </div>
    );
  }

  return (
    <div className={`${inline ? '' : 'border-t border-gray-200'} px-4 py-3 space-y-2`}>
      {!inline && (
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-700">Test Report</h3>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            &#10005;
          </button>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <div className="text-gray-400">Recovered steps</div>
            <div className="font-semibold text-gray-700">{summary.recoveredSteps}</div>
          </div>
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <div className="text-gray-400">Failed steps</div>
            <div className={`font-semibold ${summary.failedSteps > 0 ? 'text-red-600' : 'text-gray-700'}`}>{summary.failedSteps}</div>
          </div>
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <div className="text-gray-400">Avg confidence</div>
            <div className="font-semibold text-gray-700">{Math.round(summary.averageConfidence * 100)}%</div>
          </div>
          <div className="bg-gray-50 rounded px-2 py-1.5">
            <div className="text-gray-400">Flaky</div>
            <div className={`font-semibold ${summary.flaky ? 'text-amber-600' : 'text-green-600'}`}>{summary.flaky ? 'Yes' : 'No'}</div>
          </div>
        </div>
      )}

      <div className={`text-sm font-bold ${allPassed ? 'text-green-600' : 'text-red-600'}`}>
        {passed}/{results.length} assertions passed
        {summary ? ` - ${summary.completedSteps}/${summary.totalSteps} steps completed` : ''}
      </div>

      {summary?.stepMetrics?.some(metric => metric.warning) && (
        <div className="max-h-28 overflow-y-auto space-y-1">
          {summary.stepMetrics.filter(metric => metric.warning).map(metric => (
            <div key={`${metric.index}-${metric.resolvedSelector || metric.selector}`} className="text-xs bg-amber-50 text-amber-700 rounded px-2 py-1.5">
              Step {metric.index + 1}: {metric.warning}
            </div>
          ))}
        </div>
      )}

      <div className="max-h-48 overflow-y-auto space-y-1">
        {results.map((result, index) => (
          <div
            key={index}
            className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
              result.passed ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <span className={result.passed ? 'text-green-600' : 'text-red-600'}>
              {result.passed ? 'PASS' : 'FAIL'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{result.assertion.type}</span>
              {result.assertion.attributeName && <span className="text-gray-500"> [{result.assertion.attributeName}]</span>}
              {result.assertion.expected && <span className="text-gray-500"> expected: {result.assertion.expected}</span>}
              {result.attempts ? <span className="text-gray-400"> - {result.attempts} attempt(s)</span> : null}
              {!result.passed && result.actual && <p className="text-red-500 truncate">got: {result.actual}</p>}
              {result.error && <p className="text-red-500 truncate">{result.error}</p>}
              {result.assertion.selector ? <p className="text-gray-400 font-mono truncate">{result.assertion.selector}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
