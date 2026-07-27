import { describe, expect, it } from 'vitest';
import type { QuestionBank, QuestionBankRow } from '../data/admin';
import {
  moduleSelectorForPosition,
  parseQuestionBankJson,
  serializeQuestionBankJson,
} from './adminCsv';

function bank(): QuestionBank {
  const questions: QuestionBankRow[] = Array.from({ length: 10 }, (_, index) => ({
    position: index + 1,
    prompt: `Synthetic renewal question ${index + 1}?`,
    choices: Array.from(
      { length: index === 0 ? 7 : 4 },
      (_, choiceIndex) => ({
        id: `choice_${choiceIndex + 1}`,
        text: `Synthetic choice ${choiceIndex + 1}`,
      }),
    ),
    correct: index === 1 ? ['choice_1', 'choice_3'] : ['choice_1'],
  }));
  return {
    format: 'dacfp-question-bank-v1',
    modules: { module_01: { questions } },
  };
}

describe('admin question-bank policy', () => {
  it('round-trips a 7-choice and multi-answer bank byte for byte', () => {
    const json = serializeQuestionBankJson(bank());
    const parsed = parseQuestionBankJson(json, 'module_01');
    expect(parsed.questions[0].choices).toHaveLength(7);
    expect(parsed.questions[1].correct).toEqual(['choice_1', 'choice_3']);
    expect(serializeQuestionBankJson({
      format: 'dacfp-question-bank-v1',
      modules: { [parsed.module_selector]: { questions: parsed.questions } },
    })).toBe(json);
  });

  it('accepts a single module questions array', () => {
    const questions = bank().modules.module_01.questions;
    expect(parseQuestionBankJson(JSON.stringify(questions), 'module_07')).toEqual({
      module_selector: 'module_07',
      questions,
    });
  });

  it.each([
    [
      'duplicate choice ids',
      (questions: QuestionBankRow[]) => {
        questions[0].choices[1].id = questions[0].choices[0].id;
      },
      /choice ids must be unique/,
    ],
    [
      'empty correct array',
      (questions: QuestionBankRow[]) => {
        questions[0].correct = [];
      },
      /correct must contain at least one choice id/,
    ],
    [
      'unknown correct id',
      (questions: QuestionBankRow[]) => {
        questions[0].correct = ['not-a-choice'];
      },
      /correct contains unknown choice id "not-a-choice"/,
    ],
  ])('loudly rejects %s', (_label, mutate, message) => {
    const questions = structuredClone(bank().modules.module_01.questions);
    mutate(questions);
    expect(() => parseQuestionBankJson(JSON.stringify(questions), 'module_01')).toThrow(message);
  });

  it('derives the confidential-artifact module selector', () => {
    expect(moduleSelectorForPosition(7)).toBe('module_07');
  });
});
