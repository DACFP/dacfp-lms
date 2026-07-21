import type { LmsCourse, LmsModule } from '../data/types';

/**
 * The static faculty layer (DESIGN-DIRECTION §2).
 *
 * The adopted mockup gives every module an instructor card. That layer ships
 * NOW as pure presentation content: one frontend map from module position to a
 * profile. There is deliberately no schema behind it — the data-model home is
 * a promotion-era migration, and the §0 FREEZE forbids creating it here.
 *
 * Real DACFP faculty content would live under Brand/faculty/ and be entered
 * into REAL_FACULTY below. That directory does not exist yet, so every module
 * currently resolves to a placeholder profile, clearly marked sandbox at the
 * render site. `placeholder: true` lets dense surfaces (the course-of-study
 * ledger) skip the name rather than print fourteen identical stand-ins.
 */
export interface FacultyProfile {
  name: string;
  bio: string;
  photo?: string;
  /** True until real faculty content lands under Brand/faculty/. */
  placeholder: boolean;
}

/**
 * course slug → module position → profile. Populate from Brand/faculty/ when
 * that content exists; keys are the real catalog's slugs at promotion time.
 */
const REAL_FACULTY: Record<string, Record<number, Omit<FacultyProfile, 'placeholder'>>> = {};

const PLACEHOLDER: FacultyProfile = {
  name: 'DACFP program faculty',
  bio: 'Each module of the program is taught by a practitioner selected by DACFP. The instructor profile for this module arrives with the course content.',
  placeholder: true,
};

export function facultyForModule(course: LmsCourse, module: LmsModule): FacultyProfile {
  const entry = REAL_FACULTY[course.slug]?.[module.position];
  return entry ? { ...entry, placeholder: false } : PLACEHOLDER;
}

/** Initials for the avatar circle, e.g. "DACFP program faculty" → "DF". */
export function facultyInitials(profile: FacultyProfile) {
  const words = profile.name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
