import { useEffect, useMemo, useRef, useState } from 'react';
import { sendMessage } from '../lib/messages';
import type { Action, Issue, IssueAnalysis } from '../types';
import { analyzeIssues } from '../lib/storage';

interface IssueListProps {
  issues: Issue[];
  activeTabUrl: string | null;
}

type Filter = 'all' | 'bug' | 'feature-request';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

function stripScreenshots(issues: Issue[]): Issue[] {
  return issues.map(issue => ({ ...issue, screenshot: undefined }));
}

export default function IssueList({ issues, activeTabUrl }: IssueListProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [currentPageOnly, setCurrentPageOnly] = useState(true);
  const [analysis, setAnalysis] = useState<IssueAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = issues;
    if (currentPageOnly && activeTabUrl) {
      try {
        const currentHost = new URL(activeTabUrl).hostname;
        list = list.filter(issue => {
          try {
            const issueHost = new URL(issue.pageUrl).hostname;
            return issueHost === currentHost;
          } catch { 
            // Fallback: If issue pageUrl is invalid, only show if not in current page mode or no hostname to match
            return false; 
          }
        });
      } catch { /* ignore invalid urls */ }
    } else if (currentPageOnly && !activeTabUrl) {
      // If no active URL but filter is on, show everything rather than nothing
      list = issues;
    }
    if (filter !== 'all') {
      list = list.filter(issue => issue.type === filter);
    }
    return list;
  }, [issues, filter, currentPageOnly, activeTabUrl]);

  const clusters = useMemo(() => analysis?.clusters || [], [analysis]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  const refreshAnalysis = async () => {
    const result = await chrome.storage.local.get('currentSession');
    const currentSession = (result.currentSession as Action[] | undefined) ?? [];
    setAnalysis(analyzeIssues(issues, currentSession));
  };

  const handleDelete = (id: string) => {
    sendMessage('DELETE_ISSUE', { id });
    refreshTimerRef.current = setTimeout(() => refreshAnalysis(), 200);
  };

  const handleExportHtml = async () => {
    await refreshAnalysis();
    sendMessage('EXPORT_ISSUES');
  };

  const handleExportJson = () => {
    const data = stripScreenshots(issues);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-issues-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string) as Issue[];
        if (!Array.isArray(imported)) return;
        for (const issue of imported) {
          sendMessage('SAVE_ISSUE', {
            type: issue.type,
            title: issue.title,
            notes: issue.notes,
            selector: issue.selector,
            pageUrl: issue.pageUrl,
            severity: issue.severity,
            capturedError: issue.capturedError,
          });
        }
        refreshTimerRef.current = setTimeout(() => refreshAnalysis(), 250);
      } catch {
        // Ignore invalid JSON imports.
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="flex gap-1.5 items-center flex-wrap">
          <button
            onClick={() => setCurrentPageOnly(!currentPageOnly)}
            className={`px-2 py-1 text-xs rounded border transition-all ${currentPageOnly 
              ? 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold' 
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
          >
            {currentPageOnly ? 'Current Page' : 'All Pages'}
          </button>
          <div className="h-4 w-[1px] bg-gray-200 mx-0.5" />
          {(['all', 'bug', 'feature-request'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-xs rounded ${filter === f
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {f === 'all' ? `All (${issues.length})` : f === 'bug' ? 'Bugs' : 'Features'}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className={`px-2 py-1 text-xs rounded ${showAnalysis ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            Analytics
          </button>
        </div>

        {showAnalysis && analysis && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-gray-50 rounded px-2 py-1.5">
              <div className="text-gray-400">Duplicates</div>
              <div className="font-semibold text-gray-700">{analysis.duplicateCount}</div>
            </div>
            <div className="bg-gray-50 rounded px-2 py-1.5">
              <div className="text-gray-400">Pages impacted</div>
              <div className="font-semibold text-gray-700">{analysis.byPage.length}</div>
            </div>
            <div className="bg-gray-50 rounded px-2 py-1.5">
              <div className="text-gray-400">With screenshots</div>
              <div className="font-semibold text-gray-700">{analysis.issuesWithScreenshots.length}</div>
            </div>
          </div>
        )}

        {showAnalysis && clusters.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Clusters</div>
            {clusters.slice(0, 4).map(cluster => (
              <div key={cluster.id} className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                <div className="font-medium">{cluster.title}</div>
                <div>{cluster.issueIds.length} related issues</div>
              </div>
            ))}
          </div>
        )}

        {issues.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={handleExportHtml}
              className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200"
              title="Export as HTML report"
            >
              HTML Report
            </button>
            <button
              onClick={handleExportJson}
              className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
              title="Export as JSON (no images)"
            >
              JSON Export
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="Import issues from JSON"
            >
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJson}
            />
          </div>
        )}
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-10 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 font-medium">No issues yet</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Start recording with +BUG to auto-capture issues</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 px-3 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            Import from JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportJson}
          />
        </div>
      ) : (
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3 pt-1">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <p className="text-xs text-gray-500 font-medium">No issues match current filters</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {currentPageOnly ? 'Try switching to "All Pages"' : 'Try changing the type filter'}
              </p>
            </div>
          )}
          {filtered.map(issue => (
            <div key={issue.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col group transition-shadow hover:shadow-md">
              <div className="px-3 py-2 bg-gray-50 flex items-start gap-2 border-b border-gray-100">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_COLORS[issue.severity]}`} />
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border mt-0.5 ${issue.type === 'bug'
                    ? 'bg-red-50 text-red-600 border-red-100'
                    : 'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>
                  {issue.type === 'bug' ? 'BUG' : 'FEATURE'}
                </span>
                <span className="flex-1 font-semibold text-gray-800 text-[11px] leading-snug break-words mt-0.5">
                  {issue.title}
                </span>

                {issue.capturedError?.count && issue.capturedError.count > 1 ? (
                  <span className="flex-shrink-0 mt-0.5 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-200" title={`${issue.capturedError.count} occurrences`}>
                    &times;{issue.capturedError.count}
                  </span>
                ) : null}

                <button
                  onClick={e => { e.preventDefault(); handleDelete(issue.id); }}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 w-6 h-6 flex items-center justify-center rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 -mr-1"
                  title="Delete"
                >
                  &#10005;
                </button>
              </div>

              <div className="p-3 text-[11px] space-y-2.5">
                <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                  <span className="text-gray-400 text-[9px] uppercase font-bold tracking-wider">{issue.severity} Severity</span>
                  <span className="text-gray-400 text-[10px] font-medium">{new Date(issue.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>

                <p className="text-gray-500 truncate" title={issue.pageUrl}>
                  <strong className="text-gray-700 font-semibold mr-1">Page:</strong>{issue.pageUrl.replace(/^https?:\/\//, '')}
                </p>

                {issue.selector && (
                  <p className="font-mono bg-gray-50 p-1.5 rounded text-gray-500 truncate border border-gray-100" title={issue.selector}>
                    <strong className="text-gray-700 font-sans font-semibold mr-1">Element:</strong>{issue.selector}
                  </p>
                )}

                {issue.notes && (
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed bg-amber-50/40 p-2.5 rounded border border-amber-100/50">{issue.notes}</p>
                )}

                {issue.correlatedStepIndices?.length ? (
                  <p className="text-purple-700 bg-purple-50/50 border border-purple-100/50 px-2 py-1.5 rounded inline-flex items-center gap-1.5 font-medium">
                    <svg className="w-3 h-3 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Related steps: {issue.correlatedStepIndices.map(index => `#${index + 1}`).join(', ')}
                  </p>
                ) : null}

                {issue.capturedError && (
                  <div className="bg-red-50/30 rounded p-2.5 border border-red-100/50">
                    <p className="text-red-700 font-mono text-[10px] font-semibold break-all">{issue.capturedError.message}</p>
                    {issue.capturedError.stack && (
                      <pre className="text-[9px] text-gray-500 mt-2 max-h-24 overflow-auto whitespace-pre-wrap font-mono leading-relaxed pl-2.5 border-l-2 border-red-200">
                        {issue.capturedError.stack.split('\n').slice(0, 4).join('\n')}{issue.capturedError.stack.split('\n').length > 4 ? '\n...' : ''}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
