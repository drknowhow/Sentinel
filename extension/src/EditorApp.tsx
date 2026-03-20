import { useState, useEffect, useCallback, useRef } from 'react';
import type { Action, GuideEdits, GuideStepEdit } from './types';
import { useGuideEditor } from './hooks/useGuideEditor';
import { generateGuideHTML } from './lib/guideHtml';
import { saveSession } from './lib/storage';
import { sendMessage } from './lib/messages';
import GuideStepEditor from './components/GuideStepEditor';

interface GuideJson {
  guideTitle: string;
  introText: string;
  conclusionText: string;
  steps: Array<{
    title: string;
    notes: string;
    included: boolean;
    action: { type: string; selector: string; value?: string; description?: string; timestamp: number; url?: string };
  }>;
}

const DEFAULT_EXPORT_OPTIONS = {
  profile: 'internal' as const,
  redactSelectors: false,
  redactValues: false,
  redactUrls: false,
  includeDiagnostics: true,
};

// ── Inject editable script into preview HTML ──

function injectEditableScript(html: string): string {
  const editableStyle = `
<style>
  [contenteditable] { outline: none; border-radius: 3px; transition: background 0.15s, box-shadow 0.15s; }
  [contenteditable]:hover { background: rgba(59,130,246,0.06); }
  [contenteditable]:focus { background: rgba(59,130,246,0.1); box-shadow: 0 0 0 2px rgba(59,130,246,0.3); }
  .editable-hint { position: absolute; top: -18px; right: 4px; font-size: 10px; color: #94a3b8; pointer-events: none; opacity: 0; transition: opacity 0.15s; }
  .step:hover .editable-hint { opacity: 1; }
</style>`;

  const script = `
<script>
(function() {
  function makeEditable(el, onBlur) {
    if (!el) return;
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('focus', function() {
      window.parent.postMessage({ type: 'PREVIEW_FOCUS' }, '*');
    });
    el.addEventListener('blur', function() { onBlur(); });
  }
  document.querySelectorAll('.step').forEach(function(step, i) {
    step.style.position = 'relative';
    var hint = document.createElement('span');
    hint.className = 'editable-hint';
    hint.textContent = 'click to edit';
    step.appendChild(hint);
    var h3 = step.querySelector('h3');
    makeEditable(h3, function() {
      window.parent.postMessage({ type: 'PREVIEW_EDIT', stepIndex: i, field: 'title', value: h3.textContent }, '*');
    });
    var notes = step.querySelector('.step-notes p');
    makeEditable(notes, function() {
      window.parent.postMessage({ type: 'PREVIEW_EDIT', stepIndex: i, field: 'notes', value: notes.textContent }, '*');
    });
    if (!notes) {
      var notesDiv = document.createElement('div');
      notesDiv.className = 'step-notes';
      notesDiv.innerHTML = '<p contenteditable="true" style="color:#94a3b8;font-style:italic;">Click to add notes...</p>';
      var np = notesDiv.querySelector('p');
      np.addEventListener('focus', function() {
        window.parent.postMessage({ type: 'PREVIEW_FOCUS' }, '*');
        if (np.textContent === 'Click to add notes...') { np.textContent = ''; np.style.color = ''; np.style.fontStyle = ''; }
      });
      np.addEventListener('blur', function() {
        var val = np.textContent.trim();
        if (!val) { np.textContent = 'Click to add notes...'; np.style.color = '#94a3b8'; np.style.fontStyle = 'italic'; }
        window.parent.postMessage({ type: 'PREVIEW_EDIT', stepIndex: i, field: 'notes', value: val }, '*');
      });
      step.querySelector('.step-header').after(notesDiv);
    }
    step.addEventListener('click', function(e) {
      if (e.target.getAttribute('contenteditable')) return;
      window.parent.postMessage({ type: 'PREVIEW_SELECT', stepIndex: i }, '*');
    });
  });
  var intro = document.querySelector('.intro p');
  makeEditable(intro, function() {
    window.parent.postMessage({ type: 'PREVIEW_EDIT_META', field: 'introText', value: intro.textContent }, '*');
  });
  var conclusion = document.querySelector('.conclusion p');
  makeEditable(conclusion, function() {
    window.parent.postMessage({ type: 'PREVIEW_EDIT_META', field: 'conclusionText', value: conclusion.textContent }, '*');
  });
  var h1 = document.querySelector('h1');
  makeEditable(h1, function() {
    window.parent.postMessage({ type: 'PREVIEW_EDIT_META', field: 'guideTitle', value: h1.textContent }, '*');
  });
})();
<\/script>`;
  return html.replace('</head>', editableStyle + '</head>').replace('</body>', script + '</body>');
}

// ── TOC Sidebar ──

function TOCSidebar({ edits, selectedIdx, onSelect, onMove, onToggle, onDelete }: {
  edits: GuideEdits;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onToggle: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (i: number) => (e: React.DragEvent) => {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };

  const handleDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(i);
  };

  const handleDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== i) {
      onMove(dragIdx, i);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="w-52 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Table of Contents</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {edits.steps.map((step, i) => (
          <div
            key={step.originalIndex}
            draggable
            onDragStart={handleDragStart(i)}
            onDragOver={handleDragOver(i)}
            onDrop={handleDrop(i)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(i)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] cursor-pointer border-b border-gray-100 transition-all select-none ${
              selectedIdx === i ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            } ${!step.included ? 'opacity-40 line-through' : ''} ${
              overIdx === i && dragIdx !== i ? 'border-t-2 border-t-blue-400' : ''
            } ${dragIdx === i ? 'opacity-30' : ''}`}
          >
            <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0 cursor-grab">{i + 1}</span>
            <span className="flex-1 truncate">{step.title || 'Untitled'}</span>
            <button
              onClick={e => { e.stopPropagation(); onToggle(i); }}
              className={`text-[9px] px-1 rounded ${step.included ? 'text-green-500' : 'text-gray-400'}`}
              title={step.included ? 'Exclude' : 'Include'}
            >
              {step.included ? '●' : '○'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(i); }}
              className="text-[9px] text-gray-300 hover:text-red-500 px-0.5"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 border-t border-gray-200 text-[10px] text-gray-400">
        Drag to reorder
      </div>
    </div>
  );
}

// ── Main App ──

export default function EditorApp() {
  const [actions, setActions] = useState<Action[]>([]);
  const [existingEdits, setExistingEdits] = useState<GuideEdits | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const stepRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    chrome.storage.local.get(['currentSession', 'currentGuideEdits', 'sentinel_active_session_id'], (result) => {
      setActions((result.currentSession as Action[] | undefined) ?? []);
      setExistingEdits((result.currentGuideEdits as GuideEdits | undefined) ?? undefined);
      setActiveSessionId((result.sentinel_active_session_id as string | undefined) ?? null);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <div className="h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (actions.length === 0) return <div className="h-screen flex items-center justify-center text-gray-500">No recorded steps. Record a session first.</div>;

  return (
    <EditorInner
      actions={actions}
      existingEdits={existingEdits}
      activeSessionId={activeSessionId}
      saved={saved}
      setSaved={setSaved}
      selectedStep={selectedStep}
      setSelectedStep={setSelectedStep}
      stepRefs={stepRefs}
    />
  );
}

function EditorInner({
  actions, existingEdits, activeSessionId, saved, setSaved,
  selectedStep, setSelectedStep, stepRefs,
}: {
  actions: Action[];
  existingEdits?: GuideEdits;
  activeSessionId: string | null;
  saved: boolean;
  setSaved: (v: boolean) => void;
  selectedStep: number | null;
  setSelectedStep: (v: number | null) => void;
  stepRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
}) {
  const {
    edits, setEdits, updateStep, moveStep, deleteStep,
    setGuideTitle, setIntroText, setConclusionText, includedCount,
  } = useGuideEditor(actions, existingEdits);

  // Debounced preview
  const [previewHtml, setPreviewHtml] = useState('');
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewEditingRef = useRef(false);

  useEffect(() => {
    if (previewEditingRef.current) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setPreviewHtml(injectEditableScript(generateGuideHTML(actions, edits)));
    }, 400);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [actions, edits]);

  // Listen for postMessage from the preview iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'PREVIEW_FOCUS') { previewEditingRef.current = true; return; }

      if (data.type === 'PREVIEW_EDIT') {
        const visibleSteps = edits.steps.filter(s => s.included);
        const step = visibleSteps[data.stepIndex];
        if (!step) return;
        const realIdx = edits.steps.indexOf(step);
        if (data.field === 'title') updateStep(realIdx, { title: data.value || '' });
        if (data.field === 'notes') updateStep(realIdx, { notes: data.value || '' });
        previewEditingRef.current = false;
      }

      if (data.type === 'PREVIEW_EDIT_META') {
        if (data.field === 'guideTitle') setGuideTitle(data.value || '');
        if (data.field === 'introText') setIntroText(data.value || '');
        if (data.field === 'conclusionText') setConclusionText(data.value || '');
        previewEditingRef.current = false;
      }

      if (data.type === 'PREVIEW_SELECT') {
        const visibleSteps = edits.steps.filter(s => s.included);
        const step = visibleSteps[data.stepIndex];
        if (!step) return;
        const realIdx = edits.steps.indexOf(step);
        handleSelectStep(realIdx);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [edits.steps, updateStep, setGuideTitle, setIntroText, setConclusionText]);

  const handleSelectStep = useCallback((i: number) => {
    setSelectedStep(i);
    const ref = stepRefs.current.get(i);
    ref?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setSelectedStep(null), 2000);
  }, [setSelectedStep, stepRefs]);

  // TOC drag-drop: move step from one index to another
  const handleTocMove = useCallback((from: number, to: number) => {
    setEdits(prev => {
      const steps = [...prev.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      return { ...prev, steps };
    });
  }, [setEdits]);

  const handleSave = useCallback(async () => {
    chrome.storage.local.set({ currentGuideEdits: edits });
    const session = await saveSession({
      ...(activeSessionId ? { id: activeSessionId } : {}),
      actions,
      guideEdits: edits,
    });
    if (!activeSessionId) {
      chrome.storage.local.set({ sentinel_active_session_id: session.id });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [edits, actions, activeSessionId, setSaved]);

  const handleExport = useCallback(() => {
    sendMessage('EXPORT_EDITED_GUIDE', { edits });
  }, [edits]);

  const handleExportJson = useCallback(() => {
    const data: GuideJson = {
      guideTitle: edits.guideTitle,
      introText: edits.introText,
      conclusionText: edits.conclusionText,
      steps: edits.steps.map(s => ({
        title: s.title, notes: s.notes, included: s.included,
        action: { type: actions[s.originalIndex].type, selector: actions[s.originalIndex].selector, value: actions[s.originalIndex].value, description: actions[s.originalIndex].description, timestamp: actions[s.originalIndex].timestamp, url: actions[s.originalIndex].url },
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `sentinel-guide-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [actions, edits]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as GuideJson;
        if (!data.steps || !Array.isArray(data.steps)) return;
        const importedActions: Action[] = data.steps.map(s => ({ ...s.action, description: s.action.description || s.title }));
        const importedEdits: GuideEdits = {
          guideTitle: data.guideTitle || 'Imported Guide', introText: data.introText || '', conclusionText: data.conclusionText || '',
          steps: data.steps.map((s, i): GuideStepEdit => ({ originalIndex: i, title: s.title, notes: s.notes || '', includeScreenshot: false, included: s.included ?? true })),
        };
        chrome.storage.local.set({ currentSession: importedActions, currentGuideEdits: importedEdits }, () => window.location.reload());
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white flex-shrink-0">
        <img src="icon48.png" alt="" className="w-5 h-5" />
        <span className="text-sm font-bold tracking-wide">SENTINEL</span>
        <span className="text-[11px] text-gray-500">{includedCount}/{edits.steps.length} steps</span>
        <div className="flex-1" />
        <button onClick={() => importFileRef.current?.click()} className="px-2.5 py-1 text-[11px] rounded bg-white/10 hover:bg-white/20" title="Import JSON">Import</button>
        <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
        <button onClick={handleExportJson} className="px-2.5 py-1 text-[11px] rounded bg-white/10 hover:bg-white/20" title="Export JSON">JSON</button>
        <button onClick={handleSave} className="px-3 py-1 text-[11px] font-semibold rounded bg-blue-500 hover:bg-blue-600">{saved ? 'Saved!' : 'Save'}</button>
        <button onClick={handleExport} className="px-3 py-1 text-[11px] font-semibold rounded bg-green-500 hover:bg-green-600">Export HTML</button>
      </div>

      {/* Three-column layout: TOC | Editor | Preview */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: TOC */}
        <TOCSidebar
          edits={edits}
          selectedIdx={selectedStep}
          onSelect={handleSelectStep}
          onMove={handleTocMove}
          onToggle={i => updateStep(i, { included: !edits.steps[i].included })}
          onDelete={deleteStep}
        />

        {/* Center: Step editor */}
        <div className="w-80 flex-shrink-0 overflow-y-auto bg-white border-r border-gray-200 flex flex-col">
          {/* Metadata */}
          <div className="p-3 space-y-2 border-b border-gray-100">
            <input
              type="text"
              value={edits.guideTitle}
              onChange={e => setGuideTitle(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-medium focus:ring-1 focus:ring-blue-200 outline-none"
              placeholder="Guide title"
            />
            <textarea
              value={edits.introText}
              onChange={e => setIntroText(e.target.value)}
              placeholder="Introduction (optional)"
              rows={1}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none focus:ring-1 focus:ring-blue-200 outline-none"
            />
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="text-gray-500">
                Export profile
                <select
                  value={edits.exportOptions?.profile || 'internal'}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(prev.exportOptions || {}), profile: e.target.value as 'internal' | 'client' },
                  }))}
                  className="mt-1 w-full border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  <option value="internal">Internal</option>
                  <option value="client">Client</option>
                </select>
              </label>
              <label className="text-gray-500">
                Diagnostics
                <select
                  value={edits.exportOptions?.includeDiagnostics ? 'on' : 'off'}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(prev.exportOptions || {}), includeDiagnostics: e.target.value === 'on' },
                  }))}
                  className="mt-1 w-full border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  <option value="on">Include</option>
                  <option value="off">Hide</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-500">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={edits.exportOptions?.redactSelectors || false}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(prev.exportOptions || {}), redactSelectors: e.target.checked },
                  }))}
                />
                Selectors
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={edits.exportOptions?.redactValues || false}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(prev.exportOptions || {}), redactValues: e.target.checked },
                  }))}
                />
                Values
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={edits.exportOptions?.redactUrls || false}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    exportOptions: { ...DEFAULT_EXPORT_OPTIONS, ...(prev.exportOptions || {}), redactUrls: e.target.checked },
                  }))}
                />
                URLs
              </label>
            </div>
          </div>

          {/* Steps */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {edits.steps.map((step, i) => (
              <div
                key={step.originalIndex}
                ref={el => { if (el) stepRefs.current.set(i, el); else stepRefs.current.delete(i); }}
                className={`transition-all duration-300 rounded ${selectedStep === i ? 'ring-2 ring-blue-400' : ''}`}
              >
                <GuideStepEditor
                  step={step}
                  action={actions[step.originalIndex]}
                  index={i}
                  totalSteps={edits.steps.length}
                  onUpdate={updates => updateStep(i, updates)}
                  onMoveUp={() => moveStep(i, -1)}
                  onMoveDown={() => moveStep(i, 1)}
                  onDelete={() => deleteStep(i)}
                />
              </div>
            ))}
          </div>

          {/* Conclusion */}
          <div className="p-3 border-t border-gray-100">
            <textarea
              value={edits.conclusionText}
              onChange={e => setConclusionText(e.target.value)}
              placeholder="Conclusion (optional)"
              rows={1}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>
        </div>

        {/* Right: Live preview */}
        <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Live Preview</span>
            <span className="text-[10px] text-gray-400">Click text to edit inline</span>
          </div>
          <iframe
            srcDoc={previewHtml}
            sandbox="allow-same-origin allow-scripts"
            className="flex-1 w-full border-0 bg-white"
            title="Guide Preview"
          />
        </div>
      </div>
    </div>
  );
}
