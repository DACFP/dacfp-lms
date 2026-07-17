import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LmsPlaybackToken } from '../data/provider';
import type { LmsCourse, LmsLesson, LmsLessonProgress } from '../data/types';
import { LessonPlayer } from './LessonPlayer';

const lms = vi.hoisted(() => ({
  requestPlayback: vi.fn(),
  recordHeartbeat: vi.fn(),
}));

vi.mock('../context/LmsContext', () => ({
  useLms: () => lms,
}));

const course: LmsCourse = {
  id: 'course-fpt',
  slug: 'fpt-sandbox',
  title: 'FPT Sandbox',
  description: 'Synthetic',
  status: 'published',
  progression: 'sequential',
  prerequisite_course_id: null,
  ce_credits: 18,
  requires_terms_acceptance: false,
  created_at: '2026-07-16T00:00:00.000Z',
};

function lesson(id: string): LmsLesson {
  return {
    id,
    module_id: 'module-1',
    position: 1,
    title: id,
    kind: 'video',
    video_ref: `placeholder/${id}.mp4`,
    duration_seconds: 600,
    body_md: null,
    is_required: true,
  };
}

function progress(lessonId: string, position: number): LmsLessonProgress {
  return {
    id: `progress-${lessonId}`,
    enrollment_id: 'enrollment-1',
    lesson_id: lessonId,
    started_at: '2026-07-16T00:00:00.000Z',
    completed_at: null,
    last_position_seconds: position,
    max_watched_seconds: position,
    max_watched_updated_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
  };
}

function token(lessonId: string, maxWatched: number): LmsPlaybackToken {
  return {
    url: `https://sandbox.invalid/${lessonId}?token=signed`,
    expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    max_watched_seconds: maxWatched,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  lms.requestPlayback.mockReset();
  lms.recordHeartbeat.mockReset();
});

/** The resume position now lives in the <dd> beside its <dt> (brief #7). */
function resumeValue() {
  return screen.getByText('Resume at').nextElementSibling?.textContent;
}

describe('LessonPlayer lifecycle', () => {
  it('starts a different keyed lesson with its own resume and watermark', async () => {
    lms.requestPlayback.mockImplementation(async (lessonId: string) =>
      token(lessonId, lessonId === 'lesson-a' ? 120 : 5));
    lms.recordHeartbeat.mockImplementation(async (lessonId: string, position: number) =>
      progress(lessonId, position));

    const { rerender } = render(
      <LessonPlayer key="lesson-a" course={course} lesson={lesson('lesson-a')} progress={progress('lesson-a', 120)} />,
    );
    await waitFor(() => expect(lms.requestPlayback).toHaveBeenCalledWith('lesson-a'));
    // brief #7 retired the raw-seconds format ("120s") for mm:ss through the
    // one shared formatter, and the chrome moved from a sentence to a <dl>.
    // The property under test is unchanged: each keyed lesson shows its own
    // resume position.
    expect(resumeValue()).toBe('2:00');

    rerender(
      <LessonPlayer key="lesson-b" course={course} lesson={lesson('lesson-b')} progress={progress('lesson-b', 5)} />,
    );
    await waitFor(() => expect(lms.requestPlayback).toHaveBeenCalledWith('lesson-b'));
    expect(resumeValue()).toBe('0:05');

    const video = screen.getByLabelText('lesson-b video') as HTMLVideoElement;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(5);
  });

  it('keeps one trailing heartbeat when a newer save arrives in flight', async () => {
    let releaseFirst: ((value: LmsLessonProgress) => void) | undefined;
    lms.requestPlayback.mockResolvedValue(token('lesson-a', 0));
    lms.recordHeartbeat
      .mockImplementationOnce((lessonId: string, position: number) =>
        new Promise<LmsLessonProgress>((resolve) => {
          releaseFirst = () => resolve(progress(lessonId, position));
        }))
      .mockImplementation(async (lessonId: string, position: number) =>
        progress(lessonId, position));

    render(<LessonPlayer course={course} lesson={lesson('lesson-a')} progress={progress('lesson-a', 0)} />);
    const video = await screen.findByLabelText('lesson-a video') as HTMLVideoElement;
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(lms.recordHeartbeat).toHaveBeenCalledTimes(1));

    video.currentTime = 25;
    fireEvent.pause(video);
    expect(lms.recordHeartbeat).toHaveBeenCalledTimes(1);

    await act(async () => releaseFirst?.(progress('lesson-a', 0)));
    await waitFor(() => expect(lms.recordHeartbeat).toHaveBeenCalledTimes(2));
    expect(lms.recordHeartbeat).toHaveBeenLastCalledWith('lesson-a', 25);
  });

  it('clears its heartbeat and expiry timers on unmount', async () => {
    vi.useFakeTimers();
    lms.requestPlayback.mockResolvedValue(token('lesson-a', 0));
    lms.recordHeartbeat.mockImplementation(async (lessonId: string, position: number) =>
      progress(lessonId, position));

    const rendered = render(
      <LessonPlayer course={course} lesson={lesson('lesson-a')} progress={progress('lesson-a', 0)} />,
    );
    await act(async () => Promise.resolve());
    const video = screen.getByLabelText('lesson-a video');
    fireEvent.play(video);
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2);

    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
