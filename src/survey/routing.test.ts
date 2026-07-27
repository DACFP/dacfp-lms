import { describe, expect, it } from 'vitest';
import {
  buildSurveyPath,
  normalizeRoutedSubmission,
  SurveyFlowError,
  type RoutedSurveyQuestion,
  type RoutedSurveySection,
} from './routing';

const sections: RoutedSurveySection[] = [
  { id: 'spine', lesson_id: 'survey', position: 1, default_next_section_id: 'tail' },
  { id: 'owner', lesson_id: 'survey', position: 2, default_next_section_id: 'tail' },
  { id: 'owner-platform', lesson_id: 'survey', position: 3, default_next_section_id: 'tail' },
  { id: 'owner-wallet', lesson_id: 'survey', position: 4, default_next_section_id: 'tail' },
  { id: 'non-owner', lesson_id: 'survey', position: 5, default_next_section_id: 'tail' },
  { id: 'other', lesson_id: 'survey', position: 6, default_next_section_id: 'tail' },
  { id: 'tail', lesson_id: 'survey', position: 7, default_next_section_id: null },
];

const questions: RoutedSurveyQuestion[] = [
  {
    id: 'ownership', lesson_id: 'survey', section_id: 'spine', position: 1,
    kind: 'single_choice', required: true,
    choices: [
      { id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' },
      { id: 'other', text: 'Other', allow_free_text: true },
    ],
    routes: { yes: 'owner', no: 'non-owner', other: 'other' },
  },
  {
    id: 'owner-kind', lesson_id: 'survey', section_id: 'owner', position: 1,
    kind: 'single_choice', required: true,
    choices: [{ id: 'platform', text: 'Platform' }, { id: 'wallet', text: 'Wallet' }],
    routes: { platform: 'owner-platform', wallet: 'owner-wallet' },
  },
  {
    id: 'platform-name', lesson_id: 'survey', section_id: 'owner-platform', position: 1,
    kind: 'text', choices: null, required: true, routes: null,
  },
  {
    id: 'wallet-name', lesson_id: 'survey', section_id: 'owner-wallet', position: 1,
    kind: 'text', choices: null, required: true, routes: null,
  },
  {
    id: 'reason', lesson_id: 'survey', section_id: 'non-owner', position: 1,
    kind: 'text', choices: null, required: true, routes: null,
  },
  {
    id: 'other-detail', lesson_id: 'survey', section_id: 'other', position: 1,
    kind: 'scale_1_5', choices: null, required: false, routes: null,
  },
  {
    id: 'confidence', lesson_id: 'survey', section_id: 'tail', position: 1,
    kind: 'scale_1_5', choices: null, required: true, routes: null,
  },
];

describe('routed survey flow', () => {
  it('records a second-level owner path and enforces only its traversed requirements', () => {
    const result = normalizeRoutedSubmission(sections, questions, {
      ownership: 'yes',
      'owner-kind': 'platform',
      'platform-name': 'Synthetic exchange',
      confidence: 4,
    }, {});
    expect(result.path).toEqual(['spine', 'owner', 'owner-platform', 'tail']);
    expect(result.answers).not.toHaveProperty('reason');
  });

  it('allows the non-owner path without owner answers', () => {
    const result = normalizeRoutedSubmission(sections, questions, {
      ownership: 'no', reason: 'Synthetic reason', confidence: 3,
    }, {});
    expect(result.path).toEqual(['spine', 'non-owner', 'tail']);
  });

  it('discards answers from a previous path when a gate is changed', () => {
    const result = normalizeRoutedSubmission(sections, questions, {
      ownership: 'no',
      reason: 'Current path',
      'owner-kind': 'wallet',
      'wallet-name': 'Stale off-path answer',
      confidence: 5,
    }, {});
    expect(result.answers).toEqual({ ownership: 'no', reason: 'Current path', confidence: 5 });
  });

  it('records option-level free text only for the selected option', () => {
    const result = normalizeRoutedSubmission(sections, questions, {
      ownership: 'other', confidence: 2,
    }, { ownership: { other: 'Synthetic ownership detail', yes: 'discard me' } });
    expect(result.path).toEqual(['spine', 'other', 'tail']);
    expect(result.choice_free_text).toEqual({
      ownership: { other: 'Synthetic ownership detail' },
    });
  });

  it('rejects a cycle while traversing', () => {
    const cyclic = sections.map((section) => section.id === 'tail'
      ? { ...section, default_next_section_id: 'spine' }
      : section);
    expect(() => buildSurveyPath(cyclic, questions, { ownership: 'no' }))
      .toThrow(SurveyFlowError);
  });
});
