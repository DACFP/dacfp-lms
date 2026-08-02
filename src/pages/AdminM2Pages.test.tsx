import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthSessionProvider } from '../context/AuthContext';
import { LmsProvider } from '../context/LmsContext';
import type {
  QuizAnalytics,
  SurveyBrowserResult,
  SurveyResponseDetail,
} from '../data/admin';
import { mockProvider } from '../data/mockProvider';
import type {
  LmsAdminProvider,
  LmsAuthProvider,
  LmsAuthSession,
} from '../data/provider';

const operatorSession: LmsAuthSession = {
  user: {
    id: 'auth-operator',
    email: 'operator@example.test',
    displayName: 'Operator',
    role: 'operator',
  },
};

function operatorAuth(): LmsAuthProvider {
  return {
    async getSession() { return operatorSession; },
    onAuthStateChange() { return () => undefined; },
    async signUp() { return { ok: true, message: '', session: operatorSession }; },
    async login() { return { ok: true, message: '', session: operatorSession }; },
    async logout() {},
    async requestPasswordReset() { return { ok: true, message: '', session: null }; },
    async updatePassword() { return { ok: true, message: '', session: operatorSession }; },
  };
}

function renderAdmin(route: string, adminRequest: LmsAdminProvider['adminRequest']) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthSessionProvider provider={operatorAuth()}>
        <LmsProvider provider={mockProvider}>
          <App adminProvider={{ adminRequest }} />
        </LmsProvider>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

async function adminRequest<T>(
  action: string,
  payload: Record<string, unknown>,
  handlers: Record<string, unknown>,
) {
  if (action === 'list_catalog') return (await mockProvider.getCatalog()) as T;
  if (action === 'list_audit') return [] as T;
  const handler = handlers[action] as ((value: Record<string, unknown>) => unknown) | undefined;
  return (handler ? handler(payload) : {}) as T;
}

const quizAnalytics: QuizAnalytics = {
  course: { id: 'course-fpt', slug: 'fpt-sandbox', title: 'FPT Sandbox' },
  minimum_attempts: 2,
  population_views: {
    attempts: 'v_lms_m2_quiz_attempt_population',
    questions: 'v_lms_m2_quiz_question_population',
  },
  course_rollup: {
    attempts: 1,
    unique_learners: 1,
    pass_rate: null,
    average_attempts_to_pass: null,
    retake_volume: 0,
    insufficient_data: true,
  },
  modules: [{
    module_id: 'fpt-m1',
    position: 1,
    title: 'Bitcoin Foundations',
    quiz_id: 'quiz-fpt-m1',
    attempts: 1,
    unique_learners: 1,
    pass_rate: null,
    average_attempts_to_pass: null,
    retake_volume: 0,
    insufficient_data: true,
    questions: [{
      question_id: 'question-1',
      position: 1,
      prompt: 'Which statement is accurate?',
      attempt_count: 1,
      miss_count: 1,
      miss_rate: null,
      insufficient_data: true,
      choices: [
        { id: 'a', text: 'Accurate choice', selected_count: 1, selected_pct: null, correct: true },
        { id: 'b', text: 'Distractor', selected_count: 1, selected_pct: null, correct: false },
      ],
    }],
  }],
};

describe('M2 quiz analytics', () => {
  it('shows the named low-volume state and keeps correct flags in the operator UI', async () => {
    renderAdmin('/admin/analytics/quizzes', (action, payload = {}) =>
      adminRequest(action, payload, { quiz_analytics: () => quizAnalytics }));

    expect(await screen.findByRole(
      'heading',
      { name: 'Course rollup' },
      { timeout: 5000 },
    )).toBeInTheDocument();
    expect(screen.getByText('v_lms_m2_quiz_attempt_population')).toBeInTheDocument();
    expect(screen.getAllByText(/Insufficient data/).length).toBeGreaterThan(0);
    expect(screen.getByText('Accurate choice')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.queryByText(/learner@example/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
  });
});

const browserResult: SurveyBrowserResult = {
  total: 1,
  page: 1,
  page_size: 10,
  filters: {},
  population_view: 'v_lms_m2_survey_response_population',
  rows: [{
    response_id: '11111111-1111-1111-1111-111111111111',
    learner_email: 'learner@example.test',
    course_id: 'course-fpt',
    course_title: 'FPT Sandbox',
    survey_id: 'fpt-post-survey',
    survey_title: 'Post-course survey',
    submitted_at: '2026-07-28T18:00:00.000Z',
    enrollment_status: 'active',
    course_completed_at: '2026-07-28T17:30:00.000Z',
  }],
};

describe('M2 survey response browser', () => {
  it('renders the server population and completion context', async () => {
    const list = vi.fn(() => browserResult);
    renderAdmin('/admin/surveys', (action, payload = {}) =>
      adminRequest(action, payload, { list_survey_responses: list }));

    expect((await screen.findAllByText(
      'learner@example.test',
      {},
      { timeout: 5000 },
    )).length).toBeGreaterThan(0);
    expect(screen.getByText('v_lms_m2_survey_response_population')).toBeInTheDocument();
    expect(screen.getAllByText(/Course completed Jul 28, 2026/).length).toBeGreaterThan(0);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 10 }));
  });

  it('renders routed sections in stored order with verbatim free text and no mutation affordance', async () => {
    const detail: SurveyResponseDetail = {
      ...browserResult.rows[0],
      population_view: 'v_lms_m2_survey_response_population',
      path: ['section-a', 'section-c'],
      sections: [
        {
          section_id: 'section-a',
          position: 1,
          title: 'Background',
          answers: [{
            question_id: 'question-a',
            position: 1,
            prompt: 'What should we know?',
            kind: 'text',
            raw_answer: 'Verbatim response\nwith a second line.',
            answer_lines: ['Verbatim response\nwith a second line.'],
            choice_free_text: {},
          }],
        },
        {
          section_id: 'section-c',
          position: 3,
          title: 'Introductions',
          answers: [{
            question_id: 'question-c',
            position: 1,
            prompt: 'Would you introduce us?',
            kind: 'single_choice',
            raw_answer: 'yes',
            answer_lines: ['Yes — Please contact me next week.'],
            choice_free_text: { yes: 'Please contact me next week.' },
          }],
        },
      ],
    };
    renderAdmin(
      '/admin/surveys/11111111-1111-1111-1111-111111111111',
      (action, payload = {}) => adminRequest(action, payload, {
        survey_response_detail: () => detail,
      }),
    );

    const path = await screen.findByRole('list', { name: 'Presented response path' });
    const sectionHeadings = within(path).getAllByRole('heading', { level: 2 });
    expect(sectionHeadings.map((heading) => heading.textContent)).toEqual([
      'Background',
      'Introductions',
    ]);
    expect(screen.getByText(/Verbatim response/)).toHaveTextContent('Verbatim response with a second line.');
    expect(screen.getByText('Yes — Please contact me next week.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|annotate|status|save/i })).toBeNull();
  });
});
