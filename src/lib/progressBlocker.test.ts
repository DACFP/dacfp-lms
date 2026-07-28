import { describe, expect, it } from 'vitest';
import { mockCatalog, mockProvider } from '../data/mockProvider';
import { courseProgressionBlocker } from './progress';

describe('course progression blocker guidance', () => {
  it('finds an incomplete required survey in a quiz-less Introduction', async () => {
    const snapshot = await mockProvider.getLearnerSnapshot('fresh');
    const enrollment = snapshot.enrollments.find(
      (item) => item.course_id === 'course-fpt',
    )!;
    snapshot.progress.push({
      id: 'fresh-intro-video-complete',
      enrollment_id: enrollment.id,
      lesson_id: 'fpt-intro-video',
      started_at: '2026-07-16T16:10:00.000Z',
      completed_at: '2026-07-16T16:12:00.000Z',
      last_position_seconds: 120,
      max_watched_seconds: 120,
      max_watched_updated_at: '2026-07-16T16:12:00.000Z',
      updated_at: '2026-07-16T16:12:00.000Z',
    });

    const course = mockCatalog.courses.find((item) => item.id === 'course-fpt')!;
    expect(courseProgressionBlocker(mockCatalog, snapshot, course)).toMatchObject({
      kind: 'lesson',
      module: { id: 'fpt-intro', title: 'Introduction' },
      lesson: { id: 'fpt-pre-course-survey', title: 'Pre-course survey' },
      path: '/lesson/fpt-pre-course-survey',
    });
  });

  it('finds the failed quiz after all of its gating lessons are complete', async () => {
    const snapshot = await mockProvider.getLearnerSnapshot('quiz-failed-on-3');
    const course = mockCatalog.courses.find((item) => item.id === 'course-fpt')!;
    expect(courseProgressionBlocker(mockCatalog, snapshot, course)).toMatchObject({
      kind: 'quiz',
      module: { id: 'fpt-m3', position: 3 },
      quiz: { id: 'quiz-fpt-m3' },
      path: '/quiz/fpt-m3',
    });
  });
});
