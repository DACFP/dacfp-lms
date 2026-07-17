import { describe, expect, it } from 'vitest';
import type { QuestionBank } from '../data/admin';
import {
  parseQuestionBankCsv,
  parseQuestionBankJson,
  serializeQuestionBankCsv,
} from './adminCsv';

function bank(): QuestionBank {
  return {
    pass_pct: 70,
    questions: Array.from({ length: 10 }, (_, index) => ({
      position: index + 1,
      prompt: `Renewal question ${index + 1}, with context?`,
      choice_a: 'Choice A',
      choice_b: 'Choice B',
      choice_c: 'Choice C',
      choice_d: 'Choice D',
      correct: 'a' as const,
      points: 1,
    })),
  };
}

describe('admin question-bank policy', () => {
  it('round-trips the canonical CSV byte for byte', () => {
    const csv = serializeQuestionBankCsv(bank());
    expect(serializeQuestionBankCsv(parseQuestionBankCsv(csv))).toBe(csv);
  });

  it('rejects a CSV pass_pct other than 70', () => {
    const csv = serializeQuestionBankCsv(bank()).replace(
      'position,prompt',
      'pass_pct,position,prompt',
    ).replace(/\n/g, (line, offset) => offset === 0 ? line : line);
    const lines = csv.trimEnd().split('\n');
    const withPolicy = [lines[0], ...lines.slice(1).map((line) => `80,${line}`)].join('\n');
    expect(() => parseQuestionBankCsv(withPolicy)).toThrow(/must remain 70/);
  });

  it('rejects a JSON pass_pct other than 70', () => {
    expect(() => parseQuestionBankJson(JSON.stringify({ ...bank(), pass_pct: 80 }))).toThrow(/must remain 70/);
  });
});
