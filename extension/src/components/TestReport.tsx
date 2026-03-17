import { useState, useEffect } from 'react';
import type { AssertionResult } from '../types';

export default function TestReport() {
  const [results, setResults] = useState<AssertionResult[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === 'local' && changes.assertionResults) {
        const newResults = changes.assertionResults.newValue as AssertionResult[] | undefined;
        if (newResults && newResults.length > 0) {
          setResults(newResults);
          setVisible(true);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (!visible || results.length === 0) return null;

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const allPassed = failed === 0;

  return (
    <div className="border-t border-gray-200 px-4 py-3 space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Test Report</h3>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          &#10005;
        </button>
      </div>

      <div className={`text-sm font-bold ${allPassed ? 'text-green-600' : 'text-red-600'}`}>
        {passed}/{results.length} passed {allPassed ? '- All clear!' : `- ${failed} failed`}
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1">
        {results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
              r.passed ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <span className={r.passed ? 'text-green-600' : 'text-red-600'}>
              {r.passed ? 'PASS' : 'FAIL'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{r.assertion.type}</span>
              {r.assertion.expected && (
                <span className="text-gray-500"> expected: {r.assertion.expected}</span>
              )}
              {!r.passed && r.actual && (
                <p className="text-red-500 truncate">got: {r.actual}</p>
              )}
              {r.error && (
                <p className="text-red-500 truncate">{r.error}</p>
              )}
              <p className="text-gray-400 font-mono truncate">{r.assertion.selector}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
