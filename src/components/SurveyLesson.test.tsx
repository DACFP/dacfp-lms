import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SurveyLesson } from './SurveyLesson';
import type { LmsSurveyQuestion, LmsSurveyResponse, LmsSurveySection } from '../data/types';

const sections: LmsSurveySection[] = [
  {
    id: 'section-1', lesson_id: 'survey-1', position: 1,
    title: 'Feedback', default_next_section_id: null,
  },
];

const questions: LmsSurveyQuestion[] = [
  {
    id: 'q-scale', lesson_id: 'survey-1', section_id: 'section-1', position: 1,
    prompt: 'How confident are you?', kind: 'scale_1_5', choices: null,
    required: true, routes: null,
  },
  {
    id: 'q-text', lesson_id: 'survey-1', section_id: 'section-1', position: 2,
    prompt: 'What should we improve?', kind: 'text', choices: null,
    required: true, routes: null,
  },
  {
    id: 'q-single', lesson_id: 'survey-1', section_id: 'section-1', position: 3,
    prompt: 'Which role fits best?', kind: 'single_choice',
    choices: [{ id: 'advisor', text: 'Advisor' }, { id: 'other', text: 'Other', allow_free_text: true }],
    required: true, routes: null,
  },
  {
    id: 'q-multi', lesson_id: 'survey-1', section_id: 'section-1', position: 4,
    prompt: 'Choose useful topics', kind: 'multi_choice',
    choices: [{ id: 'bitcoin', text: 'Bitcoin' }, { id: 'custody', text: 'Custody' }],
    required: true, routes: null,
  },
];

describe('SurveyLesson', () => {
  it('keeps the routed form mounted when stored UUID targets omit hyphens', () => {
    const startId = '2c479c9a-de56-a2f8-aba8-517ea7e43f1d';
    const branchId = 'de549f74-ea5a-d97f-0231-980998e779c2';
    const routedSections: LmsSurveySection[] = [
      { id: startId, lesson_id: 'survey-uuid', position: 1, title: 'Start', default_next_section_id: null },
      { id: branchId, lesson_id: 'survey-uuid', position: 2, title: 'Owner branch', default_next_section_id: null },
    ];
    const routedQuestions: LmsSurveyQuestion[] = [{
      id: 'gate', lesson_id: 'survey-uuid', section_id: startId, position: 1,
      prompt: 'Choose a path', kind: 'single_choice', required: true,
      choices: [{ id: 'owner', text: 'Owner' }, { id: 'other', text: 'Other' }],
      routes: { owner: branchId.replaceAll('-', '') },
    }];

    render(<SurveyLesson sections={routedSections} questions={routedQuestions} response={null} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Owner'));

    expect(screen.queryByText('Survey sections are unavailable.')).toBeNull();
    expect(screen.getByLabelText('Owner')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Owner branch' })).toBeInTheDocument();
  });

  it('renders one routed section at a time and converges on the shared tail', async () => {
    const routedSections: LmsSurveySection[] = [
      { id: 'start', lesson_id: 'survey-2', position: 1, title: 'Start', default_next_section_id: 'tail' },
      { id: 'branch', lesson_id: 'survey-2', position: 2, title: 'Owner branch', default_next_section_id: 'tail' },
      { id: 'tail', lesson_id: 'survey-2', position: 3, title: 'Shared tail', default_next_section_id: null },
    ];
    const routedQuestions: LmsSurveyQuestion[] = [
      {
        id: 'gate', lesson_id: 'survey-2', section_id: 'start', position: 1,
        prompt: 'Choose a path', kind: 'single_choice', required: true,
        choices: [{ id: 'owner', text: 'Owner' }, { id: 'skip', text: 'Skip branch' }],
        routes: { owner: 'branch' },
      },
      {
        id: 'branch-detail', lesson_id: 'survey-2', section_id: 'branch', position: 1,
        prompt: 'Branch detail', kind: 'text', choices: null, required: true, routes: null,
      },
      {
        id: 'tail-detail', lesson_id: 'survey-2', section_id: 'tail', position: 1,
        prompt: 'Tail detail', kind: 'text', choices: null, required: true, routes: null,
      },
    ];
    const submit = vi.fn(async () => undefined);
    render(<SurveyLesson sections={routedSections} questions={routedQuestions} response={null} onSubmit={submit} />);

    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByLabelText('1. Branch detail')).toBeNull();
    fireEvent.click(screen.getByLabelText('Owner'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('1. Branch detail'), { target: { value: 'Synthetic branch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('1. Tail detail'), { target: { value: 'Synthetic tail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      path: ['start', 'branch', 'tail'],
    })));
  });

  it('collects every supported answer kind and the authoritative path', async () => {
    const submit = vi.fn(async () => undefined);
    render(<SurveyLesson sections={sections} questions={questions} response={null} onSubmit={submit} />);

    fireEvent.click(screen.getByLabelText('4'));
    fireEvent.change(screen.getByLabelText('2. What should we improve?'), {
      target: { value: 'More worked examples' },
    });
    fireEvent.click(screen.getByLabelText('Advisor'));
    fireEvent.click(screen.getByLabelText('Bitcoin'));
    fireEvent.click(screen.getByLabelText('Custody'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      answers: {
        'q-scale': 4,
        'q-text': 'More worked examples',
        'q-single': 'advisor',
        'q-multi': ['bitcoin', 'custody'],
      },
      choice_free_text: {},
      path: ['section-1'],
    }));
  });

  it('transitions from the form to submitted responses without changing hook order', async () => {
    function SubmittedTransition() {
      const [response, setResponse] = useState<LmsSurveyResponse | null>(null);
      return (
        <SurveyLesson
          sections={sections}
          questions={questions}
          response={response}
          onSubmit={async (submission) => setResponse({
            id: 'response-transition',
            enrollment_id: 'enrollment-1',
            lesson_id: 'survey-1',
            submitted_at: '2026-07-28T00:00:00.000Z',
            ...submission,
          })}
        />
      );
    }

    render(<SubmittedTransition />);
    fireEvent.click(screen.getByLabelText('4'));
    fireEvent.change(screen.getByLabelText('2. What should we improve?'), { target: { value: 'Synthetic' } });
    fireEvent.click(screen.getByLabelText('Advisor'));
    fireEvent.click(screen.getByLabelText('Bitcoin'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

    expect(await screen.findByRole('heading', { name: 'Your responses' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit survey' })).toBeNull();
  });

  it('renders selected-option free text and submits it under that option', async () => {
    const submit = vi.fn(async () => undefined);
    render(<SurveyLesson sections={sections} questions={questions} response={null} onSubmit={submit} />);
    fireEvent.click(screen.getByLabelText('5'));
    fireEvent.change(screen.getByLabelText('2. What should we improve?'), { target: { value: 'Nothing' } });
    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.change(screen.getByLabelText('Other detail'), { target: { value: 'Synthetic role' } });
    fireEvent.click(screen.getByLabelText('Bitcoin'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      choice_free_text: { 'q-single': { other: 'Synthetic role' } },
    })));
  });

  it('renders submitted answers from traversed sections only', () => {
    render(
      <SurveyLesson
        sections={sections}
        questions={questions}
        response={{
          id: 'response-1', enrollment_id: 'enrollment-1', lesson_id: 'survey-1',
          submitted_at: '2026-07-25T00:00:00.000Z',
          answers: {
            'q-scale': 5, 'q-text': 'Keep the examples',
            'q-single': 'other', 'q-multi': ['custody'],
          },
          choice_free_text: { 'q-single': { other: 'Synthetic role' } },
          path: ['section-1'],
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Your responses' })).toBeInTheDocument();
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByText('Other: Synthetic role')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit survey/ })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
