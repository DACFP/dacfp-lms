import { describe, expect, it } from 'vitest';
import { buildPublicQuestions } from '../../supabase/functions/lms-get-quiz/public-quiz';

describe('deployed lms-get-quiz public payload bridge', () => {
  it('exposes selection cardinality while stripping every answer key', () => {
    const payload = {
      quiz: { id: 'quiz-fixture', question_count: 2, pass_pct: 70 },
      questions: buildPublicQuestions([
        {
          id: 'question-single',
          quiz_id: 'quiz-fixture',
          position: 1,
          prompt: 'Single-answer fixture',
          choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
          correct: ['a'],
          points: 1,
        },
        {
          id: 'question-multi',
          quiz_id: 'quiz-fixture',
          position: 2,
          prompt: 'Multi-answer fixture',
          choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
          correct: ['a', 'b'],
          points: 2,
        },
      ], (items) => [...items]),
    };

    expect(payload.questions.map((question) => question.select_kind)).toEqual([
      'single',
      'multi',
    ]);
    expect(JSON.stringify(payload)).toBe(
      '{"quiz":{"id":"quiz-fixture","question_count":2,"pass_pct":70},"questions":[{"id":"question-single","quiz_id":"quiz-fixture","position":1,"prompt":"Single-answer fixture","choices":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"points":1,"select_kind":"single"},{"id":"question-multi","quiz_id":"quiz-fixture","position":2,"prompt":"Multi-answer fixture","choices":[{"id":"a","text":"A"},{"id":"b","text":"B"}],"points":2,"select_kind":"multi"}]}'
    );
    expect(JSON.stringify(payload)).not.toContain('correct');
  });
});
