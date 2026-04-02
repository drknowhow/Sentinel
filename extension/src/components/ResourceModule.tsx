import { useState, useMemo } from 'react';
import type { Project, UserNote, Issue, VideoClip } from '../types';
import { deleteIssue, updateIssue, saveUserNote, getUserNotes } from '../lib/storage';

interface ResourceModuleProps {
  activeProjectId: string | null;
  projects: Project[];
  notes: UserNote[];
  issues: Issue[];
  videoClips: VideoClip[];
}

type ResourceType = 'all' | 'screenshot' | 'video' | 'bug';

interface ResourceItem {
  id: string;
  type: 'screenshot' | 'video' | 'bug';
  url?: string;
  title: string;
  source: string; // e.g. "Note: Title" or "Finding: Title"
  sourceId: string; // ID of the note or issue it belongs to
  createdAt: number;
}

export default function ResourceModule({ activeProjectId, notes, issues, videoClips }: ResourceModuleProps) {
  const [filter, setFilter] = useState<ResourceType>('all');
  const [selectedItem, setSelectedItem] = useState<ResourceItem | null>(null);

  const resources = useMemo(() => {
    const items: ResourceItem[] = [];

    // 1. Extract from Notes
    notes.forEach(note => {
      if (!activeProjectId || note.projectId === activeProjectId) {
        note.attachments.forEach(at => {
          if (at.type === 'screenshot') {
            items.push({ 
              id: at.id, 
              type: 'screenshot', 
              url: at.previewUrl, 
              title: at.title || 'Screenshot', 
              source: `Note: ${note.title || 'Untitled'}`, 
              sourceId: note.id, 
              createdAt: note.createdAt 
            });
          } else if (at.type === 'video') {
            items.push({ 
              id: at.id, 
              type: 'video', 
              url: at.previewUrl, 
              title: at.title || 'Video', 
              source: `Note: ${note.title || 'Untitled'}`, 
              sourceId: note.id, 
              createdAt: note.createdAt 
            });
          }
        });
      }
    });

    // 2. Extract from Issues
    issues.forEach(issue => {
      if (!activeProjectId || issue.projectId === activeProjectId) {
        if (issue.screenshot) {
          items.push({
            id: issue.id + '-ss',
            type: 'screenshot',
            url: issue.screenshot,
            title: `Issue Screenshot`,
            source: `Finding: ${issue.title}`,
            sourceId: issue.id,
            createdAt: issue.createdAt,
          });
        }
        items.push({
          id: issue.id,
          type: 'bug',
          title: issue.title,
          source: `Finding`,
          sourceId: issue.id,
          createdAt: issue.createdAt,
        });
      }
    });

    // 3. Extract from Video Clips
    videoClips.forEach(clip => {
      if (!activeProjectId || clip.projectId === activeProjectId) {
        items.push({
          id: clip.id,
          type: 'video',
          url: clip.url,
          title: `Recording ${new Date(clip.createdAt).toLocaleTimeString()}`,
          source: 'Video Feed',
          sourceId: 'video-feed', // specialized source
          createdAt: clip.createdAt,
        });
      }
    });

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [activeProjectId, notes, issues, videoClips]);

  const filtered = resources.filter(r => filter === 'all' || r.type === filter);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const handleDeleteResource = async (item: ResourceItem) => {
    if (!confirm('Delete this resource permanently?')) return;
    
    if (item.type === 'bug') {
      await deleteIssue(item.sourceId);
    } else if (item.sourceId === 'video-feed') {
      // Video clips aren't persistent in this demo usually, but we'd delete here
    } else {
      // It's an attachment in a note
      const notes = await getUserNotes();
      const note = notes.find(n => n.id === item.sourceId);
      if (note) {
        note.attachments = note.attachments.filter(at => at.id !== item.id);
        await saveUserNote(note);
      }
    }
    setSelectedItem(null);
  };

  const handleRenameResource = async (item: ResourceItem) => {
    if (!editTitle.trim()) return;

    if (item.type === 'bug') {
      await updateIssue(item.sourceId, { title: editTitle.trim() });
    } else {
      const notes = await getUserNotes();
      const note = notes.find(n => n.id === item.sourceId);
      if (note) {
        const at = note.attachments.find(a => a.id === item.id);
        if (at) at.title = editTitle.trim();
        await saveUserNote(note);
      }
    }
    setIsEditing(false);
    setSelectedItem({ ...item, title: editTitle.trim() });
  };

  const handleOpenPreview = async (item: ResourceItem) => {
    if (!item.url) return;
    
    // For large data URLs (screenshots), we store them temporarily to avoid URL length limits
    const storageKey = `preview_${Date.now()}`;
    await chrome.storage.local.set({ [storageKey]: item.url });
    
    const previewUrl = chrome.runtime.getURL(`preview.html?key=${storageKey}&type=${item.type}&title=${encodeURIComponent(item.title)}&id=${item.id}&sourceId=${item.sourceId}`);
    chrome.tabs.create({ url: previewUrl });
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Project Resources</h2>
          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full border border-gray-100">
            {filtered.length} Items
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {(['all', 'screenshot', 'video', 'bug'] as ResourceType[]).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all whitespace-nowrap uppercase tracking-wider ${
                filter === t 
                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm' 
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-3 shadow-sm border border-gray-100">
              <svg className="w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Empty Workspace</p>
            <p className="text-[10px] text-gray-400 mt-1">Add notes or capture findings to see resources here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(item => (
              <div 
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-cyan-400 hover:shadow-md transition-all flex flex-col shadow-sm"
              >
                <div className="aspect-video bg-gray-100 relative overflow-hidden flex items-center justify-center">
                  {item.type === 'screenshot' && item.url ? (
                    <img src={item.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-pink-50">
                      <svg className="w-8 h-8 text-pink-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-50">
                      <svg className="w-8 h-8 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenPreview(item); }}
                      className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                      title="Open in new tab"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditTitle(item.title); setIsEditing(true); setSelectedItem(item); }}
                      className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                      title="Rename"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (item.url) {
                          const a = document.createElement('a');
                          a.href = item.url;
                          a.download = `sentinel-resource-${item.id}.${item.type === 'video' ? 'webm' : 'png'}`;
                          a.click();
                        }
                      }}
                      className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                      title="Download"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteResource(item); }}
                      className="p-1.5 bg-red-500/40 hover:bg-red-500/60 rounded-full text-white backdrop-blur-md transition-all"
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" /></svg>
                    </button>
                  </div>
                </div>
                <div className="p-2 border-t border-gray-50 flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-gray-800 truncate">{item.title}</div>
                  <div className="text-[8px] font-bold text-gray-400 uppercase truncate mt-0.5 tracking-tighter">{item.source}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full Preview Overlay */}
      {selectedItem && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
            <button onClick={() => setSelectedItem(null)} className="p-1 -ml-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div className="text-center min-w-0 flex-1 px-4">
              {isEditing ? (
                <div className="flex items-center gap-2 max-w-md mx-auto">
                  <input 
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-800 w-full"
                    onKeyDown={e => e.key === 'Enter' && handleRenameResource(selectedItem)}
                  />
                  <button onClick={() => handleRenameResource(selectedItem)} className="text-green-600 font-bold text-[10px]">SAVE</button>
                  <button onClick={() => setIsEditing(false)} className="text-gray-400 font-bold text-[10px]">ESC</button>
                </div>
              ) : (
                <>
                  <h3 
                    className="text-[11px] font-bold text-gray-800 truncate cursor-pointer hover:text-cyan-600"
                    onClick={() => { setEditTitle(selectedItem.title); setIsEditing(true); }}
                  >
                    {selectedItem.title}
                  </h3>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{selectedItem.source}</p>
                </>
              )}
            </div>
            <button 
              onClick={() => handleOpenPreview(selectedItem)}
              className="p-1 text-cyan-600 hover:text-cyan-700"
              title="Open in new tab"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-black flex items-center justify-center p-2">
            {selectedItem.type === 'screenshot' && selectedItem.url ? (
              <img src={selectedItem.url} className="max-w-full max-h-full object-contain shadow-2xl" />
            ) : selectedItem.type === 'video' && selectedItem.url ? (
              <video src={selectedItem.url} className="max-w-full max-h-full" controls autoPlay playsInline />
            ) : (
              <div className="text-white text-center p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl">
                <svg className="w-12 h-12 text-orange-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h4 className="text-sm font-bold uppercase tracking-widest mb-2 text-white">Linked Finding</h4>
                <p className="text-xs text-gray-400 leading-relaxed max-w-xs">{selectedItem.title}</p>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between gap-4 shrink-0">
            <button 
              onClick={() => handleDeleteResource(selectedItem)}
              className="px-3 py-1.5 text-red-600 hover:bg-red-50 text-[10px] font-bold rounded-lg transition-all flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" /></svg>
              Delete
            </button>
            
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter hidden sm:block">
              Added {new Date(selectedItem.createdAt).toLocaleString()}
            </div>

            <button 
              onClick={() => {
                if (selectedItem.url) {
                  const a = document.createElement('a');
                  a.href = selectedItem.url;
                  a.download = `sentinel-resource-${selectedItem.id}.${selectedItem.type === 'video' ? 'webm' : 'png'}`;
                  a.click();
                }
              }}
              className="px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2 shadow-sm"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
