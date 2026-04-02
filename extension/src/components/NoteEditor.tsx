import { useState, useEffect, useRef, useCallback } from 'react';
import type { UserNote, NoteAttachment, IssueSeverity } from '../types';
import { sendMessage } from '../lib/messages';
import { useVideoRecorder } from '../hooks/useVideoRecorder';

interface NoteEditorProps {
  note: UserNote;
  projects: import('../types').Project[];
  issues: import('../types').Issue[];
  onSave: (note: UserNote) => void;
  onCancel: () => void;
}

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function NoteEditor({ note, projects, issues, onSave, onCancel }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [projectId, setProjectId] = useState(note.projectId);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState('');
  const [attachments, setAttachments] = useState<NoteAttachment[]>(note.attachments);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showBugSelector, setShowBugSelector] = useState(false);
  const [manualBugTitle, setManualBugTitle] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const video = useVideoRecorder();

  // Sync contentEditable → state
  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  }, []);

  // Initialize editor content on mount or when note changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = note.content || '';
    }
  }, [note.id]);

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  // Find the closest block-level ancestor of the current selection within the editor
  const getSelectionBlock = (): { node: HTMLElement; tag: string } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return null;
    let node = sel.anchorNode as HTMLElement | null;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1) {
        const tag = (node as HTMLElement).tagName?.toUpperCase();
        if (['BLOCKQUOTE', 'PRE', 'H3', 'P', 'DIV'].includes(tag)) {
          return { node: node as HTMLElement, tag };
        }
      }
      node = node.parentElement;
    }
    return null;
  };

  // Convert selected content or current block into a target wrapper (blockquote, pre, or plain p)
  const convertBlock = (target: 'blockquote' | 'pre' | 'p') => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const block = getSelectionBlock();
    const currentTag = block?.tag || '';

    // If already in the target block, unwrap to plain paragraph
    if (
      (target === 'blockquote' && currentTag === 'BLOCKQUOTE') ||
      (target === 'pre' && currentTag === 'PRE')
    ) {
      // Unwrap: replace block with its text content as a plain paragraph
      if (block?.node) {
        const text = block.node.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        block.node.replaceWith(p);
        // Place cursor inside the new p
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      handleEditorInput();
      return;
    }

    // Get the content to wrap — either selected text or entire current block's content
    let content = '';
    if (sel.toString().trim()) {
      content = sel.toString();
    } else if (block?.node) {
      content = block.node.textContent || '';
    }
    if (!content) {
      content = target === 'pre' ? '// code here' : '\u00A0';
    }

    // Direct DOM replacement when converting between block types (avoids residual formatting)
    if (block?.node && ['BLOCKQUOTE', 'PRE'].includes(currentTag)) {
      let newEl: HTMLElement;
      if (target === 'blockquote') {
        newEl = document.createElement('blockquote');
        newEl.textContent = content;
      } else if (target === 'pre') {
        newEl = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = content;
        newEl.appendChild(code);
      } else {
        newEl = document.createElement('p');
        newEl.textContent = content;
      }
      block.node.replaceWith(newEl);
      const range = document.createRange();
      range.selectNodeContents(newEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      handleEditorInput();
      return;
    }

    // Fresh insertion (no existing block wrapper to replace)
    const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '';
    if (target === 'blockquote') {
      html = `<blockquote>${escaped}</blockquote><p><br></p>`;
    } else if (target === 'pre') {
      html = `<pre><code>${escaped}</code></pre><p><br></p>`;
    } else {
      html = `<p>${escaped}</p>`;
    }

    document.execCommand('insertHTML', false, html);
    handleEditorInput();
  };

  const handlePortQuote = async () => {
    setIsQuoting(true);
    try {
      const response = await sendMessage('GET_SELECTION') as { text?: string };
      const text = response?.text?.trim();
      if (text) {
        editorRef.current?.focus();
        // Move cursor to end
        const sel = window.getSelection();
        if (sel && editorRef.current) {
          sel.selectAllChildren(editorRef.current);
          sel.collapseToEnd();
        }
        document.execCommand('insertHTML', false,
          `<blockquote style="border-left:3px solid #06b6d4;margin:8px 0;padding:6px 12px;color:#475569;background:#f0fdfa;border-radius:0 6px 6px 0;font-style:italic;">\u201c${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}\u201d</blockquote><p><br></p>`
        );
        handleEditorInput();
      }
    } finally {
      setIsQuoting(false);
    }
  };

  // Auto-sync draft to storage as user types
  useEffect(() => {
    const draft: UserNote = {
      ...note,
      title,
      content,
      tags,
      projectId,
      attachments,
      updatedAt: Date.now(),
    };
    // Only sync if it's actually different to avoid recursive loops or unnecessary writes
    // (Simple check for now)
    chrome.storage.local.set({ sentinel_draft_note: draft });
  }, [title, content, tags, projectId, attachments]);

  // When a new video clip is recorded, automatically attach it
  useEffect(() => {
    if (video.clips.length > 0) {
      const latest = video.clips[video.clips.length - 1];
      const exists = attachments.some(a => a.id === latest.id);
      if (!exists) {
        const newAttachment: NoteAttachment = {
          type: 'video',
          id: latest.id,
          previewUrl: latest.url,
          title: `Video ${new Date(latest.createdAt).toLocaleTimeString()} (${latest.durationSec}s)`
        };
        setAttachments(prev => [...prev, newAttachment]);
      }
    }
  }, [video.clips]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase().replace(/^#/, '');
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleScreenshot = async () => {
    setIsCapturing(true);
    try {
      const response = await sendMessage('API_SCREENSHOT') as { screenshot?: string };
      if (response?.screenshot) {
        const newAttachment: NoteAttachment = {
          type: 'screenshot',
          id: Date.now().toString(),
          previewUrl: response.screenshot,
          title: `Screenshot ${new Date().toLocaleTimeString()}`
        };
        setAttachments([...attachments, newAttachment]);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAttachFinding = (issue: import('../types').Issue) => {
    const newAttachment: NoteAttachment = {
      type: 'bug', 
      id: issue.id, 
      title: `Linked: ${issue.title}`
    };
    setAttachments([...attachments, newAttachment]);
    setShowBugSelector(false);
  };

  const handleManualBug = () => {
    if (!manualBugTitle.trim()) return;
    const bugId = 'bug-' + Date.now().toString(36);
    const newAttachment: NoteAttachment = {
      type: 'bug',
      id: bugId,
      title: manualBugTitle.trim()
    };
    setAttachments([...attachments, newAttachment]);
    
    // Also save as an actual issue
    sendMessage('SAVE_ISSUE', {
      type: 'bug',
      title: manualBugTitle.trim(),
      notes: 'Manually added from note: ' + title,
      severity: 'medium' as IssueSeverity,
      pageUrl: location.href,
    });
    
    setManualBugTitle('');
    setShowBugSelector(false);
  };

  const handleOpenPreview = async (at: NoteAttachment) => {
    if (!at.previewUrl) return;
    if (at.type === 'video') return; // Videos play inline with controls
    
    const storageKey = `preview_${Date.now()}`;
    await chrome.storage.local.set({ [storageKey]: at.previewUrl });
    
    const previewUrl = chrome.runtime.getURL(`preview.html?key=${storageKey}&type=${at.type}&title=${encodeURIComponent(at.title || 'Screenshot')}&id=${at.id}&sourceId=${note.id}`);
    chrome.tabs.create({ url: previewUrl });
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const handleSave = () => {
    onSave({
      ...note,
      title: title.trim(),
      content: content.trim(),
      projectId,
      tags,
      attachments,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <button 
          onClick={onCancel}
          className="p-1 -ml-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          {note.title ? 'Edit Note' : 'New Note'}
        </h2>
        <button 
          onClick={handleSave}
          className="text-xs font-bold text-cyan-600 hover:text-cyan-700 px-2 py-1 rounded-md hover:bg-cyan-50 transition-all"
        >
          Done
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Title */}
          <input
            type="text"
            placeholder="Note Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full text-lg font-bold text-gray-800 placeholder:text-gray-200 focus:outline-none border-none p-0"
          />

          {/* Project Association */}
          <div className="flex items-center gap-2 py-1.5 px-2 bg-gray-50 rounded-lg border border-gray-100">
            <svg className="w-3 h-3 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="M3 9V5a2 2 0 0 1 2-2h6l2 3h7a2 2 0 0 1 2 2v1" />
            </svg>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Workspace:</span>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="flex-1 bg-transparent text-[11px] font-bold text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="">No Workspace</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[24px]">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-cyan-900">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="#add-tag"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="text-[10px] font-medium text-gray-500 placeholder:text-gray-300 focus:outline-none border-none p-0 w-20"
              />
            </div>
          </div>

          {/* Formatting Toolbar */}
          <div className="flex items-center gap-0.5 py-1.5 px-1 bg-gray-50 rounded-lg border border-gray-100 overflow-x-auto no-scrollbar">
            <button onClick={() => execFormat('bold')} title="Bold" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
            </button>
            <button onClick={() => execFormat('italic')} title="Italic" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
            </button>
            <button onClick={() => execFormat('underline')} title="Underline" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
            </button>
            <button onClick={() => execFormat('strikeThrough')} title="Strikethrough" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 4c-.5-1.5-2.5-3-5-3-3 0-5 2-5 4 0 1.5.5 2.5 2 3.5"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M17 12c.5.8 1 1.8 1 3 0 2.5-2.5 4.5-5.5 4.5-2 0-3.5-.5-5-2"/></svg>
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <button onClick={() => execFormat('formatBlock', '<h3>')} title="Heading" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v16"/><path d="M20 4v16"/><path d="M4 12h16"/></svg>
            </button>
            <button onClick={() => execFormat('insertUnorderedList')} title="Bullet List" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
            </button>
            <button onClick={() => execFormat('insertOrderedList')} title="Numbered List" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fill="currentColor" fontSize="7" fontWeight="bold" stroke="none">1</text><text x="2" y="14" fill="currentColor" fontSize="7" fontWeight="bold" stroke="none">2</text><text x="2" y="20" fill="currentColor" fontSize="7" fontWeight="bold" stroke="none">3</text></svg>
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <button onClick={() => convertBlock('blockquote')} title="Quote Block — select text to convert, click again to unwrap" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-cyan-600 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.06 0-2.08-.464-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.06 0-2.08-.464-2.917-1.179z"/></svg>
            </button>
            <button onClick={() => {
              editorRef.current?.focus();
              const sel = window.getSelection();
              const selectedText = sel?.toString() || '';
              if (selectedText) {
                document.execCommand('insertHTML', false,
                  `<code>${selectedText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>&nbsp;`
                );
              } else {
                document.execCommand('insertHTML', false,
                  '<code>code</code>&nbsp;'
                );
              }
              handleEditorInput();
            }} title="Inline Code" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>
            <button onClick={() => convertBlock('pre')} title="Code Block — select text to convert, click again to unwrap" className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><polyline points="10 9 13 12 10 15" strokeWidth="2.5"/><line x1="15" y1="15" x2="18" y2="15" strokeWidth="2.5"/></svg>
            </button>
            <button onClick={() => execFormat('removeFormat')} title="Clear Formatting" className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors ml-auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Rich Content Editor */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleEditorInput}
            data-placeholder="Write your notes here..."
            className="w-full min-w-0 min-h-[160px] text-sm text-gray-700 focus:outline-none border border-gray-100 rounded-lg p-3 resize-none leading-relaxed overflow-hidden empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300 empty:before:pointer-events-none [&_blockquote]:border-l-[3px] [&_blockquote]:border-cyan-400 [&_blockquote]:my-2 [&_blockquote]:py-1.5 [&_blockquote]:px-3 [&_blockquote]:text-gray-500 [&_blockquote]:bg-teal-50 [&_blockquote]:rounded-r-md [&_blockquote]:italic [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:text-slate-700 [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full [&_pre]:text-xs [&_pre]:font-mono [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:text-slate-100 [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words"
          />

          {/* Recording Status Overlay */}
          {video.isVideoRecording && (
            <div className="flex items-center gap-2 p-2 bg-pink-50 border border-pink-100 rounded-lg animate-pulse">
              <div className="w-2 h-2 rounded-full bg-pink-500" />
              <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">
                Recording Tab... {formatDuration(video.liveDurationSec)}
              </span>
              <div className="flex-1" />
              <button 
                onClick={video.toggleRecording}
                className="px-2 py-0.5 bg-pink-500 text-white text-[9px] font-bold rounded hover:bg-pink-600"
              >
                Stop
              </button>
            </div>
          )}

          {/* Attachments Display */}
          {attachments.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-gray-50">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Attachments</h4>
              <div className="grid grid-cols-2 gap-3">
                {attachments.map(at => (
                  <div key={at.id} className="relative group rounded-lg border border-gray-100 bg-gray-50/50 p-2 overflow-hidden">
                    {(at.type === 'screenshot' || at.type === 'video') && at.previewUrl ? (
                      <div className="aspect-video rounded bg-gray-200 mb-1.5 overflow-hidden relative">
                        {at.type === 'video' ? (
                          <video 
                            src={at.previewUrl} 
                            className="w-full h-full object-cover" 
                            controls
                            playsInline
                          />
                        ) : (
                          <img 
                            src={at.previewUrl} 
                            className="w-full h-full object-cover cursor-pointer" 
                            onClick={() => handleOpenPreview(at)}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video rounded bg-white border border-gray-100 mb-1.5 flex items-center justify-center">
                        <svg className={`w-5 h-5 ${at.type === 'bug' ? 'text-red-400' : 'text-blue-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {at.type === 'bug' ? (
                            <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                          ) : (
                            <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z" />
                          )}
                        </svg>
                      </div>
                    )}
                    <div className="text-[9px] font-bold text-gray-600 truncate">{at.title}</div>
                    <button 
                      onClick={() => removeAttachment(at.id)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-white/90 shadow-sm rounded-full text-gray-400 hover:text-red-500 transition-all"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tool Dock */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleScreenshot}
            disabled={isCapturing}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-cyan-300 hover:bg-cyan-50 transition-all group"
          >
            <svg className={`w-5 h-5 ${isCapturing ? 'text-cyan-500 animate-pulse' : 'text-gray-400 group-hover:text-cyan-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="text-[10px] font-bold text-gray-500 group-hover:text-cyan-700">Screenshot</span>
          </button>

          <button
            onClick={video.toggleRecording}
            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 bg-white border rounded-xl transition-all group ${video.isVideoRecording ? 'border-pink-300 bg-pink-50' : 'border-gray-200 hover:border-pink-300 hover:bg-pink-50'}`}
          >
            <svg className={`w-5 h-5 ${video.isVideoRecording ? 'text-pink-500 animate-pulse' : 'text-gray-400 group-hover:text-pink-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span className={`text-[10px] font-bold ${video.isVideoRecording ? 'text-pink-700' : 'text-gray-500 group-hover:text-pink-700'}`}>
              {video.isVideoRecording ? 'Recording...' : 'Video'}
            </span>
          </button>
          
          <button
            onClick={handlePortQuote}
            disabled={isQuoting}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:bg-teal-50 transition-all group"
          >
            <svg className={`w-5 h-5 ${isQuoting ? 'text-teal-500 animate-pulse' : 'text-gray-400 group-hover:text-teal-500'}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.06 0-2.08-.464-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.06 0-2.08-.464-2.917-1.179z"/>
            </svg>
            <span className="text-[10px] font-bold text-gray-500 group-hover:text-teal-700">
              {isQuoting ? 'Porting...' : 'Port Quote'}
            </span>
          </button>

          <button
            onClick={() => setShowBugSelector(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-red-300 hover:bg-red-50 transition-all group"
          >
            <svg className="w-5 h-5 text-gray-400 group-hover:text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-[10px] font-bold text-gray-500 group-hover:text-red-700">Log Bug</span>
          </button>
        </div>
      </div>

      {/* Bug Selector Modal */}
      {showBugSelector && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in fade-in slide-in-from-bottom-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Attach Bug</h3>
            <button onClick={() => setShowBugSelector(false)} className="text-gray-400 hover:text-gray-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Manual Entry */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Manual Entry</h4>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Bug title..."
                  value={manualBugTitle}
                  onChange={e => setManualBugTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualBug()}
                  className="flex-1 text-xs border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:border-red-300"
                />
                <button 
                  onClick={handleManualBug}
                  className="px-3 py-2 bg-red-600 text-white text-[10px] font-bold rounded-md hover:bg-red-700 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Existing Findings */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">From Findings</h4>
              {issues.length === 0 ? (
                <p className="text-[10px] text-gray-400 italic">No existing findings found.</p>
              ) : (
                <div className="space-y-2">
                  {issues.map(issue => (
                    <div 
                      key={issue.id}
                      onClick={() => handleAttachFinding(issue)}
                      className="p-2 border border-gray-100 rounded-lg hover:border-red-200 hover:bg-red-50/30 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${issue.severity === 'critical' ? 'bg-red-600' : 'bg-orange-500'}`} />
                        <span className="text-[11px] font-bold text-gray-700 truncate">{issue.title}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5 truncate pl-3.5">{issue.pageUrl.replace(/^https?:\/\//, '')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
