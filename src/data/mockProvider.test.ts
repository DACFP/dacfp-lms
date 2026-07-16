import { describe, expect, it } from 'vitest';
import { mockCatalog, mockProvider } from './mockProvider';
import { learnerStateKeys } from './types';

describe('mockProvider synthetic catalog', () => {
  it('implements all six named learner states', async () => {
    const learners = await mockProvider.listLearners();
    expect(learners.map((learner) => learner.id)).toEqual(learnerStateKeys);
  });

  it('contains the three required sandbox courses and the expected structure', () => {
    expect(mockCatalog.courses.map((course) => course.slug)).toEqual([
      'fpt-sandbox',
      'bonus-sandbox',
      'renewal-2026-sandbox',
    ]);
    expect(mockCatalog.modules.filter((module) => module.course_id === 'course-fpt')).toHaveLength(4);
    expect(mockCatalog.modules.filter((module) => module.course_id === 'course-bonus')).toHaveLength(3);
    expect(mockCatalog.modules.filter((module) => module.course_id === 'course-renewal-2026')).toHaveLength(1);
    expect(mockCatalog.quizzes.filter((quiz) => quiz.module_id.startsWith('fpt-'))).toHaveLength(4);
    expect(mockCatalog.quizzes.filter((quiz) => quiz.module_id.startsWith('bonus-'))).toHaveLength(0);
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
});
