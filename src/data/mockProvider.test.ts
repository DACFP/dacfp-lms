import { describe, expect, it } from 'vitest';
import { mockCatalog, mockProvider } from './mockProvider';
import { learnerStateKeys } from './types';

describe('mockProvider synthetic catalog', () => {
  it('implements all six named learner states', async () => {
    // M-10 removed listLearners(), which this asserted through. The property
    // under test is unchanged — every named state resolves to its own distinct
    // snapshot — so it is asserted through the surviving surface instead.
    const snapshots = await Promise.all(
      learnerStateKeys.map((learnerId) => mockProvider.getLearnerSnapshot(learnerId)),
    );
    expect(snapshots).toHaveLength(learnerStateKeys.length);
    expect(new Set(snapshots.map((snapshot) => snapshot.profile.email)).size).toBe(
      learnerStateKeys.length,
    );
  });

  it('contains FPT, six bonus courses, renewal, and the expected structure', () => {
    expect(mockCatalog.courses.map((course) => course.slug)).toEqual([
      'fpt-sandbox',
      'custody-security-sandbox',
      'spot-ethereum-etfs-sandbox',
      'nfts-sandbox',
      'defi-daos-sandbox',
      'staking-lending-borrowing-sandbox',
      'genius-act-sandbox',
      'renewal-2026-sandbox',
    ]);
    expect(mockCatalog.modules.filter((module) => module.course_id === 'course-fpt')).toHaveLength(5);
    expect(mockCatalog.courses.filter((course) => course.id.startsWith('course-bonus-'))).toHaveLength(6);
    expect(mockCatalog.modules.filter((module) => module.course_id.startsWith('course-bonus-'))).toHaveLength(6);
    expect(mockCatalog.courses.filter((course) => course.id.startsWith('course-bonus-')).every((course) => course.cfp_program_id)).toBe(true);
    expect(mockCatalog.modules.filter((module) => module.course_id === 'course-renewal-2026')).toHaveLength(1);
    expect(mockCatalog.quizzes.filter((quiz) => quiz.module_id.startsWith('fpt-'))).toHaveLength(4);
    expect(mockCatalog.quizzes.filter((quiz) => quiz.module_id.startsWith('bonus-'))).toHaveLength(0);
    expect(mockCatalog.modules.find((module) => module.id === 'fpt-intro')?.position).toBe(0);
    expect(mockCatalog.lessons.filter((lesson) => lesson.kind === 'survey')).toHaveLength(3);
    expect(mockCatalog.surveySections).toHaveLength(8);
    expect(mockCatalog.surveyQuestions).toHaveLength(11);
  });

  it('uses only clearly synthetic learner identities and enrollment sources', async () => {
    for (const learnerId of learnerStateKeys) {
      const snapshot = await mockProvider.getLearnerSnapshot(learnerId);
      expect(snapshot.profile.email).toMatch(/@example\./);
      expect(snapshot.enrollments.every((item) => item.source === 'synthetic')).toBe(true);
    }
  });

  it('never includes an answer-key field in learner-facing mock payloads', async () => {
    const snapshot = await mockProvider.getLearnerSnapshot('quiz-failed-on-3');
    expect(JSON.stringify({ catalog: mockCatalog, snapshot })).not.toContain('"correct"');
  });

  it('keeps video progress monotonic and completes at the 95% boundary', async () => {
    const almostComplete = await mockProvider.recordHeartbeat(
      'fpt-m1-video',
      570,
      'fresh',
    );
    const rewound = await mockProvider.recordHeartbeat(
      'fpt-m1-video',
      10,
      'fresh',
    );

    expect(almostComplete.completed_at).not.toBeNull();
    expect(rewound.last_position_seconds).toBe(10);
    expect(rewound.max_watched_seconds).toBe(570);
    expect(rewound.completed_at).toBe(almostComplete.completed_at);
  });

  it('returns a learner-safe quiz payload with no answer-key field', async () => {
    const payload = await mockProvider.getQuiz('quiz-fpt-m1', 'fresh');
    expect(payload.questions).toHaveLength(10);
    expect(payload.questions.every((question) => question.select_kind === 'single')).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('"correct"');
  });

  it('keeps survey submission idempotent and preserves the first response', async () => {
    const first = await mockProvider.submitSurvey(
      'fpt-pre-course-survey',
      {
        answers: {
          'survey-pre-q1': 3,
          'survey-pre-gate': 'non-owner',
          'survey-pre-non-owner-reason': 'Synthetic reason',
          'survey-pre-q2': 'First response',
        },
        choice_free_text: {},
        path: ['survey-pre-spine', 'survey-pre-non-owner', 'survey-pre-tail'],
      },
      'fresh',
    );
    const second = await mockProvider.submitSurvey(
      'fpt-pre-course-survey',
      {
        answers: {
          'survey-pre-q1': 5,
          'survey-pre-gate': 'other',
          'survey-pre-q2': 'Replacement response',
        },
        choice_free_text: {
          'survey-pre-gate': { other: 'Synthetic other path' },
        },
        path: ['survey-pre-spine', 'survey-pre-other', 'survey-pre-tail'],
      },
      'fresh',
    );

    expect(first.already_submitted).toBe(false);
    expect(second.already_submitted).toBe(true);
    expect(second.response.id).toBe(first.response.id);
    expect(second.response.answers['survey-pre-q2']).toBe('First response');
  });
});
