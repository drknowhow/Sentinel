import { useState, useMemo } from 'react';
import type { Project, UserNote } from '../types';
import { saveProject, deleteProject, setActiveProjectId } from '../lib/storage';

interface ProjectModuleProps {
  projects: Project[];
  activeId: string | null;
  notes: UserNote[];
}

export default function ProjectModule({ projects, activeId, notes }: ProjectModuleProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [path, setPath] = useState('');
  const [devUrl, setDevUrl] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');

  const stats = useMemo(() => {
    const map: Record<string, { notes: number; issues: number }> = {};
    projects.forEach(p => {
      map[p.id] = {
        notes: notes.filter(n => n.projectId === p.id).length,
        issues: 0, // In the future, issues should also be project-aware
      };
    });
    return map;
  }, [projects, notes]);

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description || '');
    setPath(p.path);
    setDevUrl(p.devUrl);
    setRepositoryUrl(p.repositoryUrl || '');
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setName('');
    setDescription('');
    setPath('');
    setDevUrl('');
    setRepositoryUrl('');
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const now = Date.now();
    const p: Project = {
      id: isCreating ? now.toString(36) : (editingId as string),
      name: name.trim(),
      description: description.trim(),
      path: path.trim(),
      devUrl: devUrl.trim(),
      repositoryUrl: repositoryUrl.trim(),
      createdAt: isCreating ? now : (projects.find(x => x.id === editingId)?.createdAt || now),
      updatedAt: now,
    };
    await saveProject(p);
    if (isCreating) await setActiveProjectId(p.id);
    setEditingId(null);
    setIsCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this project? This will not delete associated notes but they will be orphaned.')) {
      await deleteProject(id);
    }
  };

  if (editingId || isCreating) {
    return (
      <div className="flex flex-col h-full bg-white animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <button onClick={() => { setEditingId(null); setIsCreating(false); }} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{isCreating ? 'New Project' : 'Edit Project'}</h2>
          <button onClick={handleSave} className="text-xs font-bold text-cyan-600 px-2 py-1 rounded hover:bg-cyan-50">Save</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Project Name</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. My Awesome Web App"
              className="w-full text-base font-bold text-gray-800 focus:outline-none border-b border-gray-100 pb-1"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Description</label>
            <textarea 
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="A brief summary of what this project is..."
              rows={2}
              className="w-full text-xs text-gray-600 focus:outline-none border border-gray-100 rounded p-2 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Local Source Path</label>
              <input 
                value={path} onChange={e => setPath(e.target.value)}
                placeholder="C:/projects/my-app"
                className="w-full text-[11px] font-mono bg-gray-50 border border-gray-100 rounded px-2 py-1.5 focus:border-cyan-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Dev Server URL</label>
              <input 
                value={devUrl} onChange={e => setDevUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full text-[11px] font-mono bg-gray-50 border border-gray-100 rounded px-2 py-1.5 focus:border-cyan-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Repository URL</label>
              <input 
                value={repositoryUrl} onChange={e => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full text-[11px] font-mono bg-gray-50 border border-gray-100 rounded px-2 py-1.5 focus:border-cyan-200"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 tracking-tight">Projects</h2>
          <p className="text-[10px] text-gray-400 font-medium">{projects.length} Workspace{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button 
          onClick={startCreate}
          className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="M3 9V5a2 2 0 0 1 2-2h6l2 3h7a2 2 0 0 1 2 2v1" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-800">No Projects yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Create a project to organize your notes, sessions, and AI context.</p>
            <button 
              onClick={startCreate}
              className="mt-6 px-4 py-2 bg-cyan-600 text-white text-xs font-bold rounded-lg hover:bg-cyan-700 shadow-sm transition-all"
            >
              Add your first project
            </button>
          </div>
        ) : (
          projects.map(project => {
            const isActive = project.id === activeId;
            return (
              <div 
                key={project.id}
                onClick={() => startEdit(project)}
                className={`group relative rounded-xl border p-4 transition-all cursor-pointer ${
                  isActive ? 'border-cyan-500 bg-cyan-50/10 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-gray-800 truncate">{project.name}</h3>
                      {isActive && <span className="px-1.5 py-0.5 rounded-full bg-cyan-100 text-[8px] font-bold text-cyan-700 tracking-wider uppercase">Active</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed h-8">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setActiveProjectId(project.id); }}
                      className={`px-2 py-1 text-[9px] font-bold rounded transition-colors ${isActive ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {isActive ? 'Current' : 'Select'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t border-gray-50 pt-3">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Notes</span>
                    <span className="text-xs font-bold text-gray-700">{stats[project.id]?.notes || 0}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Created</span>
                    <span className="text-xs font-bold text-gray-700">{new Date(project.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex-1" />
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" /></svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
