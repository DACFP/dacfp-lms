import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SurveyLesson } from './SurveyLesson';
import type { LmsSurveyQuestion } from '../data/types';

const questions: LmsSurveyQuestion[] = [
  {
    id: 'q-scale',
    lesson_id: 'survey-1',
    position: 1,
    prompt: 'How confident are you?',
    kind: 'scale_1_5',
    choices: null,
    required: true,
  },
  {
    id: 'q-text',
    lesson_id: 'survey-1',
    position: 2,
    prompt: 'What should we improve?',
    kind: 'text',
    choices: null,
    required: true,
  },
  {
    id: 'q-single',
    lesson_id: 'survey-1',
    position: 3,
    prompt: 'Which role fits best?',
    kind: 'single_choice',
    choices: [
      { id: 'advisor', text: 'Advisor' },
      { id: 'planner', text: 'Planner' },
    ],
    required: true,
  },
  {
    id: 'q-multi',
    lesson_id: 'survey-1',
    position: 4,
    prompt: 'Choose useful topics',
    kind: 'multi_choice',
    choices: [
      { id: 'bitcoin', text: 'Bitcoin' },
      { id: 'custody', text: 'Custody' },
    ],
    required: true,
  },
];

describe('SurveyLesson', () => {
  it('collects every supported answer kind in one submission', async () => {
    const submit = vi.fn(async () => undefined);
    render(<SurveyLesson questions={questions} response={null} onSubmit={submit} />);

    fireEvent.click(screen.getByLabelText('4'));
    fireEvent.change(screen.getByLabelText('2. What should we improve?'), {
      target: { value: 'More worked examples' },
    });
    fireEvent.click(screen.getByLabelText('Advisor'));
    fireEvent.click(screen.getByLabelText('Bitcoin'));
    fireEvent.click(screen.getByLabelText('Custody'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      'q-scale': 4,
      'q-text': 'More worked examples',
      'q-single': 'advisor',
      'q-multi': ['bitcoin', 'custody'],
    }));
  });

  it('renders submitted answers read-only without another submit control', () => {
    render(
      <SurveyLesson
        questions={questions}
        response={{
          id: 'response-1',
          enrollment_id: 'enrollment-1',
          lesson_id: 'survey-1',
          submitted_at: '2026-07-25T00:00:00.000Z',
          answers: {
            'q-scale': 5,
            'q-text': 'Keep the examples',
            'q-single': 'planner',
            'q-multi': ['custody'],
          },
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Your responses' })).toBeInTheDocument();
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit survey/ })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
