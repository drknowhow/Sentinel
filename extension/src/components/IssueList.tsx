import { useState, useRef } from 'react';
import { sendMessage } from '../lib/messages';
import type { Issue } from '../types';

interface IssueListProps {
  issues: Issue[];
}

type Filter = 'all' | 'bug' | 'feature-request';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

function stripScreenshots(issues: Issue[]): Issue[] {
  return issues.map(i => ({ ...i, screenshot: undefined }));
}

export default function IssueList({ issues }: IssueListProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = filter === 'all' ? issues : issues.filter(i => i.type === filter);

  const handleDelete = (id: string) => {
    sendMessage('DELETE_ISSUE', { id });
  };

  const handleExportHtml = () => {
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
        // Save each imported issue
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
      } catch {
        // Invalid JSON
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        <span>
          Issues
          {issues.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400">({issues.length})</span>
          )}
        </span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Filter row */}
          <div className="flex gap-1.5 items-center">
            {(['all', 'bug', 'feature-request'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-xs rounded ${
                  filter === f
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'bug' ? 'Bugs' : 'Features'}
              </button>
            ))}
          </div>

          {/* Export/Import row */}
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

          {/* Empty + import when no issues */}
          {issues.length === 0 && (
            <div className="text-center py-2 space-y-1.5">
              <p className="text-xs text-gray-400">No issues yet.</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          )}

          <div className="max-h-56 overflow-y-auto space-y-1">
            {filtered.map(issue => (
              <details key={issue.id} className="bg-gray-50 rounded">
                <summary className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-100">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_COLORS[issue.severity]}`} />
                  <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                    issue.type === 'bug'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-blue-100 text-blue-600'
                  }`}>
                    {issue.type === 'bug' ? 'BUG' : 'FEAT'}
                  </span>
                  <span className="flex-1 truncate text-gray-800">{issue.title}</span>
                  <button
                    onClick={e => { e.preventDefault(); handleDelete(issue.id); }}
                    className="text-gray-400 hover:text-red-500 px-1 flex-shrink-0"
                  >
                    &#10005;
                  </button>
                </summary>
                <div className="px-3 pb-2 text-xs space-y-1">
                  <p className="text-gray-500">
                    <strong>Page:</strong> {issue.pageUrl}
                  </p>
                  {issue.selector && (
                    <p className="font-mono text-gray-500 truncate">
                      <strong>Element:</strong> {issue.selector}
                    </p>
                  )}
                  {issue.notes && (
                    <p className="text-gray-700 whitespace-pre-wrap">{issue.notes}</p>
                  )}
                  {issue.capturedError && (
                    <div className="bg-red-50 rounded p-1.5 mt-1">
                      <p className="text-red-600 font-mono truncate">{issue.capturedError.message}</p>
                      {issue.capturedError.stack && (
                        <pre className="text-[10px] text-gray-500 mt-1 max-h-20 overflow-auto whitespace-pre-wrap">
                          {issue.capturedError.stack}
                        </pre>
                      )}
                    </div>
                  )}
                  <p className="text-gray-400">
                    {new Date(issue.createdAt).toLocaleString()} &middot; {issue.severity}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
