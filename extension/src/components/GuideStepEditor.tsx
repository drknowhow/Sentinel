import { useState } from 'react';
import type { Action, GuideStepEdit } from '../types';

interface GuideStepEditorProps {
  step: GuideStepEdit;
  action: Action;
  index: number;
  totalSteps: number;
  onUpdate: (updates: Partial<GuideStepEdit>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export default function GuideStepEditor({
  step, action, index, totalSteps,
  onUpdate, onMoveUp, onMoveDown, onDelete,
}: GuideStepEditorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded transition-all ${step.included ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-300 opacity-50'}`}>
      {/* Compact row */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="text-[10px] font-mono text-gray-400 w-4 text-right flex-shrink-0">{index + 1}</span>
        <input
          type="text"
          value={step.title}
          onChange={e => onUpdate({ title: e.target.value })}
          className="flex-1 text-xs border-0 bg-transparent px-1 py-0.5 min-w-0 focus:bg-blue-50 focus:outline-none rounded"
          placeholder="Step title"
        />
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600 text-[10px] px-0.5" title="Expand">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onMoveUp} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-[10px] px-0.5" title="Move up">↑</button>
        <button onClick={onMoveDown} disabled={index === totalSteps - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-[10px] px-0.5" title="Move down">↓</button>
        <input
          type="checkbox"
          checked={step.included}
          onChange={e => onUpdate({ included: e.target.checked })}
          className="w-3 h-3 rounded flex-shrink-0"
          title="Include in guide"
        />
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 text-[10px] px-0.5" title="Remove">✕</button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2 pb-2 pt-0 space-y-1 border-t border-gray-100">
          <textarea
            value={step.notes}
            onChange={e => onUpdate({ notes: e.target.value })}
            placeholder="Notes..."
            rows={2}
            className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 resize-none focus:ring-1 focus:ring-blue-200 outline-none mt-1"
          />
          <div className="flex items-center gap-2 text-[10px]">
            {action.screenshot && (
              <label className="flex items-center gap-1 text-gray-500 cursor-pointer">
                <input type="checkbox" checked={step.includeScreenshot} onChange={e => onUpdate({ includeScreenshot: e.target.checked })} className="w-3 h-3 rounded" />
                Screenshot
              </label>
            )}
            <span className="text-gray-400 font-mono truncate flex-1">{action.selector}</span>
          </div>
        </div>
      )}
    </div>
  );
}
