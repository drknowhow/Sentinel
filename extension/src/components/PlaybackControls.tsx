import { sendMessage } from '../lib/messages';
import type { PlaybackState } from '../types';

interface PlaybackControlsProps {
  playback: PlaybackState | null;
  hasActions: boolean;
  isRecording: boolean;
}

export default function PlaybackControls({ playback }: PlaybackControlsProps) {
  const isPlaying = playback?.isPlaying ?? false;
  const isPaused = playback?.isPaused ?? false;
  const currentStep = playback?.currentStep ?? 0;
  const totalSteps = playback?.totalSteps ?? 0;
  const stepByStep = playback?.stepByStep ?? false;
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  if (!isPlaying) return null;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 text-center">
        Step {currentStep} / {totalSteps}
      </p>

      <div className="flex gap-2">
        {isPaused ? (
          <button
            onClick={() => sendMessage('RESUME_PLAYBACK')}
            className="flex-1 py-2 rounded text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            Resume
          </button>
        ) : (
          <button
            onClick={() => sendMessage('PAUSE_PLAYBACK')}
            className="flex-1 py-2 rounded text-sm font-semibold text-white bg-yellow-500 hover:bg-yellow-600 transition-colors"
          >
            Pause
          </button>
        )}
        <button
          onClick={() => sendMessage('STOP_PLAYBACK')}
          className="flex-1 py-2 rounded text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
        >
          Stop
        </button>
      </div>

      {stepByStep && isPaused && (
        <button
          onClick={() => sendMessage('NEXT_STEP')}
          className="w-full py-2 rounded text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Next Step
        </button>
      )}
    </div>
  );
}
