import type {
  Catalog,
  LmsCompletionEvent,
  LmsEnrollment,
  LmsLearnerProfile,
  LmsLessonProgress,
  LmsQuizAttempt,
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
