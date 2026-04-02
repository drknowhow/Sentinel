import { useState, useRef, useCallback, useEffect } from 'react';
import type { VideoClip } from '../types';
import { getActiveProjectId } from '../lib/storage';

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes


export function useVideoRecorder() {
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!chrome.tabCapture?.getMediaStreamId) {
      setError('Tab capture not available (Chrome 116+ required)');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_CAPTURE_STREAM_ID' });
      if (!response || response.error) {
        setError(response?.error || 'Failed to get capture stream');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: response.streamId,
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
        ? 'video/webm; codecs=vp9'
        : 'video/webm; codecs=vp8';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_000_000,
      });

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          getActiveProjectId().then(projectId => {
            const clip: VideoClip = {
              id: Date.now().toString(36),
              url: URL.createObjectURL(blob),
              durationSec: finalDuration,
              createdAt: Date.now(),
              projectId: projectId || undefined,
            };
            setClips(prev => [...prev, clip]);
          });
        }

        setIsVideoRecording(false);
        setLiveDurationSec(0);
      };

      recorderRef.current = recorder;
      recorder.start(1000);

      startTimeRef.current = Date.now();
      setLiveDurationSec(0);
      setIsVideoRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setLiveDurationSec(elapsed);
        if (elapsed * 1000 >= MAX_DURATION_MS) {
          recorder.stop();
        }
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isVideoRecording) stopRecording(); else startRecording();
  }, [isVideoRecording, startRecording, stopRecording]);

  const downloadClip = useCallback((clip: VideoClip) => {
    chrome.downloads.download({
      url: clip.url,
      filename: `sentinel-recording-${clip.id}.webm`,
      saveAs: true,
    });
  }, []);

  const discardClip = useCallback((id: string) => {
    setClips(prev => {
      const clip = prev.find(c => c.id === id);
      if (clip) URL.revokeObjectURL(clip.url);
      return prev.filter(c => c.id !== id);
    });
  }, []);

  const discardAll = useCallback(() => {
    clips.forEach(c => URL.revokeObjectURL(c.url));
    setClips([]);
  }, [clips]);

  return {
    isVideoRecording,
    liveDurationSec,
    clips,
    error,
    toggleRecording,
    downloadClip,
    discardClip,
    discardAll,
  };
}
