export type CourseStatus = 'draft' | 'published' | 'archived';
export type ProgressionMode = 'sequential' | 'open';
export type LessonKind = 'video' | 'reading';
export type EnrollmentSource =
  | 'fpt_purchase'
  | 'renewal'
  | 'enterprise_seat'
  | 'manual'
  | 'absorb_migrated'
  | 'synthetic';
export type EnrollmentStatus = 'active' | 'expired' | 'revoked';
export type CompletionTrigger = 'all_requirements_met' | 'manual_admin';

export interface LmsCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  progression: ProgressionMode;
  prerequisite_course_id: string | null;
  ce_credits: number | null;
  requires_terms_acceptance: boolean;
  created_at: string;
}

export interface LmsModule {
  id: string;
  course_id: string;
  position: number;
  title: string;
  ce_credits: number | null;
}

export interface LmsLesson {
  id: string;
  module_id: string;
  position: number;
  title: string;
  kind: LessonKind;
  video_ref: string | null;
  duration_seconds: number | null;
  body_md: string | null;
  is_required: boolean;
}

export interface LmsLessonResource {
  id: string;
  lesson_id: string;
  position: number;
  title: string;
  file_ref: string;
}

export interface LmsModuleQuiz {
  id: string;
  module_id: string;
  question_count: number;
  pass_pct: number;
}

export interface QuizChoice {
  id: string;
  text: string;
}

/** Learner-safe question shape. Answer keys are intentionally absent. */
export interface LmsQuizQuestionPublic {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  choices: QuizChoice[];
  points: number;
  select_kind: 'single' | 'multi';
}

export interface CredentialIds {
  cfp?: string;
  iwi?: string;
  cfa?: string;
}

export interface LmsLearnerProfile {
  auth_user_id: string;
  display_name: string;
  email: string;
  credential_ids: CredentialIds;
  created_at: string;
  updated_at: string;
}

export interface LmsEnrollment {
  id: string;
  person_email: string;
  auth_user_id: string | null;
  course_id: string;
  source: EnrollmentSource;
  enrolled_at: string;
  expires_at: string | null;
  status: EnrollmentStatus;
  terms_accepted_at: string | null;
  order_id: string | null;
}

export interface LmsLessonProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  started_at: string | null;
  completed_at: string | null;
  last_position_seconds: number;
  max_watched_seconds: number;
  max_watched_updated_at: string;
  updated_at: string;
}

export interface LmsQuizAttempt {
  id: string;
  enrollment_id: string;
  quiz_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  answers: Record<string, string[]>;
  score: number | null;
  passed: boolean | null;
}

export interface LmsCompletionEvent {
  id: string;
  enrollment_id: string;
  completed_at: string;
  trigger: CompletionTrigger;
  processed_at: string | null;
  designation_issued: boolean;
}

export interface CompletionEvidence extends LmsCompletionEvent {
  course_id: string;
}

export interface Catalog {
  courses: LmsCourse[];
  modules: LmsModule[];
  lessons: LmsLesson[];
  resources: LmsLessonResource[];
  quizzes: LmsModuleQuiz[];
}

export const learnerStateKeys = [
  'fresh',
  'mid-module-2',
  'quiz-failed-on-3',
  'one-quiz-from-done',
  'fpt-completed',
  'fully-complete',
] as const;

export type LearnerStateKey = (typeof learnerStateKeys)[number];

export interface LearnerSummary {
  id: LearnerStateKey;
  label: string;
  description: string;
  email: string;
}

export interface LearnerSnapshot {
  learner: LearnerSummary;
  profile: LmsLearnerProfile;
  enrollments: LmsEnrollment[];
  progress: LmsLessonProgress[];
  attempts: LmsQuizAttempt[];
  completions: CompletionEvidence[];
}

export interface ModuleView {
  course: LmsCourse;
  module: LmsModule;
  modules: LmsModule[];
  lessons: LmsLesson[];
  resources: LmsLessonResource[];
  quiz: LmsModuleQuiz | null;
}

export interface LessonView {
  course: LmsCourse;
  module: LmsModule;
  lesson: LmsLesson;
  moduleLessons: LmsLesson[];
  resources: LmsLessonResource[];
}
