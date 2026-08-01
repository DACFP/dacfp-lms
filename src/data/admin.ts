import type {
  Catalog,
  CompletionTrigger,
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
    cfp_program_id: string | null;
  };
}

export interface LearnerNote {
  id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export interface AuditSearchRow extends LmsAdminAction {
  actor_email: string;
}

export interface AuditSearchResult {
  total: number;
  rows: AuditSearchRow[];
}

export interface LearnerInspection {
  user: { id: string; email: string };
  account: {
    created_at: string | null;
    banned_until: string | null;
    deactivated: boolean;
  };
  profile: Omit<LmsLearnerProfile, 'email'> | null;
  enrollments: AdminEnrollment[];
  progress: LmsLessonProgress[];
  attempts: LmsQuizAttempt[];
  surveyResponses: LmsSurveyResponse[];
  completions: LmsCompletionEvent[];
  summaries: Array<{ enrollment_id: string; percent_complete: number }>;
  notes: LearnerNote[];
  auditSlice: AuditSearchResult;
  ceReportedCompletionIds: string[];
}

export interface DirectoryRow {
  auth_user_id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  display_name: string;
  cfp_id: string | null;
  deactivated: boolean;
  created_at: string;
  enrollment_count: number;
  course_title: string | null;
  course_slug: string | null;
  enrollment_status: 'active' | 'expired' | 'revoked' | 'none';
  percent_complete: number | null;
  expires_at: string | null;
  last_activity: string | null;
  stalled: boolean;
  completed: boolean;
  latest_completed_at: string | null;
}

export interface DirectoryResult {
  total: number;
  rows: DirectoryRow[];
  stalled_threshold_days: number;
}

export interface DashboardData {
  total_learners: number;
  active_access: number;
  in_progress: number;
  completed_30d: number;
  completed_all: number;
  expiring_30: number;
  expiring_60: number;
  expiring_90: number;
  stalled: number;
  deactivated: number;
  stalled_threshold_days: number;
  recent_completions: Array<{
    completed_at: string;
    trigger: string;
    person_email: string;
    course_title: string;
  }>;
  recent_actions: Array<{
    created_at: string;
    action: string;
    actor_email: string;
    target: Record<string, unknown>;
  }>;
}

export interface ImportRejection {
  row_number: number;
  field: string;
  reason: string;
}

export interface ImportPreview {
  dry_run: true;
  valid_count: number;
  rejected_count: number;
  valid_rows: Array<{
    row_number: number;
    email: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    cfp_board_id: string | null;
    course: string;
    expiration: string;
  }>;
  rejections: ImportRejection[];
}

export interface ImportResult {
  dry_run: false;
  accounts_created: number;
  enrollments_created: number;
  results: Array<{ row_number: number; email: string; enrollment_id: string | null }>;
  rejections: ImportRejection[];
}

export interface AdminSnapshot {
  catalog: Catalog;
  audit: LmsAdminAction[];
}

export interface QuestionBankRow {
  position: number;
  prompt: string;
  choices: Array<{ id: string; text: string }>;
  correct: string[];
}

export interface QuestionBank {
  format: 'dacfp-question-bank-v1';
  modules: Record<string, { questions: QuestionBankRow[] }>;
}

export interface QuestionBankSelection {
  module_selector: string;
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

export interface CfpCeExportRow {
  completion_id: string;
  course_id: string;
  person_email: string;
  trigger: CompletionTrigger;
  cfp_program_id: string;
  date_individual_completed: string;
  attendee_cfp_board_id: string;
  attendee_last_name: string;
  attendee_first_name: string;
  attendee_middle_name: string;
}

export interface CfpCeExcludedRow extends CfpCeExportRow {
  reason: 'no-profile' | 'no-program-id' | 'non-string-cfp' | 'blank-name';
}

export interface CfpCePreview {
  period_start: string;
  period_end: string;
  reportable: CfpCeExportRow[];
  manual: CfpCeExportRow[];
  missing_id: CfpCeExportRow[];
  already_reported: CfpCeExportRow[];
  excluded: CfpCeExcludedRow[];
  pending_program_courses: Array<{ id: string; title: string }>;
  nudge_count: number;
}

export interface CfpCeReportRun {
  id: string;
  created_at: string;
  actor_auth_user_id: string;
  course_ids: string[];
  period_start: string;
  period_end: string;
  row_count: number;
  rows: CfpCeExportRow[];
  filename: string;
}
