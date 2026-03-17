import { useRef, useEffect, useState } from 'react';
import type { Action } from '../types';

interface StepListProps {
  actions: Action[];
  currentPlaybackStep?: number;
}

const TYPE_COLORS: Record<string, string> = {
  click: 'bg-blue-100 text-blue-600',
  dblclick: 'bg-blue-100 text-blue-600',
  input: 'bg-amber-100 text-amber-600',
  keydown: 'bg-gray-200 text-gray-600',
  scroll: 'bg-gray-200 text-gray-500',
  submit: 'bg-green-100 text-green-600',
  navigation: 'bg-purple-100 text-purple-600',
};

function formatAction(action: Action): string {
  if (action.description) return action.description;
  const tag = action.selector.split('>').pop()?.trim().split('.')[0] ?? '';
  switch (action.type) {
    case 'click': return `Clicked ${tag}`;
    case 'input': return `Typed "${(action.value ?? '').slice(0, 30)}" in ${tag}`;
    case 'keydown': return `Pressed ${action.value ?? ''}`;
    case 'scroll': return 'Scrolled page';
    case 'submit': return `Submitted ${tag}`;
    case 'navigation': return `Navigated to ${action.url ?? action.value ?? ''}`;
    case 'dblclick': return `Double-clicked ${tag}`;
    default: return `${action.type} on ${tag}`;
  }
}

export default function StepList({ actions, currentPlaybackStep }: StepListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actions.length]);

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mb-2">
          <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
        </div>
        <p className="text-xs text-gray-500 font-medium">No steps recorded</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Click REC to start</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {actions.map((action, i) => {
        const isActive = currentPlaybackStep === i;
        const isExpanded = expandedIdx === i;
        return (
          <div
            key={action.timestamp + '-' + i}
            className={`border-b border-gray-100 cursor-pointer transition-colors ${
              isActive ? 'bg-purple-50 border-l-2 border-l-purple-500' : 'hover:bg-gray-50'
            }`}
            onClick={() => setExpandedIdx(isExpanded ? null : i)}
          >
            {/* Collapsed row */}
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <span className="text-[10px] font-mono text-gray-400 w-4 text-right flex-shrink-0">{i + 1}</span>
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${TYPE_COLORS[action.type] || 'bg-gray-100 text-gray-500'}`}>
                {action.type.slice(0, 3).toUpperCase()}
              </span>
              <span className="text-xs text-gray-700 truncate flex-1">{formatAction(action)}</span>
              <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-2 pt-0.5 ml-6 space-y-1 text-[11px]" onClick={e => e.stopPropagation()}>
                <p className="font-mono text-gray-400 break-all">{action.selector}</p>
                {action.value && (
                  <p className="text-gray-600"><span className="text-gray-400">Value:</span> {action.value}</p>
                )}
                {action.url && (
                  <p className="text-gray-600"><span className="text-gray-400">URL:</span> {action.url}</p>
                )}
                <p className="text-gray-400">{new Date(action.timestamp).toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
