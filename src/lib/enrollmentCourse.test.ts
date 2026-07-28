import { describe, expect, it } from 'vitest';
import type { Catalog, LearnerSnapshot, LmsEnrollment } from '../data/types';
import {
  courseForEnrollment,
  expiredEnrollmentForLesson,
} from './enrollmentCourse';

const emptyCatalog: Catalog = {
  courses: [],
  modules: [],
  lessons: [],
  resources: [],
  quizzes: [],
  surveySections: [],
  surveyQuestions: [],
};

const expiredEnrollment: LmsEnrollment = {
  id: 'expired-fpt-enrollment',
  person_email: 'midmodule@example.test',
  auth_user_id: 'auth-midmodule',
  course_id: 'course-fpt',
  source: 'synthetic',
  enrolled_at: '2025-06-28T00:00:00.000Z',
  expires_at: '2026-06-28T00:00:00.000Z',
  status: 'expired',
  terms_accepted_at: '2025-06-28T00:00:00.000Z',
  order_id: null,
  course_summary: {
    course_id: 'course-fpt',
    slug: 'fpt-sandbox',
    title: 'Financial Professional Track',
    status: 'published',
    prerequisite_course_id: null,
  },
};

it('resolves only expired enrollment identity when content RLS hides catalog rows', () => {
  expect(courseForEnrollment(emptyCatalog, expiredEnrollment)).toEqual(
    expect.objectContaining({
      id: 'course-fpt',
      slug: 'fpt-sandbox',
      title: 'Financial Professional Track',
    }),
  );
  expect(
    courseForEnrollment(emptyCatalog, { ...expiredEnrollment, status: 'revoked' }),
  ).toBeNull();
});

it('maps a hidden previously visited lesson back to its expired enrollment', () => {
  const snapshot = {
    enrollments: [expiredEnrollment],
    progress: [
      {
        id: 'progress-1',
        enrollment_id: expiredEnrollment.id,
        lesson_id: 'lesson-1',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        last_position_seconds: 30,
        max_watched_seconds: 30,
        max_watched_updated_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  } as LearnerSnapshot;

  expect(expiredEnrollmentForLesson(snapshot, 'lesson-1')).toBe(expiredEnrollment);
  expect(expiredEnrollmentForLesson(snapshot, 'lesson-never-visited')).toBeNull();
});
