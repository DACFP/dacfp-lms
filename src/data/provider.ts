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
