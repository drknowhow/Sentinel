import { useEffect, useRef, useState } from 'react';
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

  const handleAnnotate = async (action: Action, index: number) => {
    if (!action.screenshot) return;
    
    let dataUrl = action.screenshot;
    // If it's a storage key (step_ss_...), fetch the actual data
    if (dataUrl.startsWith('step_ss_')) {
      const result = await chrome.storage.local.get(dataUrl);
      dataUrl = result[dataUrl] as string;
    }
    
    if (!dataUrl) return;

    const storageKey = `preview_${Date.now()}`;
    await chrome.storage.local.set({ [storageKey]: dataUrl });
    
    const previewUrl = chrome.runtime.getURL(`preview.html?key=${storageKey}&type=screenshot&title=${encodeURIComponent(`Step #${index + 1}: ${action.description || 'Action'}`)}&id=step-${index}&sourceId=current-session`);
    chrome.tabs.create({ url: previewUrl });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actions.length]);

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
        </div>
        <p className="text-[13px] text-gray-700 font-bold tracking-tight">No steps recorded</p>
        <p className="text-[11px] text-gray-400 mt-1 font-medium">Click <span className="text-red-500 font-bold bg-red-50 px-1 rounded">REC</span> to begin tracking</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto px-4 py-4 relative h-full">
      {/* Timeline spine */}
      <div className="absolute left-[29px] top-8 bottom-8 w-0.5 bg-gray-200 rounded-full" />

      <div className="space-y-3">
        {actions.map((action, i) => {
          const isActive = currentPlaybackStep === i + 1;
          const isExpanded = expandedIdx === i;
          const confidence = Math.round((action.selectorConfidence ?? 0) * 100);

          return (
            <div key={action.timestamp + '-' + i} className="relative pl-10 group">
              {/* Timeline Dot */}
              <div className={`absolute left-[13px] top-1/2 w-3.5 h-3.5 rounded-full border-[2.5px] border-white transform -translate-y-1/2 z-10 transition-colors duration-200 ${isActive ? 'bg-purple-500 shadow-[0_0_0_4px_rgba(168,85,247,0.15)] ring-2 ring-purple-100' : 'bg-blue-400 group-hover:bg-blue-500'
                }`} />

              {/* Action Card */}
              <div
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className={`bg-white rounded-xl border shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md ${isActive ? 'border-purple-300 ring-2 ring-purple-50' : 'border-gray-200 hover:border-blue-200 group-hover:-translate-y-0.5'
                  }`}
              >
                <div className="flex flex-col p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase flex-shrink-0 ${TYPE_COLORS[action.type] || 'bg-gray-100 text-gray-500'}`}>
                      {action.type.slice(0, 4)}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 truncate flex-1">{formatAction(action)}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide flex-shrink-0 ${confidence >= 80 ? 'bg-green-50 text-green-600' : confidence >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                      }`}>
                      {confidence}%
                    </span>
                    <span className="text-[10px] text-gray-300 font-bold ml-1 w-4 text-right">#{i + 1}</span>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5 text-[11px]" onClick={e => e.stopPropagation()}>
                      <p className="font-mono bg-gray-50 border border-gray-100 p-1.5 rounded text-gray-500 break-all">{action.selector}</p>
                      {action.selectorCandidates?.length ? (
                        <p className="text-gray-500 mt-1 flex flex-wrap gap-1">
                          <span className="font-semibold text-gray-400">Alts:</span>
                          {action.selectorCandidates.slice(0, 3).map((candidate, idx) => (
                            <span key={idx} className="bg-gray-100 px-1 rounded text-[10px] text-gray-600">
                              {candidate.strategy} <span className="opacity-60">{Math.round(candidate.score * 100)}%</span>
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {action.value && (
                        <p className="text-gray-700 bg-amber-50 p-1.5 rounded border border-amber-100"><strong className="text-amber-700/70 font-semibold">Value:</strong> {action.value}</p>
                      )}
                      {action.url && (
                        <p className="text-gray-500 break-all"><strong className="text-gray-400">URL:</strong> {action.url}</p>
                      )}
                      {action.targetSnapshot?.text ? (
                        <p className="text-gray-600 italic border-l-2 border-gray-200 pl-2 mt-1 py-0.5">"{action.targetSnapshot.text.slice(0, 60)}{action.targetSnapshot.text.length > 60 ? '...' : ''}"</p>
                      ) : null}
                      
                      {action.screenshot && (
                        <button 
                          onClick={() => handleAnnotate(action, i)}
                          className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded text-[10px] font-bold hover:bg-cyan-100 transition-colors w-fit"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l5 5" /></svg>
                          ANNOTATE STEP
                        </button>
                      )}
                      
                      <p className="text-[10px] text-gray-400 font-medium text-right mt-1">{new Date(action.timestamp).toLocaleTimeString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
