import { useEffect, useState } from 'react';
import { onMessage, sendMessage } from '../lib/messages';
import type { Assertion, AssertionType, Message } from '../types';

interface AssertionBuilderProps {
  assertions: Assertion[];
  onAdd: (assertion: Assertion) => void;
  onRemove: (id: string) => void;
  currentStepCount: number;
  disabled: boolean;
  inline?: boolean;
}

const ASSERTION_TYPES: Array<{ value: AssertionType; label: string; needsSelector?: boolean; needsExpected?: boolean; needsAttribute?: boolean }> = [
  { value: 'visible', label: 'Is visible' },
  { value: 'hidden', label: 'Is hidden' },
  { value: 'exists', label: 'Exists in DOM' },
  { value: 'checked', label: 'Is checked' },
  { value: 'unchecked', label: 'Is unchecked' },
  { value: 'text-contains', label: 'Text contains', needsExpected: true },
  { value: 'text-equals', label: 'Text equals', needsExpected: true },
  { value: 'value-equals', label: 'Value equals', needsExpected: true },
  { value: 'has-class', label: 'Has class', needsExpected: true },
  { value: 'attribute-equals', label: 'Attribute equals', needsExpected: true, needsAttribute: true },
  { value: 'url-contains', label: 'URL contains', needsSelector: false, needsExpected: true },
  { value: 'url-equals', label: 'URL equals', needsSelector: false, needsExpected: true },
  { value: 'network-idle', label: 'Network becomes idle', needsSelector: false },
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
  inline,
}: AssertionBuilderProps) {
  const [inspecting, setInspecting] = useState(false);
  const [selectedSelector, setSelectedSelector] = useState('');
  const [assertionType, setAssertionType] = useState<AssertionType>('visible');
  const [expected, setExpected] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [retryMs, setRetryMs] = useState('0');
  const [retryIntervalMs, setRetryIntervalMs] = useState('250');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = onMessage((message: Message) => {
      if (message.type === 'ELEMENT_SELECTED' && message.payload) {
        const p = message.payload as { selector: string; purpose?: string };
        if (!p.purpose || p.purpose === 'assertion') {
          setSelectedSelector(p.selector);
          setInspecting(false);
          setExpanded(true);
        }
      }
      return undefined;
    });
    return unsub;
  }, []);

  const config = ASSERTION_TYPES.find(type => type.value === assertionType) || ASSERTION_TYPES[0];

  const startInspection = () => {
    setInspecting(true);
    sendMessage('START_INSPECTION');
  };

  const stopInspection = () => {
    setInspecting(false);
    sendMessage('STOP_INSPECTION');
  };

  const addAssertion = () => {
    if (config.needsSelector !== false && !selectedSelector) return;
    if (config.needsExpected && !expected.trim()) return;
    if (config.needsAttribute && !attributeName.trim()) return;

    onAdd({
      id: generateId(),
      selector: config.needsSelector === false ? '' : selectedSelector,
      type: assertionType,
      expected: config.needsExpected ? expected.trim() : undefined,
      attributeName: config.needsAttribute ? attributeName.trim() : undefined,
      afterStep: Math.max(currentStepCount - 1, 0),
      retryMs: Number(retryMs) || 0,
      retryIntervalMs: Number(retryIntervalMs) || 250,
    });

    setExpected('');
    setAttributeName('');
  };

  const content = (
    <div className="px-4 pb-3 space-y-2">
      {config.needsSelector !== false && (
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
      )}

      {selectedSelector && config.needsSelector !== false && (
        <p className="text-xs font-mono text-gray-500 bg-gray-50 p-2 rounded truncate">
          {selectedSelector}
        </p>
      )}

      <select
        value={assertionType}
        onChange={e => setAssertionType(e.target.value as AssertionType)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
      >
        {ASSERTION_TYPES.map(type => (
          <option key={type.value} value={type.value}>{type.label}</option>
        ))}
      </select>

      {config.needsAttribute && (
        <input
          type="text"
          placeholder="Attribute name"
          value={attributeName}
          onChange={e => setAttributeName(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      )}

      {config.needsExpected && (
        <input
          type="text"
          placeholder="Expected value"
          value={expected}
          onChange={e => setExpected(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          Retry window (ms)
          <input
            type="number"
            min="0"
            step="250"
            value={retryMs}
            onChange={e => setRetryMs(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-gray-500">
          Retry interval (ms)
          <input
            type="number"
            min="100"
            step="50"
            value={retryIntervalMs}
            onChange={e => setRetryIntervalMs(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <button
        onClick={addAssertion}
        disabled={config.needsSelector !== false && !selectedSelector}
        className="w-full py-1.5 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
      >
        Add Assertion (after step {Math.max(currentStepCount, 1)})
      </button>

      {assertions.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {assertions.map(assertion => (
            <div key={assertion.id} className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1 text-xs">
              <span className="flex-1 truncate">
                <span className="font-medium">{assertion.type}</span>
                {assertion.attributeName && <span className="text-gray-500"> [{assertion.attributeName}]</span>}
                {assertion.expected && <span className="text-gray-500"> = {assertion.expected}</span>}
                {assertion.retryMs ? <span className="text-gray-400 ml-1">retry {assertion.retryMs}ms</span> : null}
                <span className="text-gray-400 ml-1">@step {assertion.afterStep + 1}</span>
              </span>
              <button
                onClick={() => onRemove(assertion.id)}
                className="text-gray-400 hover:text-red-500 px-1"
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (inline) {
    return <div className="pt-2">{content}</div>;
  }

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        Assertions ({assertions.length})
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>
      {expanded && content}
    </div>
  );
}
