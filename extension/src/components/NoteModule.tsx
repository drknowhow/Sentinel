import { useState, useMemo } from 'react';
import type { UserNote, Project } from '../types';
import { saveUserNote, deleteUserNote } from '../lib/storage';
import NoteEditor from './NoteEditor';

interface NoteModuleProps {
  notes: UserNote[];
  projects: Project[];
  issues: import('../types').Issue[];
  activeProjectId: string | null;
  draftNote: UserNote | null;
}

export default function NoteModule({ notes, projects, issues, activeProjectId, draftNote }: NoteModuleProps) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const projectNotes = useMemo(() => 
    notes.filter(n => n.projectId === activeProjectId),
    [notes, activeProjectId]
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projectNotes.forEach(n => n.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [projectNotes]);

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const filteredNotes = useMemo(() => {
    return projectNotes.filter(n => {
      const plainContent = stripHtml(n.content);
      const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) || 
                           plainContent.toLowerCase().includes(search.toLowerCase());
      const matchesTag = !selectedTag || n.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projectNotes, search, selectedTag]);

  const handleCreate = () => {
    const newNote: UserNote = {
      id: Date.now().toString(36),
      projectId: activeProjectId || '',
      title: '',
      content: '',
      tags: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    chrome.storage.local.set({ sentinel_draft_note: newNote });
  };

  const handleEdit = (note: UserNote) => {
    chrome.storage.local.set({ sentinel_draft_note: note });
  };

  const handleSave = async (note: UserNote) => {
    await saveUserNote(note);
    chrome.storage.local.remove('sentinel_draft_note');
  };

  const handleCancel = () => {
    chrome.storage.local.remove('sentinel_draft_note');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this note?')) {
      await deleteUserNote(id);
    }
  };

  if (draftNote) {
    return (
      <NoteEditor 
        note={draftNote} 
        projects={projects}
        issues={issues}
        onSave={handleSave} 
        onCancel={handleCancel} 
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20"
            />
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <button
            onClick={handleCreate}
            disabled={!activeProjectId}
            className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-md hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            <span>New Note</span>
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all whitespace-nowrap ${
                !selectedTag ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all whitespace-nowrap ${
                  tag === selectedTag ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Note List */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z" />
              <path d="M15 3v6h6" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            {!activeProjectId ? 'Select a project to see notes' : 'No notes found'}
          </p>
          {activeProjectId && (
            <button 
              onClick={handleCreate}
              className="mt-4 text-[11px] font-semibold text-cyan-600 hover:text-cyan-700"
            >
              Create your first note
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredNotes.map(note => (
            <div 
              key={note.id}
              onClick={() => handleEdit(note)}
              className="group bg-white border border-gray-200 rounded-lg p-3 hover:border-cyan-200 hover:shadow-sm transition-all cursor-pointer relative"
            >
              <div className="flex items-start justify-between mb-1.5">
                <h3 className="text-xs font-bold text-gray-800 flex-1 truncate pr-6">
                  {note.title || 'Untitled Note'}
                </h3>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-2.5">
                {stripHtml(note.content) || 'No content...'}
              </p>

              <div className="flex items-center flex-wrap gap-1.5">
                {note.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-100">
                    #{tag}
                  </span>
                ))}
                {note.attachments.length > 0 && (
                  <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    {note.attachments.length}
                  </span>
                )}
                <div className="flex-1" />
                <span className="text-[9px] text-gray-400 font-medium">
                  {new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
