import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { saveUserNote, updateIssue } from './lib/storage';
import type { UserNote } from './types';

type Tool = 'select' | 'pen' | 'rect' | 'arrow' | 'text' | 'arrow-text' | 'highlight';
type InteractionMode = 'none' | 'drawing' | 'dragging' | 'resizing' | 'editing';

interface Shape {
  id: string;
  type: 'pen' | 'rect' | 'arrow' | 'text' | 'arrow-text' | 'highlight';
  points?: { x: number; y: number }[];
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color: string;
  strokeWidth: number;
  fontSize: number;
  groupId?: string;
}

function PreviewApp() {
  const [data, setData] = useState<{ url: string; type: string; title: string; id: string; sourceId: string } | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [fontSize, setFontSize] = useState(24);
  const [isSaving, setIsSaving] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isLayersOpen, setIsLayersOpen] = useState(true);
  
  const [mode, setInteractionMode] = useState<InteractionMode>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialShapeState, setInitialShapeState] = useState<Shape | null>(null);
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') || 'screenshot';
    const title = params.get('title') || 'Resource Preview';
    const id = params.get('id') || '';
    const sourceId = params.get('sourceId') || '';
    const storageKey = params.get('key');
    if (storageKey) {
      chrome.storage.local.get(storageKey, (result) => {
        if (result[storageKey]) setData({ url: result[storageKey] as string, type, title, id, sourceId });
      });
    } else {
      const url = params.get('url');
      if (url) setData({ url, type, title, id, sourceId });
    }
  }, []);

  // Update selected shape color immediately when color changes
  useEffect(() => {
    if (selectedShapeId) {
      setShapes(prev => prev.map(s => s.id === selectedShapeId ? { ...s, color } : s));
    }
  }, [color, selectedShapeId]);

  const drawShapes = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    const allShapes = currentShape ? [...shapes, currentShape] : shapes;

    allShapes.forEach(shape => {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = shape.type === 'highlight' ? 0.4 : 1.0;

      const isSelected = shape.id === selectedShapeId;
      if (isSelected) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = shape.color;
      } else {
        ctx.shadowBlur = 0;
      }

      if ((shape.type === 'pen' || shape.type === 'highlight') && shape.points) {
        ctx.beginPath();
        shape.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x + shape.x, p.y + shape.y);
          else ctx.lineTo(p.x + shape.x, p.y + shape.y);
        });
        ctx.stroke();
      } else if (shape.type === 'rect') {
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === 'arrow' || shape.type === 'arrow-text') {
        const headlen = 20, dx = shape.width, dy = shape.height, angle = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.moveTo(shape.x, shape.y); ctx.lineTo(shape.x + dx, shape.y + dy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(shape.x + dx, shape.y + dy);
        ctx.lineTo(shape.x + dx - headlen * Math.cos(angle - Math.PI / 6), shape.y + dy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(shape.x + dx - headlen * Math.cos(angle + Math.PI / 6), shape.y + dy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();

        if (shape.type === 'arrow-text' && shape.text && mode !== 'editing') {
          ctx.font = `bold ${shape.fontSize}px sans-serif`;
          const metrics = ctx.measureText(shape.text);
          const tx = shape.x + dx / 2, ty = shape.y + dy / 2 - 20;
          ctx.globalAlpha = 1.0; // reset for text background
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(tx - metrics.width/2 - 10, ty - shape.fontSize, metrics.width + 20, shape.fontSize + 10);
          ctx.fillStyle = shape.color;
          ctx.fillText(shape.text, tx - metrics.width/2, ty);
        }
      } else if (shape.type === 'text' && (mode !== 'editing' || selectedShapeId !== shape.id)) {
        ctx.font = `bold ${shape.fontSize}px sans-serif`;
        ctx.fillText(shape.text || 'Double click to edit', shape.x, shape.y);
      }

      ctx.globalAlpha = 1.0;
      if (isSelected && tool === 'select') {
        ctx.shadowBlur = 0; ctx.fillStyle = 'white'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
        const hSize = 8;
        [[shape.x, shape.y], [shape.x + shape.width, shape.y + shape.height]].forEach(([hx, hy]) => {
          ctx.fillRect(hx - hSize/2, hy - hSize/2, hSize, hSize); ctx.strokeRect(hx - hSize/2, hy - hSize/2, hSize, hSize);
        });
      }
    });
  }, [shapes, currentShape, selectedShapeId, tool, mode]);

  useEffect(() => { drawShapes(); }, [drawShapes]);

  const handleImageLoad = () => {
    if (!imgRef.current || !canvasRef.current) return;
    canvasRef.current.width = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;
    drawShapes();
  };

  const getPos = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const hitTest = (pos: {x: number, y: number}) => {
    const threshold = 20;
    if (selectedShapeId) {
      const s = shapes.find(x => x.id === selectedShapeId);
      if (s && Math.abs(pos.x - (s.x + s.width)) < threshold && Math.abs(pos.y - (s.y + s.height)) < threshold) return { shape: s, handle: 'br' };
    }
    const hit = [...shapes].reverse().find(s => {
      if (s.type === 'rect') {
        const x = s.width < 0 ? s.x + s.width : s.x, y = s.height < 0 ? s.y + s.height : s.y;
        return pos.x >= x && pos.x <= x + Math.abs(s.width) && pos.y >= y && pos.y <= y + Math.abs(s.height);
      }
      return Math.sqrt(Math.pow(pos.x - s.x, 2) + Math.pow(pos.y - s.y, 2)) < 40;
    });
    return hit ? { shape: hit, handle: null } : null;
  };

  const startInteraction = (e: React.MouseEvent) => {
    const pos = getPos(e);
    const hitResult = hitTest(pos);
    if (tool === 'select') {
      if (hitResult) {
        setSelectedShapeId(hitResult.shape.id);
        setInteractionMode(hitResult.handle ? 'resizing' : 'dragging');
        setDragStart(pos); setInitialShapeState({...hitResult.shape});
      } else { setSelectedShapeId(null); setInteractionMode('none'); }
      return;
    }
    setInteractionMode('drawing');
    const newShape: Shape = {
      id: Date.now().toString(), type: tool as any, x: pos.x, y: pos.y, width: 0, height: 0, color, strokeWidth: tool === 'highlight' ? 30 : strokeWidth, fontSize,
      text: (tool === 'text' || tool === 'arrow-text') ? '' : undefined,
      points: (tool === 'pen' || tool === 'highlight') ? [{x: 0, y: 0}] : undefined
    };
    setCurrentShape(newShape);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e);
    if (mode === 'drawing' && currentShape) {
      if (currentShape.type === 'pen' || currentShape.type === 'highlight') setCurrentShape({...currentShape, points: [...(currentShape.points || []), {x: pos.x - currentShape.x, y: pos.y - currentShape.y}]});
      else setCurrentShape({...currentShape, width: pos.x - currentShape.x, height: pos.y - currentShape.y});
    } else if (mode === 'dragging' && initialShapeState && selectedShapeId) {
      const dx = pos.x - dragStart.x, dy = pos.y - dragStart.y;
      setShapes(prev => prev.map(s => s.id === selectedShapeId ? {...s, x: initialShapeState.x + dx, y: initialShapeState.y + dy} : s));
    } else if (mode === 'resizing' && selectedShapeId) {
      setShapes(prev => prev.map(s => s.id === selectedShapeId ? {...s, width: pos.x - s.x, height: pos.y - s.y} : s));
    }
  };

  const endInteraction = () => {
    if (mode === 'drawing' && currentShape) {
      const normalized = {...currentShape};
      if (normalized.width < 0) { normalized.x += normalized.width; normalized.width = Math.abs(normalized.width); }
      if (normalized.height < 0) { normalized.y += normalized.height; normalized.height = Math.abs(normalized.height); }
      setShapes(prev => [...prev, normalized]);
      if (normalized.type === 'text' || normalized.type === 'arrow-text') { setSelectedShapeId(normalized.id); setInteractionMode('editing'); }
      else setInteractionMode('none');
      setCurrentShape(null);
    } else if (mode !== 'editing') setInteractionMode('none');
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pos = getPos(e); const hitResult = hitTest(pos);
    if (hitResult && (hitResult.shape.type === 'text' || hitResult.shape.type === 'arrow-text')) {
      setSelectedShapeId(hitResult.shape.id);
      setInteractionMode('editing');
    }
  };

  const updateText = (text: string) => setShapes(prev => prev.map(s => s.id === selectedShapeId ? {...s, text} : s));
  const deleteShape = (id: string) => { setShapes(prev => prev.filter(s => s.id !== id)); if (selectedShapeId === id) setSelectedShapeId(null); };
  const moveLayer = (from: number, to: number) => {
    setShapes(prev => { const next = [...prev]; const [removed] = next.splice(from, 1); next.splice(to, 0, removed); return next; });
  };

  const groupSelected = () => {
    if (!selectedShapeId) return;
    const s = shapes.find(x => x.id === selectedShapeId);
    if (!s) return;
    const gid = 'group-' + Date.now().toString(36);
    setShapes(prev => prev.map(x => x.id === selectedShapeId ? { ...x, groupId: gid } : x));
  };

  const captureVideoFrame = () => {
    if (!videoRef.current || !data) return;
    const canvas = document.createElement('canvas'); canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    setData({ ...data, type: 'screenshot', url: canvas.toDataURL('image/png'), title: `Frame from ${data.title}` });
    setTimeout(() => handleImageLoad(), 100);
  };

  const saveAnnotated = async (overwrite: boolean) => {
    if (!data || !canvasRef.current || !imgRef.current) return;
    setIsSaving(true);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvasRef.current.width; finalCanvas.height = canvasRef.current.height;
    const fctx = finalCanvas.getContext('2d')!; fctx.drawImage(imgRef.current, 0, 0);
    shapes.forEach(shape => {
      fctx.strokeStyle = shape.color; fctx.fillStyle = shape.color; fctx.lineWidth = shape.strokeWidth; fctx.lineCap = 'round'; fctx.lineJoin = 'round';
      fctx.globalAlpha = shape.type === 'highlight' ? 0.4 : 1.0;
      if ((shape.type === 'pen' || shape.type === 'highlight') && shape.points) {
        fctx.beginPath(); shape.points.forEach((p, i) => { if (i === 0) fctx.moveTo(p.x + shape.x, p.y + shape.y); else fctx.lineTo(p.x + shape.x, p.y + shape.y); }); fctx.stroke();
      } else if (shape.type === 'rect') fctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      else if (shape.type === 'arrow' || shape.type === 'arrow-text') {
        const headlen = 20, dx = shape.width, dy = shape.height, angle = Math.atan2(dy, dx);
        fctx.beginPath(); fctx.moveTo(shape.x, shape.y); fctx.lineTo(shape.x + dx, shape.y + dy); fctx.stroke();
        fctx.beginPath(); fctx.moveTo(shape.x + dx, shape.y + dy);
        fctx.lineTo(shape.x + dx - headlen * Math.cos(angle - Math.PI / 6), shape.y + dy - headlen * Math.sin(angle - Math.PI / 6));
        fctx.lineTo(shape.x + dx - headlen * Math.cos(angle + Math.PI / 6), shape.y + dy - headlen * Math.sin(angle + Math.PI / 6));
        fctx.closePath(); fctx.fill();
        if (shape.type === 'arrow-text' && shape.text) {
          fctx.font = `bold ${shape.fontSize}px sans-serif`; const m = fctx.measureText(shape.text); const tx = shape.x + dx/2, ty = shape.y + dy/2 - 20;
          fctx.globalAlpha = 1.0; fctx.fillStyle = 'rgba(0,0,0,0.7)'; fctx.fillRect(tx - m.width/2 - 10, ty - shape.fontSize, m.width + 20, shape.fontSize + 10);
          fctx.fillStyle = shape.color; fctx.fillText(shape.text, tx - m.width/2, ty);
        }
      } else if (shape.type === 'text') { fctx.font = `bold ${shape.fontSize}px sans-serif`; fctx.fillText(shape.text || '', shape.x, shape.y); }
    });
    const newUrl = finalCanvas.toDataURL('image/png');
    try {
      if (data.sourceId === 'video-feed') { const a = document.createElement('a'); a.href = newUrl; a.download = `annotated-${Date.now()}.png`; a.click(); }
      else if (data.sourceId.startsWith('bug-') || data.type === 'bug') await updateIssue(data.sourceId, { screenshot: newUrl });
      else if (data.sourceId === 'current-session') {
        const res = await chrome.storage.local.get('currentSession'); const session = (res.currentSession as any[]) || [];
        const idx = parseInt(data.id.split('-')[1]);
        if (session[idx]) { const ssKey = `step_ss_${Date.now()}_${idx}`; await chrome.storage.local.set({ [ssKey]: newUrl }); session[idx].screenshot = ssKey; await chrome.storage.local.set({ currentSession: session }); }
      } else {
        // Handle Note Attachments (Check both saved notes and the active draft)
        const result = await chrome.storage.local.get(['sentinel_user_notes', 'sentinel_draft_note']);
        const notes = (result.sentinel_user_notes as UserNote[]) || [];
        const draft = result.sentinel_draft_note as UserNote | null;
        
        let targetNote: UserNote | null = null;
        let isDraft = false;

        if (draft && draft.id === data.sourceId) {
          targetNote = draft;
          isDraft = true;
        } else {
          targetNote = notes.find(n => n.id === data.sourceId) || null;
        }

        if (targetNote) {
          if (overwrite) {
            const at = targetNote.attachments.find((a: any) => a.id === data.id);
            if (at) at.previewUrl = newUrl;
          } else {
            targetNote.attachments.push({
              type: 'screenshot',
              id: Date.now().toString(),
              previewUrl: newUrl,
              title: `Annotated: ${data.title}`
            });
          }

          if (isDraft) {
            await chrome.storage.local.set({ sentinel_draft_note: targetNote });
          } else {
            await saveUserNote(targetNote);
          }
        }
      }
      alert('Saved successfully!');
    } catch (err) { alert('Save failed: ' + String(err)); } finally { setIsSaving(false); }
  };

  if (!data) return <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white font-sans"><div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full" /></div>;
  const selectedShape = shapes.find(s => s.id === selectedShapeId);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-950 font-sans overflow-hidden text-white">
      <div className="px-6 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <img src="icon48.png" className="w-6 h-6" alt="Sentinel" />
          <h1 className="text-sm font-bold truncate max-w-md">{data.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {data.type === 'video' && <button onClick={captureVideoFrame} className="px-3 py-1.5 bg-pink-600 text-[10px] font-bold rounded-lg hover:bg-pink-700 uppercase">Capture Frame</button>}
          {data.type === 'screenshot' && (
            <div className="flex gap-2 mr-4 border-r border-gray-800 pr-4">
              <button 
                disabled={isSaving} 
                onClick={() => saveAnnotated(true)} 
                className="px-3 py-1.5 bg-gray-800 text-[10px] font-bold rounded-lg border border-gray-700 uppercase hover:bg-gray-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Overwrite'}
              </button>
              <button 
                disabled={isSaving} 
                onClick={() => saveAnnotated(false)} 
                className="px-3 py-1.5 bg-cyan-600 text-[10px] font-bold rounded-lg uppercase hover:bg-cyan-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Copy'}
              </button>
            </div>
          )}
          <button onClick={() => window.close()} className="px-3 py-1.5 text-gray-400 hover:text-white text-[10px] font-bold uppercase transition-colors">Close</button>
        </div>
      </div>

      {data.type === 'screenshot' && (
        <div className="px-6 py-2 bg-gray-800/50 border-b border-gray-800 flex items-center gap-6 shrink-0">
          <div className="flex items-center bg-gray-900 rounded-lg p-1 border border-gray-700">
            {(['select', 'pen', 'rect', 'arrow', 'text', 'arrow-text', 'highlight'] as Tool[]).map(t => (
              <button key={t} onClick={() => { setTool(t); setSelectedShapeId(null); }} className={`p-1.5 rounded transition-all ${tool === t ? 'bg-cyan-600' : 'text-gray-400 hover:text-white'}`}>
                {t === 'select' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>}
                {t === 'pen' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>}
                {t === 'rect' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                {t === 'arrow' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
                {t === 'text' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>}
                {t === 'arrow-text' && <div className="flex items-center gap-0.5"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg><span className="text-[8px] font-bold">T</span></div>}
                {t === 'highlight' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 11-6 6v3h9l3-3" /><rect x="13" y="2" width="8" height="8" rx="2" /></svg>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3"><span className="text-[9px] font-bold text-gray-500 uppercase">Color</span>
            <div className="flex gap-1">{['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#000000'].map(c => (<button key={c} onClick={() => setColor(c)} className={`w-4 h-4 rounded-full border ${color === c ? 'ring-2 ring-cyan-400 scale-110' : 'opacity-60'}`} style={{ backgroundColor: c }} />))}</div>
          </div>
          <div className="flex items-center gap-3"><span className="text-[9px] font-bold text-gray-500 uppercase">Stroke</span><input type="range" min="1" max="15" value={strokeWidth} onChange={e => setStrokeWidth(parseInt(e.target.value))} className="w-16 accent-cyan-500" /></div>
          <div className="flex items-center gap-3"><span className="text-[9px] font-bold text-gray-500 uppercase">Font</span><input type="range" min="12" max="100" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-16 accent-cyan-500" /></div>
          <div className="flex-1" /><button onClick={() => { if(confirm('Clear all?')) setShapes([]); }} className="text-gray-500 hover:text-red-400 text-[9px] font-bold uppercase">Clear All</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 overflow-auto flex items-center justify-center bg-black/40 relative" onMouseDown={startInteraction} onMouseMove={handleMouseMove} onMouseUp={endInteraction} onDoubleClick={handleDoubleClick}>
            <div className="relative">
              {data.url && <img ref={imgRef} src={data.url} onLoad={handleImageLoad} className="max-w-full max-h-full border border-gray-800 shadow-2xl block" alt="Preview" />}
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }} />
              {mode === 'editing' && selectedShape && (
                <textarea ref={textInputRef} autoFocus className="absolute bg-black/80 text-white border-none outline-none p-2 resize-none rounded shadow-xl font-bold text-center" style={{ left: selectedShape.x - 100, top: selectedShape.y - 50, width: 200, height: 100, fontSize: selectedShape.fontSize, color: selectedShape.color }} value={selectedShape.text} onChange={e => updateText(e.target.value)} onBlur={() => setInteractionMode('none')} />
              )}
            </div>
          </div>
          {/* Shortcuts Info Footer */}
          <div className="px-6 py-1.5 bg-gray-900 border-t border-gray-800 flex items-center gap-4 shrink-0 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
            <span className="text-gray-400">Shortcuts:</span>
            <span>[V] Select</span> <span>[P] Pen</span> <span>[R] Rect</span> <span>[A] Arrow</span> <span>[T] Text</span> <span>[DEL] Delete</span> <span>[ESC] Deselect</span> <span>[Ctrl+S] Save</span>
          </div>
        </div>

        <div className={`bg-gray-900 border-l border-gray-800 flex flex-col transition-all duration-300 ${isLayersOpen ? 'w-56' : 'w-10'}`}>
          <button onClick={() => setIsLayersOpen(!isLayersOpen)} className="p-3 border-b border-gray-800 hover:bg-gray-800 flex items-center justify-between">
            {isLayersOpen && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Layers ({shapes.length})</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isLayersOpen ? '' : 'rotate-180'}><path d="m15 18-6-6 6-6" /></svg>
          </button>
          {isLayersOpen && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="mb-2 px-1 flex gap-1">
                <button onClick={groupSelected} disabled={!selectedShapeId} className="flex-1 py-1 bg-gray-800 border border-gray-700 rounded text-[8px] font-bold hover:bg-gray-700 disabled:opacity-30">GROUP SELECTED</button>
              </div>
              {shapes.map((s, idx) => (
                <div key={s.id} draggable onDragStart={() => setDraggedLayerIdx(idx)} onDragOver={(e) => { e.preventDefault(); if (draggedLayerIdx !== null && draggedLayerIdx !== idx) { moveLayer(draggedLayerIdx, idx); setDraggedLayerIdx(idx); } }} onClick={() => setSelectedShapeId(s.id)} className={`p-2 rounded text-[10px] font-medium flex items-center justify-between group cursor-grab border ${selectedShapeId === s.id ? 'bg-cyan-900/30 text-cyan-400 border-cyan-800/50' : 'text-gray-400 hover:bg-gray-800 border-transparent'}`}>
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="truncate uppercase">{s.groupId ? '📦 ' : ''}{s.type} {s.text && `: ${s.text}`}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteShape(s.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg></button>
                </div>
              )).reverse()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PreviewApp /></React.StrictMode>);
