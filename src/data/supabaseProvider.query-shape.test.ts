import { describe, expect, it } from 'vitest';
import source from './supabaseProvider.ts?raw';

describe('supabase provider query ownership and navigation scope', () => {
  it('adds an explicit ownership predicate to every learner-owned table read', () => {
    expect(source).toContain(".from('lms_learner_profiles')");
    expect(source).toContain(".eq('auth_user_id', user.id)");
    expect(source).toContain(".from('lms_enrollments')");
    expect(source.match(/\.eq\('auth_user_id', user\.id\)/g)).toHaveLength(2);

    for (const table of [
      'lms_lesson_progress',
      'lms_quiz_attempts',
      'lms_survey_responses',
      'lms_completion_events',
    ]) {
      const tableStart = source.indexOf(`.from('${table}')`);
      expect(tableStart).toBeGreaterThan(-1);
      expect(source.slice(tableStart, tableStart + 180)).toContain(
        ".in('enrollment_id', enrollmentIds)",
      );
    }
  });

  it('loads module and lesson views from their requested scope, not the full catalog', () => {
    const moduleView = source.slice(
      source.indexOf('async getModuleView'),
      source.indexOf('async getLessonView'),
    );
    const lessonView = source.slice(
      source.indexOf('async getLessonView'),
      source.indexOf('async acceptTerms'),
    );

    expect(moduleView).not.toContain('this.getCatalog()');
    expect(moduleView).toContain(".eq('slug', courseSlug)");
    expect(moduleView).toContain(".eq('module_id', module.id)");
    expect(lessonView).not.toContain('this.getCatalog()');
    expect(lessonView).toContain(".eq('id', lessonId)");
    expect(lessonView).toContain(".eq('module_id', module.id)");
  });
});
