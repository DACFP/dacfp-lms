import type {
  Catalog,
  LearnerSnapshot,
  LearnerStateKey,
  LearnerSummary,
  LessonView,
  LmsEnrollment,
  LmsLearnerProfile,
  ModuleView,
} from './types';

export interface LmsProvider {
  listLearners(): Promise<LearnerSummary[]>;
  getCatalog(): Promise<Catalog>;
  getLearnerSnapshot(learnerId: LearnerStateKey): Promise<LearnerSnapshot>;
  getModuleView(courseSlug: string, position: number): Promise<ModuleView | null>;
  getLessonView(lessonId: string): Promise<LessonView | null>;
  acceptTerms(enrollmentId: string): Promise<LmsEnrollment>;
  updateProfile(profile: LmsLearnerProfile): Promise<LmsLearnerProfile>;
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
