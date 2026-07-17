import type {
  Catalog,
  LearnerSnapshot,
  LearnerStateKey,
  LessonView,
  LmsEnrollment,
  LmsLessonProgress,
  LmsLearnerProfile,
  LmsQuizQuestionPublic,
  ModuleView,
} from './types';

export interface LmsPlaybackToken {
  url: string;
  expires_at: string;
  max_watched_seconds: number;
}

export interface LmsResourceToken {
  url: string;
  expires_at: string;
  title: string;
}

export type LmsQuizAnswers = Record<string, string[]>;

export interface LmsQuizPayload {
  quiz: {
    id: string;
    question_count: number;
    pass_pct: number;
  };
  questions: LmsQuizQuestionPublic[];
}

export interface LmsQuizGradeResult {
  attempt_number: number;
  score: number;
  possible_points: number;
  passed: boolean;
  completion_fired: boolean;
}

export type LmsDataErrorKind = 'denied' | 'unavailable';

export class LmsDataError extends Error {
  readonly kind: LmsDataErrorKind;

  constructor(kind: LmsDataErrorKind, message: string) {
    super(message);
    this.name = 'LmsDataError';
    this.kind = kind;
  }
}

export function isLmsAccessDenied(error: unknown): boolean {
  return error instanceof LmsDataError && error.kind === 'denied';
}

export interface LmsProvider {
  // M-10: listLearners() removed. It existed only to populate a learner-state
  // switcher in the learner app. In production supabaseProvider.listLearners()
  // returned exactly one summary — the caller's own — so the switcher never
  // rendered and the call was a wasted round trip on every boot.
  getCatalog(): Promise<Catalog>;
  getLearnerSnapshot(learnerId: LearnerStateKey): Promise<LearnerSnapshot>;
  getModuleView(courseSlug: string, position: number): Promise<ModuleView | null>;
  getLessonView(lessonId: string): Promise<LessonView | null>;
  acceptTerms(enrollmentId: string): Promise<LmsEnrollment>;
  updateProfile(profile: LmsLearnerProfile): Promise<LmsLearnerProfile>;
  getPlaybackToken(
    lessonId: string,
    learnerId: LearnerStateKey,
  ): Promise<LmsPlaybackToken>;
  getResourceToken(
    resourceId: string,
    learnerId: LearnerStateKey,
  ): Promise<LmsResourceToken>;
  recordHeartbeat(
    lessonId: string,
    positionSeconds: number,
    learnerId: LearnerStateKey,
  ): Promise<LmsLessonProgress>;
  completeReading(
    lessonId: string,
    learnerId: LearnerStateKey,
  ): Promise<LmsLessonProgress>;
  getQuiz(
    quizId: string,
    learnerId: LearnerStateKey,
  ): Promise<LmsQuizPayload>;
  gradeQuiz(
    quizId: string,
    answers: LmsQuizAnswers,
    learnerId: LearnerStateKey,
  ): Promise<LmsQuizGradeResult>;
}

export interface LmsAdminProvider {
  adminRequest<T>(
    action: string,
    payload?: Record<string, unknown>,
  ): Promise<T>;
}

export type LmsAuthRole = 'learner' | 'operator' | null;

export interface LmsAuthUser {
  id: string;
  email: string;
  displayName: string;
  role: LmsAuthRole;
}

export interface LmsAuthSession {
  user: LmsAuthUser;
}

export interface LmsAuthResult {
  ok: boolean;
  message: string;
  session: LmsAuthSession | null;
}

export type LmsAuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY';

export interface LmsAuthProvider {
  getSession(): Promise<LmsAuthSession | null>;
  onAuthStateChange(
    callback: (event: LmsAuthEvent, session: LmsAuthSession | null) => void,
  ): () => void;
  signUp(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<LmsAuthResult>;
  login(email: string, password: string): Promise<LmsAuthResult>;
  logout(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<LmsAuthResult>;
  updatePassword(password: string): Promise<LmsAuthResult>;
}
