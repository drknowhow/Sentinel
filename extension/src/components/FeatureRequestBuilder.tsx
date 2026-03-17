import { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../lib/messages';
import type { IssueSeverity, Message } from '../types';

interface FeatureRequestBuilderProps {
  disabled: boolean;
}

export default function FeatureRequestBuilder({ disabled }: FeatureRequestBuilderProps) {
  const [expanded, setExpanded] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [selector, setSelector] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');

  useEffect(() => {
    const unsub = onMessage((message: Message) => {
      if (message.type === 'ELEMENT_SELECTED' && message.payload) {
        const p = message.payload as { selector: string; purpose?: string };
        if (p.purpose === 'feature-request') {
          setSelector(p.selector);
          setInspecting(false);
          setExpanded(true); // auto-expand when element is selected
        }
      }
      return undefined;
    });
    return unsub;
  }, []);

  const startInspection = () => {
    setInspecting(true);
    sendMessage('START_FEATURE_INSPECTION');
  };

  const stopInspection = () => {
    setInspecting(false);
    sendMessage('STOP_INSPECTION');
  };

  const save = () => {
    if (!title.trim()) return;
    sendMessage('SAVE_ISSUE', {
      type: 'feature-request',
      title: title.trim(),
      notes: notes.trim(),
      selector: selector || undefined,
      pageUrl: location.href,
      severity,
    });
    setTitle('');
    setNotes('');
    setSelector('');
  };

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center"
      >
        Feature Requests
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9660;</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Inspector */}
          <button
            onClick={inspecting ? stopInspection : startInspection}
            disabled={disabled}
            className={`w-full py-1.5 text-sm rounded transition-colors disabled:opacity-50 ${
              inspecting
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {inspecting ? 'Stop Inspecting' : 'Select Component (optional)'}
          </button>

          {selector && (
            <p className="text-xs font-mono text-gray-500 bg-gray-50 p-2 rounded truncate">
              {selector}
            </p>
          )}

          <input
            type="text"
            placeholder="Request title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />

          <textarea
            placeholder="Describe the addition or change..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none"
          />

          <div className="flex gap-2">
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as IssueSeverity)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <button
              onClick={save}
              disabled={!title.trim()}
              className="flex-1 py-1.5 text-sm rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium disabled:opacity-50"
            >
              Submit Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
