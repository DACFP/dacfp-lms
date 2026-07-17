import { Gauge, RefreshCw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLms } from '../context/LmsContext';
import type {
  LmsCourse,
  LmsLesson,
  LmsLessonProgress,
} from '../data/types';
import { allowedPlaybackRate, clampSeekTarget } from '../lib/player';
import { Alert } from './Alert';
import { ProgressBar } from './common';

const HEARTBEAT_INTERVAL_MS = 15_000;
const TOKEN_EXPIRY_GRACE_MS = 250;

interface QueuedHeartbeat {
  positionSeconds: number;
  allowAfterUnmount: boolean;
}

export function LessonPlayer({
  course,
  lesson,
  progress,
}: {
  course: LmsCourse;
  lesson: LmsLesson;
  progress: LmsLessonProgress | undefined;
}) {
  const { requestPlayback, recordHeartbeat } = useLms();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const heartbeatInFlight = useRef(false);
  const queuedHeartbeat = useRef<QueuedHeartbeat | null>(null);
  const active = useRef(false);
  const playbackRequestId = useRef(0);
  const errorRefreshAttempted = useRef(false);
  const sourceRef = useRef('');
  const furthestWatched = useRef(progress?.max_watched_seconds ?? 0);
  const pendingResume = useRef(progress?.last_position_seconds ?? 0);
  const resumePlaying = useRef(false);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedMax, setSavedMax] = useState(
    progress?.max_watched_seconds ?? 0,
  );
  const [message, setMessage] = useState('Requesting secure playback…');
  const [error, setError] = useState('');

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimer.current !== null) {
      window.clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  const persistHeartbeat = useCallback(
    async (positionSeconds?: number, allowAfterUnmount = false) => {
      const video = videoRef.current;
      if (!active.current && !allowAfterUnmount) return;
      if (!video && positionSeconds === undefined) return;
      const position = Math.max(
        0,
        Math.floor(positionSeconds ?? video?.currentTime ?? 0),
      );
      if (heartbeatInFlight.current) {
        queuedHeartbeat.current = {
          positionSeconds: position,
          allowAfterUnmount:
            allowAfterUnmount ||
            (queuedHeartbeat.current?.allowAfterUnmount ?? false),
        };
        return;
      }
      heartbeatInFlight.current = true;
      try {
        const next = await recordHeartbeat(
          lesson.id,
          position,
        );
        furthestWatched.current = Math.max(
          furthestWatched.current,
          next.max_watched_seconds,
        );
        if (active.current) {
          setSavedMax((current) => Math.max(current, next.max_watched_seconds));
          setMessage(
            next.completed_at ? 'Lesson complete.' : 'Progress saved.',
          );
          setError('');
        }
      } catch {
        if (active.current) {
          setError('Progress could not be saved. Playback may continue while you retry.');
        }
      } finally {
        heartbeatInFlight.current = false;
        const queued = queuedHeartbeat.current;
        queuedHeartbeat.current = null;
        if (queued && (active.current || queued.allowAfterUnmount)) {
          void persistHeartbeat(
            queued.positionSeconds,
            queued.allowAfterUnmount,
          );
        }
      }
    },
    [lesson.id, recordHeartbeat],
  );

  const fetchPlayback = useCallback(async () => {
    if (!active.current) return;
    const requestId = playbackRequestId.current + 1;
    playbackRequestId.current = requestId;
    const video = videoRef.current;
    if (video && sourceRef.current) {
      pendingResume.current = video.currentTime;
      resumePlaying.current = !video.paused && !video.ended;
    }
    setLoading(true);
    setMessage(sourceRef.current ? 'Refreshing secure playback…' : 'Requesting secure playback…');
    setError('');
    try {
      const token = await requestPlayback(lesson.id);
      if (!active.current || requestId !== playbackRequestId.current) return;
      furthestWatched.current = Math.max(
        furthestWatched.current,
        token.max_watched_seconds,
      );
      setSavedMax((current) => Math.max(current, token.max_watched_seconds));
      sourceRef.current = token.url;
      setSource(token.url);
      const refreshIn = Math.max(
        1_000,
        new Date(token.expires_at).getTime() - Date.now() + TOKEN_EXPIRY_GRACE_MS,
      );
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
      refreshTimer.current = window.setTimeout(() => {
        void fetchPlayback();
      }, refreshIn);
    } catch {
      if (!active.current || requestId !== playbackRequestId.current) return;
      setError('This lesson is unavailable right now.');
      setMessage('Secure playback unavailable.');
    } finally {
      if (active.current && requestId === playbackRequestId.current) {
        setLoading(false);
      }
    }
  }, [lesson.id, requestPlayback]);

  useEffect(() => {
    active.current = true;
    void fetchPlayback();
    return () => {
      const finalPosition = videoRef.current?.currentTime;
      active.current = false;
      playbackRequestId.current += 1;
      clearHeartbeatTimer();
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      if (finalPosition !== undefined) {
        void persistHeartbeat(finalPosition, true);
      }
    };
  }, [clearHeartbeatTimer, fetchPlayback, persistHeartbeat]);

  useEffect(() => {
    const maxWatched = progress?.max_watched_seconds ?? 0;
    furthestWatched.current = Math.max(furthestWatched.current, maxWatched);
    setSavedMax((current) => Math.max(current, maxWatched));
  }, [progress?.max_watched_seconds]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const resumeAt = Math.min(
      pendingResume.current,
      Number.isFinite(video.duration) ? video.duration : pendingResume.current,
    );
    video.currentTime = Math.max(0, resumeAt);
    errorRefreshAttempted.current = false;
    video.playbackRate = allowedPlaybackRate(
      video.playbackRate,
      course.progression,
    );
    setMessage(
      resumeAt > 0 ? `Resumed at ${Math.floor(resumeAt)}s.` : 'Ready to play.',
    );
    void persistHeartbeat(resumeAt);
    if (resumePlaying.current) {
      void video.play().catch(() => undefined);
    }
  }, [course.progression, persistHeartbeat]);

  const handleMediaError = useCallback(() => {
    if (sourceRef.current && !errorRefreshAttempted.current) {
      errorRefreshAttempted.current = true;
      void fetchPlayback();
      return;
    }
    setError('Secure playback could not be loaded.');
  }, [fetchPlayback]);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = allowedPlaybackRate(
      video.playbackRate,
      course.progression,
    );
    clearHeartbeatTimer();
    heartbeatTimer.current = window.setInterval(() => {
      void persistHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    setMessage('Playing securely. Progress saves every 15 seconds.');
  }, [clearHeartbeatTimer, course.progression, persistHeartbeat]);

  const handlePause = useCallback(() => {
    clearHeartbeatTimer();
    void persistHeartbeat();
  }, [clearHeartbeatTimer, persistHeartbeat]);

  const handleEnded = useCallback(() => {
    clearHeartbeatTimer();
    const video = videoRef.current;
    if (video) furthestWatched.current = Math.max(furthestWatched.current, video.currentTime);
    void persistHeartbeat();
  }, [clearHeartbeatTimer, persistHeartbeat]);

  const handleSeeking = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = clampSeekTarget(
      video.currentTime,
      furthestWatched.current,
      course.progression,
    );
    if (Math.abs(clamped - video.currentTime) > 0.05) {
      video.currentTime = clamped;
      setMessage(
        `Forward seeking is available through ${Math.floor(furthestWatched.current)}s.`,
      );
    }
  }, [course.progression]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (
      course.progression === 'open' ||
      video.currentTime <= furthestWatched.current + 2
    ) {
      furthestWatched.current = Math.max(
        furthestWatched.current,
        video.currentTime,
      );
    }
  }, [course.progression]);

  const handleRateChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const allowed = allowedPlaybackRate(video.playbackRate, course.progression);
    if (allowed !== video.playbackRate) {
      video.playbackRate = allowed;
      setMessage('Playback speed is fixed at 1× for this course.');
    }
  }, [course.progression]);

  const watchPercent = lesson.duration_seconds
    ? Math.min(100, Math.round((savedMax / lesson.duration_seconds) * 100))
    : 0;

  return (
    <section aria-labelledby="player-heading" className="card overflow-hidden">
      <div className="relative bg-dacfp-navy">
        <video
          aria-label={`${lesson.title} video`}
          className="aspect-video max-h-[34rem] w-full bg-dacfp-navy"
          controls
          controlsList={course.progression === 'sequential' ? 'nodownload noplaybackrate' : 'nodownload'}
          disablePictureInPicture
          onEnded={handleEnded}
          onError={handleMediaError}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={handlePause}
          onPlay={handlePlay}
          onRateChange={handleRateChange}
          onSeeking={handleSeeking}
          onTimeUpdate={handleTimeUpdate}
          preload="metadata"
          ref={videoRef}
          src={source || undefined}
        />
        <div className="pointer-events-none absolute left-4 top-4 inline-flex min-h-8 items-center gap-2 rounded-md border border-white/20 bg-dacfp-navy/90 px-3 text-xs font-bold uppercase tracking-eyebrow text-white">
          <Gauge className="size-icon-sm" aria-hidden="true" />
          {course.progression === 'sequential'
            ? 'Required · 1× speed'
            : 'Open · flexible speed'}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="player-heading" className="font-bold text-dacfp-navy">
              Secure placeholder player
            </h2>
            <p className="mt-1 text-sm text-dacfp-gray-text" role="status">
              {loading ? 'Loading signed video…' : message}
            </p>
          </div>
          {error ? (
            <button
              className="button-secondary"
              onClick={() => {
                errorRefreshAttempted.current = false;
                void fetchPlayback();
              }}
              type="button"
            >
              <RefreshCw className="size-icon-sm" aria-hidden="true" /> Retry
            </button>
          ) : null}
        </div>
        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
        <div className="mt-5">
          <ProgressBar value={watchPercent} label="Furthest point watched" />
        </div>
        <p className="mt-3 text-sm text-dacfp-gray-text">
          Resume at{' '}
          <span className="font-semibold tabular-nums text-dacfp-navy">
            {progress?.last_position_seconds ?? 0}s
          </span>{' '}
          · Complete at 95%
        </p>
      </div>
    </section>
  );
}
