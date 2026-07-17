// SOURCE OF TRUTH: src/engine/progression-types.ts. Deployed copies must remain byte-identical.

export interface LmsCourse {
  id: string;
  progression: 'sequential' | 'open';
  prerequisite_course_id: string | null;
  requires_terms_acceptance: boolean;
}

export interface LmsModule {
  id: string;
  course_id: string;
  position: number;
}

export interface LmsLesson {
  id: string;
  module_id: string;
  kind: 'video' | 'reading';
  duration_seconds: number | null;
  is_required: boolean;
}

export interface LmsModuleQuiz {
  id: string;
  module_id: string;
}

export interface LmsEnrollment {
  terms_accepted_at: string | null;
}

export interface LmsLessonProgress {
  lesson_id: string;
  completed_at: string | null;
  max_watched_seconds: number;
}

export interface LmsQuizAttempt {
  quiz_id: string;
  attempt_number: number;
  passed: boolean | null;
}

export interface CompletionEvidence {
  course_id: string;
}
