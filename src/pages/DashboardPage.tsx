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
import { IconTile } from '../components/IconTile';
import { LockedBadge } from '../components/LockedBadge';
import {
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusPill,
  formatDate,
  learnerPath,
} from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  courseProgressPercent,
  enrollmentAccessState,
  isCourseComplete,
  moduleIsPassed,
  moduleIsUnlocked,
  resumeModuleForCourse,
} from '../lib/progress';

export function DashboardPage() {
  const { catalog, snapshot, selectedLearner } = useLms();
  const activeEnrollmentCount = snapshot.enrollments.filter(
    (enrollment) => enrollmentAccessState(enrollment) === 'active',
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learner dashboard"
        title={`Welcome, ${snapshot.profile.display_name}`}
        description="Continue your courses, see exactly what is available next, and keep annual learning access in view."
        action={
          <div className="rounded-lg border border-dacfp-line bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
              Learning access
            </p>
            <p className="mt-1 font-bold text-dacfp-navy">
              {activeEnrollmentCount} active {activeEnrollmentCount === 1 ? 'course' : 'courses'}
            </p>
          </div>
        }
      />

      <section aria-labelledby="course-heading">
        <div className="mb-4">
          <p className="eyebrow">My learning</p>
          <h2 id="course-heading" className="mt-1 text-2xl font-bold text-dacfp-navy">
            Enrolled courses
          </h2>
        </div>

        {snapshot.enrollments.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="There are no learner enrollments attached to this account. Contact DACFP support if you expected to see a course here."
            action={
              <Link className="button-secondary" to={learnerPath('/account', selectedLearner)}>
                Review account
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {snapshot.enrollments.map((enrollment) => {
              const course = catalog.courses.find(
                (item) => item.id === enrollment.course_id,
              );
              if (!course) {
                const hiddenAccessState = enrollmentAccessState(enrollment);
                return (
                  <article key={enrollment.id} className="card flex flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <IconTile icon={ShieldAlert} size="md" tone="gold" />
                      <StatusPill tone="warning">
                        {hiddenAccessState === 'expired' ? 'Access expired' : 'Access unavailable'}
                      </StatusPill>
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-dacfp-navy">
                      {hiddenAccessState === 'expired' ? 'Expired course access' : 'Course access unavailable'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
                      Course details are no longer available to this session. The enrollment remains visible so its access status is not hidden.
                    </p>
                    <p className="mt-5 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
                      {hiddenAccessState === 'expired'
                        ? `Course access expired ${formatDate(enrollment.expires_at)}. This does not itself change designation standing.`
                        : 'Course access is unavailable. Contact DACFP support if you expected this course to remain active.'}
                    </p>
                    <Link className="button-secondary mt-6 self-start" to={learnerPath('/account', selectedLearner)}>
                      Review account
                    </Link>
                  </article>
                );
              }

              const accessState = enrollmentAccessState(enrollment);
              const accessActive = accessState === 'active';
              const unlocked = courseUnlocked(course, snapshot.completions);
              const termsAccepted = termsGateSatisfied(course, enrollment);
              const courseModules = catalog.modules
                .filter((item) => item.course_id === course.id)
                .sort((a, b) => a.position - b.position);
              // Locked or terms-gated catalog rows are intentionally hidden by
              // RLS. An empty visible module set is therefore not completion.
              const complete =
                courseModules.length > 0 && isCourseComplete(catalog, snapshot, course);
              const progress = courseProgressPercent(
                catalog,
                snapshot,
                course,
                enrollment,
              );
              const resumeModule = resumeModuleForCourse(catalog, snapshot, course);
              const enrollmentProgress = snapshot.progress.filter(
                (item) => item.enrollment_id === enrollment.id,
              );
              const resumeLesson = resumeModule
                ? catalog.lessons
                    .filter((lesson) => lesson.module_id === resumeModule.id)
                    .map((lesson) => ({
                      lesson,
                      progress: enrollmentProgress.find(
                        (item) => item.lesson_id === lesson.id,
                      ),
                    }))
                    .filter(({ progress: item }) => item)
                    .sort(
                      (a, b) =>
                        new Date(b.progress!.updated_at).getTime() -
                        new Date(a.progress!.updated_at).getTime(),
                    )
                    .find(({ lesson }) => !lessonComplete(lesson, enrollmentProgress))
                    ?.lesson
                : null;
              const contentAvailable = accessActive && unlocked && termsAccepted;
              const resumePath = resumeLesson
                ? `/lesson/${resumeLesson.id}`
                : resumeModule
                  ? `/course/${course.slug}/module/${resumeModule.position}`
                  : '/dashboard';

              return (
                <article key={enrollment.id} className="card flex flex-col overflow-hidden">
                  <div className="brand-strip h-1" />
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <IconTile
                        icon={contentAvailable ? BookOpen : LockKeyhole}
                        size="md"
                        tone="brand"
                      />
                      {accessState === 'expired' ? (
                        <StatusPill tone="warning">Access expired</StatusPill>
                      ) : accessState === 'revoked' ? (
                        <StatusPill tone="warning">Access unavailable</StatusPill>
                      ) : complete ? (
                        <StatusPill tone="positive">Complete</StatusPill>
                      ) : !unlocked ? (
                        <LockedBadge reason={`${course.title} unlocks once you complete the prerequisite course.`} />
                      ) : !termsAccepted ? (
                        <StatusPill tone="warning">Terms required</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">In progress</StatusPill>
                      )}
                    </div>

                    <h3 className="mt-5 text-xl font-bold text-dacfp-navy">
                      {course.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
                      {course.description}
                    </p>

                    <div className="mt-5 grid gap-3 border-y border-dacfp-line py-4 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-dacfp-gray-text">
                        <Award aria-hidden="true" className="text-dacfp-gold size-icon-sm" />
                        <span>
                          <strong className="text-dacfp-navy">{course.ce_credits ?? 0}</strong>{' '}
                          CE credits
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-dacfp-gray-text">
                        <CalendarClock aria-hidden="true" className="text-dacfp-blue size-icon-sm" />
                        <span>
                          Access {accessState === 'expired' ? 'expired' : 'through'}{' '}
                          <strong className="text-dacfp-navy">
                            {formatDate(enrollment.expires_at)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {accessState === 'expired' ? (
                      <div className="mt-5 flex gap-3 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
                        <ShieldAlert className="mt-0.5 shrink-0 size-icon-md" aria-hidden="true" />
                        <p>
                          This course can no longer be opened. Course access expiry does not itself change designation standing.
                        </p>
                      </div>
                    ) : !unlocked ? (
                      <div className="mt-5 rounded-lg border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
                        Complete FPT to unlock this bonus course. Your enrollment is ready and waiting.
                      </div>
                    ) : (
                      <div className="mt-5">
                        <ProgressBar value={progress} label="Course progress" />
                      </div>
                    )}

                    <div className="mt-5 rounded-lg border border-dacfp-line bg-dacfp-wash p-3">
                      <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
                        Module status
                      </p>
                      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                        {courseModules.map((module) => {
                          const passed = moduleIsPassed(catalog, snapshot, course, module);
                          const moduleUnlocked =
                            contentAvailable &&
                            moduleIsUnlocked(catalog, snapshot, course, module);
                          return (
                            <li
                              className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm"
                              key={module.id}
                            >
                              <span className="min-w-0 truncate font-semibold text-dacfp-navy">
                                Module {module.position}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-dacfp-gray-text">
                                {passed ? (
                                  <CheckCircle2 className="text-status-positive size-icon-sm" aria-hidden="true" />
                                ) : moduleUnlocked ? (
                                  <Clock3 className="text-dacfp-blue size-icon-sm" aria-hidden="true" />
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

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-dacfp-gray-text">
                        Learning access and designation status are governed separately.
                      </p>
                      {contentAvailable && resumeModule ? (
                        <Link
                          className="button-secondary shrink-0"
                          to={learnerPath(resumePath, selectedLearner)}
                        >
                          {complete ? 'Review course' : resumeLesson ? 'Resume lesson' : 'Continue'}
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
                </article>
              );
            })}
          </div>
        )}
      </section>

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
        <Link className="button-quiet" to={learnerPath('/account', selectedLearner)}>
          Review account <ChevronRight className="size-icon-sm" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
