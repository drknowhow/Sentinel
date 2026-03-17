import { useState, useEffect, useRef } from 'react';
import type { AiLogEntry } from '../types';

// ── Icons ──

function IconNavigate() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}
function IconRecord() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="8"/>
    </svg>
  );
}
function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}
function IconDoc() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function IconBug() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/>
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/>
      <path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/>
      <path d="M3 21c0-2.1 1.7-3.9 4-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/>
      <path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-4-4"/>
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}
function IconInject() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      <path d="M13 13l6 6"/>
    </svg>
  );
}

// ── Command metadata ──

interface CmdMeta {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  category: string;
}

function getCmdMeta(command: string): CmdMeta {
  if (command === 'API_NAVIGATE')
    return { icon: <IconNavigate />, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', category: 'Navigation' };
  if (command === 'API_SCREENSHOT')
    return { icon: <IconCamera />, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', category: 'Capture' };
  if (command === 'API_START_RECORDING' || command === 'API_STOP_RECORDING')
    return { icon: <IconRecord />, iconBg: 'bg-red-100', iconColor: 'text-red-500', category: 'Recording' };
  if (command === 'API_GENERATE_GUIDE' || command === 'API_GET_SESSION')
    return { icon: <IconDoc />, iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600', category: 'Guide' };
  if (command === 'API_START_ERROR_TRACKING' || command === 'API_STOP_ERROR_TRACKING' || command === 'API_GET_ERRORS')
    return { icon: <IconAlert />, iconBg: 'bg-orange-100', iconColor: 'text-orange-500', category: 'Errors' };
  if (command === 'API_SAVE_ISSUE' || command === 'API_GET_ISSUES' || command === 'API_GENERATE_REPORT')
    return { icon: <IconBug />, iconBg: 'bg-rose-100', iconColor: 'text-rose-500', category: 'Issues' };
  if (command === 'API_INJECT_ACTION')
    return { icon: <IconInject />, iconBg: 'bg-violet-100', iconColor: 'text-violet-600', category: 'Interaction' };
  if (command === 'API_WAIT_FOR_ELEMENT' || command === 'API_EVALUATE_SELECTOR')
    return { icon: <IconCode />, iconBg: 'bg-slate-100', iconColor: 'text-slate-500', category: 'DOM' };
  // API_GET_STATUS and anything else
  return { icon: <IconActivity />, iconBg: 'bg-green-100', iconColor: 'text-green-600', category: 'Status' };
}

// ── Time helpers ──

function relativeTime(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 5)  return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.round(diffMin / 60)}h ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Single log row ──

function LogRow({ entry }: { entry: AiLogEntry }) {
  const [, setTick] = useState(0);
  const meta = getCmdMeta(entry.command);

  // Re-render every 10s so relative time updates
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${entry.status === 'error' ? 'bg-red-50/40' : ''}`}>
      {/* Icon */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${meta.iconBg} ${meta.iconColor}`}>
        {meta.icon}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-gray-800">{entry.label}</span>
          <span className="text-[10px] text-gray-400">{relativeTime(entry.timestamp)}</span>
        </div>
        {entry.detail && (
          <div className="text-[10px] font-mono text-gray-500 truncate mt-0.5 leading-tight" title={entry.detail}>
            {entry.detail}
          </div>
        )}
        {entry.status === 'error' && entry.error && (
          <div className="text-[10px] text-red-500 mt-0.5 leading-tight line-clamp-2">{entry.error}</div>
        )}
      </div>

      {/* Right side: duration + status */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {entry.status === 'success' ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Fail
          </span>
        )}
        <span className="text-[9px] text-gray-400 font-mono">{formatDuration(entry.durationMs)}</span>
      </div>
    </div>
  );
}

// ── Empty state ──

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-100 flex items-center justify-center mb-4 border border-cyan-100">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <p className="text-[13px] font-semibold text-gray-700 mb-1">No AI activity yet</p>
      <p className="text-[11px] text-gray-400 max-w-[200px] leading-relaxed">
        Commands from Claude, Cursor, or Copilot will appear here in real time.
      </p>
    </div>
  );
}

// ── Summary bar ──

function SummaryBar({ entries, onClear }: { entries: AiLogEntry[]; onClear: () => void }) {
  const total = entries.length;
  const errors = entries.filter(e => e.status === 'error').length;
  const avgMs = total > 0 ? Math.round(entries.reduce((s, e) => s + e.durationMs, 0) / total) : 0;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-gray-500">
          <span className="font-semibold text-gray-700">{total}</span> commands
        </span>
        {errors > 0 && (
          <span className="text-[10px] text-red-500 font-semibold">{errors} failed</span>
        )}
        {total > 0 && (
          <span className="text-[10px] text-gray-400">avg {formatDuration(avgMs)}</span>
        )}
      </div>
      {total > 0 && (
        <button
          onClick={onClear}
          className="text-[10px] text-gray-400 hover:text-red-500 transition-colors font-medium"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Main component ──

export default function AiLog() {
  const [entries, setEntries] = useState<AiLogEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    chrome.storage.local.get('aiActivityLog', (r) => {
      setEntries((r.aiActivityLog as AiLogEntry[]) || []);
    });

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.aiActivityLog) {
        setEntries((changes.aiActivityLog.newValue as AiLogEntry[]) || []);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Flash scroll indicator when a new entry arrives
  useEffect(() => {
    if (entries.length > prevLenRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevLenRef.current = entries.length;
  }, [entries.length]);

  const clearLog = () => {
    chrome.storage.local.set({ aiActivityLog: [] });
    setEntries([]);
  };

  return (
    <div className="flex flex-col h-full">
      <SummaryBar entries={entries} onClear={clearLog} />
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          entries.map(entry => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
