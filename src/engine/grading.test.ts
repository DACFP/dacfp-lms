import { describe, expect, it } from 'vitest';
import {
  InvalidQuizSubmission,
  exactSetMatch,
  normalizeAnswers,
  scoreAnswers,
  type GradingQuestion,
} from './grading';

const questions: GradingQuestion[] = [
  {
    id: 'q1',
    choices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    correct: ['a'],
    points: 2,
  },
  {
    id: 'q2',
    choices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    correct: ['b', 'c'],
    points: 3,
  },
];

describe('quiz grading inputs', () => {
  it.each([
    ['non-array answer', { q1: 'a' }],
    ['foreign question id', { q1: ['a'], foreign: ['a'] }],
    ['foreign choice id', { q1: ['foreign'] }],
    ['duplicate choices', { q1: ['a', 'a'] }],
  ])('rejects %s', (_label, answers) => {
    expect(() => normalizeAnswers(answers, questions)).toThrow(
      InvalidQuizSubmission,
    );
  });

  it('normalizes valid answer sets and leaves unanswered questions empty', () => {
    expect(normalizeAnswers({ q1: ['a'] }, questions)).toEqual({
      q1: ['a'],
      q2: [],
    });
  });

  it('matches exact sets independent of order and rejects partial or extra sets', () => {
    expect(exactSetMatch(['b', 'c'], ['c', 'b'])).toBe(true);
    expect(exactSetMatch(['b'], ['b', 'c'])).toBe(false);
    expect(exactSetMatch(['a', 'b'], ['a'])).toBe(false);
  });

  it('scores weighted points without partial credit', () => {
    const answers = normalizeAnswers({ q1: ['a'], q2: ['b'] }, questions);
    expect(scoreAnswers(answers, questions)).toEqual({
      score: 2,
      possiblePoints: 5,
    });
  });
});
