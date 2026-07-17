import {
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LockKeyhole,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CbdaSeal } from '../components/CbdaSeal';
import { IconTile } from '../components/IconTile';
import { LockedBadge } from '../components/LockedBadge';
import { RenewalEvent } from '../components/RenewalEvent';
import {
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusPill,
  formatDate,
} from '../components/common';
import { useLms } from '../context/LmsContext';
import type { Catalog, LearnerSnapshot, LmsCourse, LmsEnrollment } from '../data/types';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import { courseKind } from '../lib/courseKind';
import {
  courseProgressPercent,
  enrollmentAccessState,
  isCourseComplete,
  moduleIsPassed,
  moduleIsUnlocked,
  resumeModuleForCourse,
} from '../lib/progress';

/**
 * Everything a card needs about one enrollment, derived once so the hero, the
 * renewal surface and the library cannot drift apart. A plain function, not a
 * hook — it holds no state.
 */
function courseView(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  enrollment: LmsEnrollment,
) {
  const accessState = enrollmentAccessState(enrollment);
  const accessActive = accessState === 'active';
  const unlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const courseModules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  // Locked or terms-gated catalog rows are intentionally hidden by RLS. An
  // empty visible module set is therefore not completion.
  const complete = courseModules.length > 0 && isCourseComplete(catalog, snapshot, course);
  const progress = courseProgressPercent(catalog, snapshot, course, enrollment);
  const resumeModule = resumeModuleForCourse(catalog, snapshot, course);
  const enrollmentProgress = snapshot.progress.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const resumeLesson = resumeModule
    ? catalog.lessons
        .filter((lesson) => lesson.module_id === resumeModule.id)
        .map((lesson) => ({
          lesson,
          progress: enrollmentProgress.find((item) => item.lesson_id === lesson.id),
        }))
        .filter(({ progress: item }) => item)
        .sort(
          (a, b) =>
            new Date(b.progress!.updated_at).getTime() -
            new Date(a.progress!.updated_at).getTime(),
        )
        .find(({ lesson }) => !lessonComplete(lesson, enrollmentProgress))?.lesson
    : null;
  const contentAvailable = accessActive && unlocked && termsAccepted;
  const resumePath = resumeLesson
    ? `/lesson/${resumeLesson.id}`
    : resumeModule
      ? `/course/${course.slug}/module/${resumeModule.position}`
      : '/dashboard';

  return {
    accessState,
    unlocked,
    termsAccepted,
    courseModules,
    complete,
    progress,
    resumeModule,
    resumeLesson,
    contentAvailable,
    resumePath,
  };
}

type CourseView = ReturnType<typeof courseView>;

/**
 * brief #15. "Access through {formatDate(null)}" rendered as "Access through No
 * expiry set". No expiry is its own branch, not a date that happens to be
 * missing.
 */
function AccessLine({ enrollment }: { enrollment: LmsEnrollment }) {
  const expired = enrollmentAccessState(enrollment) === 'expired';
  if (!enrollment.expires_at) {
    return <strong className="text-dacfp-navy">No access expiry</strong>;
  }
  return (
    <span>
      Access {expired ? 'expired' : 'through'}{' '}
      <strong className="text-dacfp-navy">{formatDate(enrollment.expires_at)}</strong>
    </span>
  );
}

function CourseStatus({ view, course }: { view: CourseView; course: LmsCourse }) {
  if (view.accessState === 'expired') return <StatusPill tone="warning">Access expired</StatusPill>;
  if (view.accessState === 'revoked') return <StatusPill tone="warning">Access unavailable</StatusPill>;
  if (view.complete) return <StatusPill tone="positive">Complete</StatusPill>;
  if (!view.unlocked) {
    return (
      <LockedBadge reason={`${course.title} unlocks once you complete the prerequisite course.`} />
    );
  }
  if (!view.termsAccepted) return <StatusPill tone="warning">Terms required</StatusPill>;
  return <StatusPill tone="neutral">In progress</StatusPill>;
}

function ModuleRail({
  view,
  catalog,
  snapshot,
  course,
}: {
  view: CourseView;
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  course: LmsCourse;
}) {
  if (view.courseModules.length === 0) return null;
  return (
    <div className="rounded-lg border border-dacfp-line bg-dacfp-wash p-3">
      <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
        Module status
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {view.courseModules.map((module) => {
          const passed = moduleIsPassed(catalog, snapshot, course, module);
          const moduleUnlocked =
            view.contentAvailable && moduleIsUnlocked(catalog, snapshot, course, module);
          return (
            <li
              className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm"
              key={module.id}
            >
              <span className="min-w-0 truncate font-semibold text-dacfp-navy">
                Module {module.position}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-dacfp-gray-text">
                {passed ? (
                  <CheckCircle2 className="size-icon-sm text-status-positive" aria-hidden="true" />
                ) : moduleUnlocked ? (
                  <Clock3 className="size-icon-sm text-dacfp-blue" aria-hidden="true" />
                ) : (
                  <LockKeyhole className="size-icon-xs" aria-hidden="true" />
                )}
                {passed ? 'Passed' : moduleUnlocked ? 'Available' : 'Locked'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** An enrollment whose course RLS no longer exposes. Kept visible on purpose. */
function HiddenCourseCard({ enrollment }: { enrollment: LmsEnrollment }) {
  const state = enrollmentAccessState(enrollment);
  return (
    <article className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <IconTile icon={ShieldAlert} size="md" tone="gold" />
        <StatusPill tone="warning">
          {state === 'expired' ? 'Access expired' : 'Access unavailable'}
        </StatusPill>
      </div>
      <h3 className="mt-5 text-xl font-bold text-dacfp-navy">
        {state === 'expired' ? 'Expired course access' : 'Course access unavailable'}
      </h3>
      <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
        Course details are no longer available to this session. The enrollment remains visible so its access status is not hidden.
      </p>
      <p className="mt-5 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
        {state === 'expired'
          ? `Course access expired ${formatDate(enrollment.expires_at)}. This does not itself change designation standing.`
          : 'Course access is unavailable. Contact DACFP support if you expected this course to remain active.'}
      </p>
      <Link className="button-secondary mt-6 self-start" to="/account">
        Review account
      </Link>
    </article>
  );
}

function FlagshipHero({
  catalog,
  snapshot,
  course,
  enrollment,
}: {
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  course: LmsCourse;
  enrollment: LmsEnrollment;
}) {
  const view = courseView(catalog, snapshot, course, enrollment);

  return (
    <section aria-labelledby="flagship-heading" className="card overflow-hidden">
      <div className="brand-strip h-1" />
      <div className="p-6 sm:p-8">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Your track</p>
            <h2
              id="flagship-heading"
              className="mt-1.5 text-2xl font-bold tracking-tight text-dacfp-navy sm:text-3xl"
            >
              {course.title}
            </h2>
            <p className="mt-2.5 max-w-prose leading-7 text-dacfp-gray-text">
              {course.description}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
            <CourseStatus view={view} course={course} />
            {/* The seal is a PROGRAMME mark — it says what this track leads to.
                The caption carries that meaning so it can never be read as "you
                are certified"; access and designation stay separate. */}
            <figure className="flex items-center gap-3 sm:mt-2 sm:flex-col sm:gap-1.5">
              <CbdaSeal size="lg" decorative />
              <figcaption className="max-w-36 text-xs leading-5 text-dacfp-gray-text sm:text-center">
                Prepares you for the CBDA designation
              </figcaption>
            </figure>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-y border-dacfp-line py-4 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-dacfp-gray-text">
            <Award aria-hidden="true" className="size-icon-sm text-dacfp-gold" />
            <span>
              <strong className="text-dacfp-navy">{course.ce_credits ?? 0}</strong> CE credits
            </span>
          </div>
          <div className="flex items-center gap-2 text-dacfp-gray-text">
            <CalendarClock aria-hidden="true" className="size-icon-sm text-dacfp-blue" />
            <AccessLine enrollment={enrollment} />
          </div>
        </div>

        {view.accessState === 'expired' ? (
          <div className="mt-6 flex gap-3 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
            <ShieldAlert className="mt-0.5 size-icon-md shrink-0" aria-hidden="true" />
            <p>
              This course can no longer be opened. Course access expiry does not itself change designation standing.
            </p>
          </div>
        ) : !view.unlocked ? (
          <div className="mt-6 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
            Complete FPT to unlock this bonus course. Your enrollment is ready and waiting.
          </div>
        ) : (
          <div className="mt-6">
            <ProgressBar value={view.progress} label="Course progress" />
          </div>
        )}

        <div className="mt-6">
          <ModuleRail view={view} catalog={catalog} snapshot={snapshot} course={course} />
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-dacfp-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-dacfp-gray-text">
            Learning access and designation status are governed separately.
          </p>
          {view.contentAvailable && view.resumeModule ? (
            <Link className="button-primary shrink-0" to={view.resumePath}>
              {view.complete ? 'Review course' : view.resumeLesson ? 'Resume lesson' : 'Continue'}
              <ChevronRight className="size-icon-sm" aria-hidden="true" />
            </Link>
          ) : (
            <span
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-gray-text"
              aria-disabled="true"
            >
              <LockKeyhole className="size-icon-sm" aria-hidden="true" /> Unavailable
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function LibraryCard({
  catalog,
  snapshot,
  course,
  enrollment,
}: {
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  course: LmsCourse;
  enrollment: LmsEnrollment;
}) {
  const view = courseView(catalog, snapshot, course, enrollment);

  return (
    <article className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <IconTile
          icon={view.contentAvailable ? BookOpen : LockKeyhole}
          size="md"
          tone={view.contentAvailable ? 'brand' : 'gold'}
        />
        <CourseStatus view={view} course={course} />
      </div>

      <h3 className="mt-5 text-lg font-bold text-dacfp-navy">{course.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-dacfp-gray-text">{course.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-dacfp-gray-text">
        <span className="flex items-center gap-2">
          <Award aria-hidden="true" className="size-icon-sm text-dacfp-gold" />
          <strong className="text-dacfp-navy">{course.ce_credits ?? 0}</strong> CE credits
        </span>
        <span className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-icon-sm text-dacfp-blue" />
          <AccessLine enrollment={enrollment} />
        </span>
      </div>

      {/* brief #14: locked-state storytelling — a locked card says what opens
          it, not just that it is shut. */}
      {view.accessState === 'expired' ? (
        <p className="mt-4 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-3 text-sm leading-6 text-dacfp-navy">
          This course can no longer be opened. Course access expiry does not itself change designation standing.
        </p>
      ) : !view.unlocked ? (
        <p className="mt-4 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-3 text-sm leading-6 text-dacfp-navy">
          Complete FPT to unlock this bonus course. Your enrollment is ready and waiting.
        </p>
      ) : (
        <div className="mt-4">
          <ProgressBar value={view.progress} label="Course progress" />
        </div>
      )}

      {view.contentAvailable && view.resumeModule ? (
        <div className="mt-5">
          <Link className="button-secondary" to={view.resumePath}>
            {view.complete ? 'Review course' : view.resumeLesson ? 'Resume lesson' : 'Continue'}
            <ChevronRight className="size-icon-sm" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function DashboardPage() {
  const { catalog, snapshot } = useLms();
  const activeEnrollmentCount = snapshot.enrollments.filter(
    (enrollment) => enrollmentAccessState(enrollment) === 'active',
  ).length;

  const rows = snapshot.enrollments.map((enrollment) => ({
    enrollment,
    course: catalog.courses.find((item) => item.id === enrollment.course_id) ?? null,
  }));
  const hidden = rows.filter((row) => !row.course);
  const visible = rows.filter(
    (row): row is { enrollment: LmsEnrollment; course: LmsCourse } => row.course !== null,
  );
  const flagship = visible.find((row) => courseKind(row.course) === 'flagship') ?? null;
  const renewals = visible.filter((row) => courseKind(row.course) === 'renewal');
  const library = visible.filter((row) => courseKind(row.course) === 'library');

  const header = (
    <PageHeader
      eyebrow="Learner dashboard"
      title={`Welcome, ${snapshot.profile.display_name}`}
      description="Continue your courses, see exactly what is available next, and keep annual learning access in view."
      action={
        snapshot.enrollments.length > 0 ? (
          <div className="rounded-lg border border-dacfp-line bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
              Learning access
            </p>
            <p className="mt-1 font-bold text-dacfp-navy">
              {activeEnrollmentCount} active {activeEnrollmentCount === 1 ? 'course' : 'courses'}
            </p>
          </div>
        ) : undefined
      }
    />
  );

  if (snapshot.enrollments.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          title="No courses yet"
          description="There are no learner enrollments attached to this account. Contact DACFP support if you expected to see a course here."
          action={
            <Link className="button-secondary" to="/account">
              Review account
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {header}

      {/* §2a: FPT is the hero. Resume-first — the primary action is "carry on
          from where you stopped", not "browse a catalog". */}
      {flagship ? (
        <FlagshipHero
          catalog={catalog}
          snapshot={snapshot}
          course={flagship.course}
          enrollment={flagship.enrollment}
        />
      ) : null}

      {/* §2b: renewal as a time-bound event surface, never a peer card. */}
      {renewals.map(({ course, enrollment }) => {
        const view = courseView(catalog, snapshot, course, enrollment);
        return (
          <RenewalEvent
            key={enrollment.id}
            course={course}
            enrollment={enrollment}
            // Dark build: the enrollment existing is the whole signal. Promotion
            // replaces this expression with the real entitlement answer — a prop
            // change here, not a redesign inside RenewalEvent.
            visible
            actionable={view.contentAvailable && Boolean(view.resumeModule)}
            resumePath={view.resumePath}
          />
        );
      })}

      {/* §2c: the library — visually subordinate to the hero. */}
      {library.length > 0 || hidden.length > 0 ? (
        <section aria-labelledby="library-heading">
          <div className="mb-4">
            <p className="eyebrow">Library</p>
            <h2 id="library-heading" className="mt-1 text-xl font-bold text-dacfp-navy">
              Additional courses
            </h2>
            <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
              Bonus material that opens as you progress through the track.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {library.map(({ course, enrollment }) => (
              <LibraryCard
                key={enrollment.id}
                catalog={catalog}
                snapshot={snapshot}
                course={course}
                enrollment={enrollment}
              />
            ))}
            {hidden.map(({ enrollment }) => (
              <HiddenCourseCard key={enrollment.id} enrollment={enrollment} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="card grid gap-5 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <IconTile icon={CheckCircle2} size="lg" tone="positive" />
        <div>
          <h2 className="text-lg font-bold text-dacfp-navy">
            Keep credential details ready for CE reporting
          </h2>
          <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
            Add optional CFP, IWI, and CFA IDs in your account. This portal collects them; CE reporting is a later workflow.
          </p>
        </div>
        <Link className="button-quiet" to="/account">
          Review account <ChevronRight className="size-icon-sm" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
