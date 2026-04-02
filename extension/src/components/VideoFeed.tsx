import { useState } from 'react';
import type { VideoClip } from '../types';

interface VideoFeedProps {
  clips: VideoClip[];
  isRecording: boolean;
  liveDuration: number;
  error: string | null;
  onDownload: (clip: VideoClip) => void;
  onDiscard: (id: string) => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoFeed({ clips, isRecording, liveDuration, error, onDownload, onDiscard }: VideoFeedProps) {
  const [enlargedUrl, setEnlargedUrl] = useState<string | null>(null);

  if (clips.length === 0 && !isRecording && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mb-2">
          <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 5a2 2 0 012-2h7a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V5zm12 .5l4-2v9l-4-2v-5z"/>
          </svg>
        </div>
        <p className="text-xs text-gray-500 font-medium">No recordings yet</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Click VID to start recording</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-y-auto">
        {/* Live recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-2 bg-pink-50 border-b border-pink-100">
            <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
            <span className="text-xs text-pink-700 font-medium flex-1">Recording...</span>
            <span className="text-xs font-mono text-pink-500">{formatDuration(liveDuration)}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 text-[11px] text-red-500 bg-red-50 border-b border-red-100">
            {error}
          </div>
        )}

        {/* Clips */}
        {clips.map(clip => (
          <div key={clip.id} className="border-b border-gray-100 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              {/* Thumbnail */}
              <div
                className="relative w-20 h-12 bg-gray-900 rounded overflow-hidden flex-shrink-0 cursor-pointer group"
                onClick={() => setEnlargedUrl(clip.url)}
              >
                <video src={clip.url} className="w-full h-full object-cover" preload="metadata" />
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2l10 6-10 6V2z"/>
                  </svg>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 font-medium">Recording</p>
                <p className="text-[10px] text-gray-400">
                  {formatDuration(clip.durationSec)} &middot; {new Date(clip.createdAt).toLocaleTimeString()}
                </p>
              </div>

              {/* Actions */}
              <button
                onClick={() => setEnlargedUrl(clip.url)}
                className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                title="Enlarge"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 1h5v1H2.707l3.147 3.146-.708.708L2 2.707V6H1V1zm13 0v5h-1V2.707l-3.146 3.147-.708-.708L12.293 2H9V1h5zM1 15h5v-1H2.707l3.147-3.146-.708-.708L2 13.293V10H1v5zm13 0h-5v-1h3.293l-3.147-3.146.708-.708L13 13.293V10h1v5z"/>
                </svg>
              </button>
              <button
                onClick={() => onDownload(clip)}
                className="text-gray-400 hover:text-green-500 transition-colors p-1"
                title="Download"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/>
                  <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/>
                </svg>
              </button>
              <button
                onClick={() => onDiscard(clip.id)}
                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                title="Discard"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Enlarge modal */}
      {enlargedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEnlargedUrl(null)}
        >
          <div
            className="relative bg-black rounded-lg overflow-hidden max-w-full max-h-full"
            onClick={e => e.stopPropagation()}
          >
            <video
              src={enlargedUrl}
              controls
              autoPlay
              className="max-w-[90vw] max-h-[85vh] rounded"
            />
            <button
              onClick={() => setEnlargedUrl(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
