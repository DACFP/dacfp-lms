import { describe, expect, it } from 'vitest';
import {
  buildLearnerSnapshot,
  learnerSummaryForEmail,
  quizQuestionsContainCorrectKey,
  quizQuestionsHaveValidSelectionKind,
} from './supabaseProvider';

describe('supabaseProvider row mapping', () => {
  it.each([
    ['fresh@example.test', 'fresh'],
    ['midmodule@example.test', 'mid-module-2'],
    ['failedquiz@example.test', 'quiz-failed-on-3'],
    ['almostdone@example.test', 'one-quiz-from-done'],
    ['fptcomplete@example.test', 'fpt-completed'],
    ['complete@example.test', 'fully-complete'],
  ] as const)('maps %s to the seeded learner state %s', (email, state) => {
    expect(learnerSummaryForEmail(email.toUpperCase(), '').id).toBe(state);
  });

  it('joins completion events to course ids without exposing quiz questions', () => {
    const snapshot = buildLearnerSnapshot({
      email: 'complete@example.test',
      profile: {
        auth_user_id: 'auth-complete',
        display_name: 'Fully complete',
        credential_ids: { cfp: 'SYNTH-CFP-1042' },
        created_at: '2026-07-16T16:00:00.000Z',
        updated_at: '2026-07-16T16:00:00.000Z',
      },
      enrollments: [
        {
          id: 'enrollment-fpt',
          person_email: 'complete@example.test',
          auth_user_id: 'auth-complete',
          course_id: 'course-fpt',
          source: 'synthetic',
          enrolled_at: '2026-07-16T16:00:00.000Z',
          expires_at: '2027-07-16T23:59:59.000Z',
          status: 'active',
          terms_accepted_at: '2026-07-16T16:05:00.000Z',
          order_id: null,
        },
      ],
      progress: [],
      attempts: [],
      completions: [
        {
          id: 'completion-fpt',
          enrollment_id: 'enrollment-fpt',
          completed_at: '2026-07-16T17:00:00.000Z',
          trigger: 'all_requirements_met',
          processed_at: null,
          designation_issued: false,
        },
      ],
    });

    expect(snapshot.learner.id).toBe('fully-complete');
    expect(snapshot.profile.email).toBe('complete@example.test');
    expect(snapshot.completions).toEqual([
      expect.objectContaining({ course_id: 'course-fpt' }),
    ]);
    expect(snapshot).not.toHaveProperty('questions');
  });

  it('detects a correct key without false-positive prompt text', () => {
    expect(
      quizQuestionsContainCorrectKey([
        { id: 'question-1', prompt: 'Which answer is "correct"?' },
      ]),
    ).toBe(false);
    expect(
      quizQuestionsContainCorrectKey([
        { id: 'question-1', prompt: 'Question', correct: ['a'] },
      ]),
    ).toBe(true);
  });

  it('requires only the learner-safe single or multi selection hint', () => {
    expect(quizQuestionsHaveValidSelectionKind([
      { id: 'one', select_kind: 'single' },
      { id: 'many', select_kind: 'multi' },
    ])).toBe(true);
    expect(quizQuestionsHaveValidSelectionKind([
      { id: 'missing' },
    ])).toBe(false);
    expect(quizQuestionsHaveValidSelectionKind([
      { id: 'invalid', select_kind: 'all' },
    ])).toBe(false);
  });
});
