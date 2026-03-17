import { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../lib/messages';
import type { Assertion, AssertionType, Message } from '../types';

interface AssertionBuilderProps {
  assertions: Assertion[];
  onAdd: (assertion: Assertion) => void;
  onRemove: (id: string) => void;
  currentStepCount: number;
  disabled: boolean;
}

const ASSERTION_TYPES: { value: AssertionType; label: string }[] = [
  { value: 'visible', label: 'Is visible' },
  { value: 'hidden', label: 'Is hidden' },
  { value: 'text-contains', label: 'Text contains' },
  { value: 'text-equals', label: 'Text equals' },
  { value: 'has-class', label: 'Has class' },
  { value: 'exists', label: 'Exists in DOM' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function AssertionBuilder({
  assertions,
  onAdd,
  onRemove,
  currentStepCount,
  disabled,
}: AssertionBuilderProps) {
  const [inspecting, setInspecting] = useState(false);
  const [selectedSelector, setSelectedSelector] = useState('');
  const [assertionType, setAssertionType] = useState<AssertionType>('visible');
  const [expected, setExpected] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = onMessage((message: Message) => {
      if (message.type === 'ELEMENT_SELECTED' && message.payload) {
        const p = message.payload as { selector: string; purpose?: string };
        // Only handle if purpose is assertion or unspecified (backward compat)
        if (!p.purpose || p.purpose === 'assertion') {
          setSelectedSelector(p.selector);
          setInspecting(false);
        }
      }
      return undefined;
    });
    return unsub;
  }, []);

  const startInspection = () => {
    setInspecting(true);
    sendMessage('START_INSPECTION');
  };

  const stopInspection = () => {
    setInspecting(false);
    sendMessage('STOP_INSPECTION');
  };

  const addAssertion = () => {
    if (!selectedSelector) return;
    const needsExpected = ['text-contains', 'text-equals', 'has-class'].includes(assertionType);
    if (needsExpected && !expected.trim()) return;

    onAdd({
      id: generateId(),
      selector: selectedSelector,
      type: assertionType,
      expected: needsExpected ? expected.trim() : undefined,
      afterStep: currentStepCount - 1,
    });

    setSelectedSelector('');
    setExpected('');
  };

  const needsExpected = ['text-contains', 'text-equals', 'has-class'].includes(assertionType);

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        Assertions ({assertions.length})
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Inspector toggle */}
          <button
            onClick={inspecting ? stopInspection : startInspection}
            disabled={disabled}
            className={`w-full py-1.5 text-sm rounded transition-colors disabled:opacity-50 ${
              inspecting
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {inspecting ? 'Stop Inspecting' : 'Inspect Element'}
          </button>

          {/* Selector display */}
          {selectedSelector && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-gray-500 bg-gray-50 p-2 rounded truncate">
                {selectedSelector}
              </p>

              <select
                value={assertionType}
                onChange={e => setAssertionType(e.target.value as AssertionType)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                {ASSERTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {needsExpected && (
                <input
                  type="text"
                  placeholder="Expected value"
                  value={expected}
                  onChange={e => setExpected(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              )}

              <button
                onClick={addAssertion}
                className="w-full py-1.5 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200"
              >
                Add Assertion (after step {currentStepCount})
              </button>
            </div>
          )}

          {/* Assertion list */}
          {assertions.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {assertions.map(a => (
                <div key={a.id} className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1 text-xs">
                  <span className="flex-1 truncate">
                    <span className="font-medium">{a.type}</span>
                    {a.expected && <span className="text-gray-500"> = {a.expected}</span>}
                    <span className="text-gray-400 ml-1">@step {a.afterStep + 1}</span>
                  </span>
                  <button
                    onClick={() => onRemove(a.id)}
                    className="text-gray-400 hover:text-red-500 px-1"
                  >
                    &#10005;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
