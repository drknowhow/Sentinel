import { useState, useMemo } from 'react';
import type { Action, GuideEdits } from '../types';
import { useGuideEditor } from '../hooks/useGuideEditor';
import { generateGuideHTML } from '../lib/guideHtml';
import GuideStepEditor from './GuideStepEditor';
import GuidePreview from './GuidePreview';

interface GuideEditorProps {
  actions: Action[];
  existingEdits?: GuideEdits;
  onSave: (edits: GuideEdits) => void;
  onExport: (edits: GuideEdits) => void;
  onClose: () => void;
}

type Tab = 'edit' | 'preview';

export default function GuideEditor({ actions, existingEdits, onSave, onExport, onClose }: GuideEditorProps) {
  const {
    edits, updateStep, moveStep, deleteStep,
    setGuideTitle, setIntroText, setConclusionText, includedCount,
  } = useGuideEditor(actions, existingEdits);

  const [tab, setTab] = useState<Tab>('edit');

  const previewHtml = useMemo(
    () => tab === 'preview' ? generateGuideHTML(actions, edits) : '',
    [tab, actions, edits]
  );

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          &larr; Back
        </button>
        <span className="text-sm font-medium text-gray-700">Guide Editor</span>
        <button
          onClick={() => onSave(edits)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Save
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('edit')}
          className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
            tab === 'edit'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Edit ({includedCount} steps)
        </button>
        <button
          onClick={() => setTab('preview')}
          className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
            tab === 'preview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Preview
        </button>
      </div>

      {tab === 'edit' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Guide metadata */}
          <div className="space-y-2">
            <input
              type="text"
              value={edits.guideTitle}
              onChange={e => setGuideTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-medium"
              placeholder="Guide title"
            />
            <textarea
              value={edits.introText}
              onChange={e => setIntroText(e.target.value)}
              placeholder="Introduction (optional)"
              rows={2}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none"
            />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {edits.steps.map((step, i) => (
              <GuideStepEditor
                key={step.originalIndex}
                step={step}
                action={actions[step.originalIndex]}
                index={i}
                totalSteps={edits.steps.length}
                onUpdate={updates => updateStep(i, updates)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
                onDelete={() => deleteStep(i)}
              />
            ))}
          </div>

          {/* Conclusion */}
          <textarea
            value={edits.conclusionText}
            onChange={e => setConclusionText(e.target.value)}
            placeholder="Conclusion (optional)"
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-2">
          <GuidePreview html={previewHtml} />
        </div>
      )}

      {/* Bottom actions */}
      <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
        <button
          onClick={() => onSave(edits)}
          className="flex-1 py-2 text-sm rounded font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
        >
          Save to Session
        </button>
        <button
          onClick={() => onExport(edits)}
          className="flex-1 py-2 text-sm rounded font-bold text-white bg-green-600 hover:bg-green-700"
        >
          Export HTML
        </button>
      </div>
    </div>
  );
}
