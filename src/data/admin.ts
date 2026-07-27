import type {
  Catalog,
  LmsCompletionEvent,
  LmsEnrollment,
  LmsLearnerProfile,
  LmsLessonProgress,
  LmsQuizAttempt,
  LmsSurveyQuestion,
  LmsSurveyResponse,
  LmsSurveySection,
} from './types';

export interface LmsAdminAction {
  id: string;
  actor_auth_user_id: string;
  action: string;
  target: Record<string, unknown>;
  created_at: string;
}

export interface AdminEnrollment extends LmsEnrollment {
  lms_courses: {
    id: string;
    slug: string;
    title: string;
    ce_credits: number | null;
  };
}

export interface LearnerInspection {
  user: { id: string; email: string };
  profile: Omit<LmsLearnerProfile, 'email'> | null;
  enrollments: AdminEnrollment[];
  progress: LmsLessonProgress[];
  attempts: LmsQuizAttempt[];
  surveyResponses: LmsSurveyResponse[];
  completions: LmsCompletionEvent[];
  summaries: Array<{ enrollment_id: string; percent_complete: number }>;
}

export interface AdminSnapshot {
  catalog: Catalog;
  audit: LmsAdminAction[];
}

export interface QuestionBankRow {
  position: number;
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct: 'a' | 'b' | 'c' | 'd';
  points: number;
}

export interface QuestionBank {
  pass_pct: 70;
  questions: QuestionBankRow[];
}

export interface SurveyScaleBreakdown {
  kind: 'scale_1_5';
  counts: Record<'1' | '2' | '3' | '4' | '5', number>;
  average: number | null;
}

export interface SurveyChoiceBreakdown {
  kind: 'single_choice' | 'multi_choice';
  counts: Array<{ id: string; text: string; count: number; free_text: string[] }>;
}

export interface SurveyTextBreakdown {
  kind: 'text';
  responses: string[];
}

export interface SurveyQuestionResult {
  question: LmsSurveyQuestion;
  denominator: number;
  breakdown:
    | SurveyScaleBreakdown
    | SurveyChoiceBreakdown
    | SurveyTextBreakdown;
}

export interface SurveyResults {
  lesson: { id: string; title: string };
  course: { id: string; title: string };
  response_count: number;
  enrolled_count: number;
  completion_rate: number;
  sections: LmsSurveySection[];
  path_distribution: Array<{ path: string[]; count: number }>;
  questions: SurveyQuestionResult[];
}

export interface SurveyFlowSaveResult {
  outline: string;
  sections: LmsSurveySection[];
  questions: LmsSurveyQuestion[];
}

export interface SurveyExport {
  file_name: string;
  csv: string;
  row_count: number;
}
