import {
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  LockKeyhole,
  PlayCircle,
  ChevronLeft,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { LockedBadge } from '../components/LockedBadge';
import { ExpiredAccessPanel } from '../components/ExpiredAccessPanel';
import { SecureResourceLink } from '../components/SecureResourceLink';
import { EmptyState, PageHeader, StatusPill } from '../components/common';
import { darkBuildCopy } from '../components/DarkBuild';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import { facultyForModule, facultyInitials } from '../lib/faculty';
import { formatClock } from '../lib/time';
import {
  blockerGuidance,
  courseProgressionBlocker,
  enrollmentAccessState,
  enrollmentForCourse,
  isCourseComplete,
  moduleIsPassed,
  moduleIsUnlocked,
  quizIsAttemptable,
} from '../lib/progress';
import { QUIZ_POLICY_COPY } from '../lib/quizPolicy';
import { moduleCounterLabel } from '../lib/moduleLabel';
import {
  courseForEnrollment,
  expiredEnrollmentForModuleRoute,
} from '../lib/enrollmentCourse';

export function ModulePage() {
  const { slug, n } = useParams();
  const { catalog, snapshot } = useLms();
  const hiddenExpiredEnrollment = expiredEnrollmentForModuleRoute(
    snapshot,
    slug,
    Number(n),
  );
  const course =
    catalog.courses.find((item) => item.slug === slug) ??
    (hiddenExpiredEnrollment
      ? courseForEnrollment(catalog, hiddenExpiredEnrollment)
      : null);
  const module = catalog.modules.find(
    (item) => item.course_id === course?.id && item.position === Number(n),
  );

  if (!course || !module) {
    if (course && hiddenExpiredEnrollment) {
      return (
        <div className="space-y-8">
          <Link className="text-sm font-semibold text-dacfp-gray-text hover:text-dacfp-navy" to="/dashboard">
            ← Dashboard
          </Link>
          <PageHeader
            eyebrow={course.title}
            title="This module is no longer open"
            description="This module remains in your learning record, but its lessons cannot be opened after course access expires."
            action={<StatusPill tone="warning">Access expired</StatusPill>}
          />
          <ExpiredAccessPanel
            enrollment={hiddenExpiredEnrollment}
            headingId="module-expired-access-heading"
          />
        </div>
      );
    }
    return (
      <EmptyState
        title="Module not found"
        description="This module is unavailable or the link is no longer current."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the requested course."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  const accessState = enrollmentAccessState(enrollment);
  if (accessState === 'expired') {
    return (
      <div className="space-y-8">
        <Link className="text-sm font-semibold text-dacfp-gray-text hover:text-dacfp-navy" to="/dashboard">
          ← Dashboard
        </Link>
        <PageHeader
          eyebrow={`${course.title} · Module ${module.position}`}
          title={module.title}
          description="This module remains in your learning record, but its lessons cannot be opened after course access expires."
          action={<StatusPill tone="warning">Access expired</StatusPill>}
        />
        <ExpiredAccessPanel enrollment={enrollment} headingId="module-expired-access-heading" />
      </div>
    );
  }

  const accessActive = accessState === 'active';
  const courseIsUnlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const currentModuleUnlocked = moduleIsUnlocked(catalog, snapshot, course, module);
  const contentAccessible = accessActive && courseIsUnlocked && termsAccepted && currentModuleUnlocked;
  const moduleLessons = catalog.lessons
    .filter((item) => item.module_id === module.id)
    .sort((a, b) => a.position - b.position);
  const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
  const canAttemptQuiz = quiz ? quizIsAttemptable(catalog, snapshot, course, module) : false;
  const enrollmentProgress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const enrollmentSurveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const courseModules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  const blocker = !currentModuleUnlocked && accessActive && courseIsUnlocked && termsAccepted
    ? courseProgressionBlocker(catalog, snapshot, course)
    : null;
  const blockerCopy = blocker ? blockerGuidance(blocker, module) : null;
  const passed = moduleIsPassed(catalog, snapshot, course, module);
  const courseComplete = isCourseComplete(catalog, snapshot, course);
  const nextModule = courseModules.find((item) => item.position === module.position + 1);
  const faculty = facultyForModule(course, module);
  const quizAttempts = quiz
    ? snapshot.attempts.filter(
        (attempt) => attempt.enrollment_id === enrollment.id && attempt.quiz_id === quiz.id,
      )
    : [];
  const passedAttempts = quizAttempts.filter((attempt) => attempt.passed).length;
  const totalMinutes = Math.round(
    moduleLessons.reduce((total, lesson) => total + (lesson.duration_seconds ?? 0), 0) / 60,
  );
  const eyebrowMeta = [
    moduleCounterLabel(module, courseModules),
    totalMinutes > 0 ? `${totalMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="text-sm font-semibold text-dacfp-gray-text hover:text-dacfp-navy" to="/dashboard">
          ← Dashboard
        </Link>
        <p className="text-xs tabular-nums text-dacfp-gray-text">{course.title}</p>
      </div>

      <PageHeader
        eyebrow={eyebrowMeta}
        title={module.title}
        description={
          courseComplete
            ? 'Course complete: every module and lesson is open for review in any order.'
            : course.progression === 'open'
            ? 'Open progression: complete these lessons in any order.'
            : `Complete each required lesson, then pass the module quiz with ${quiz?.pass_pct ?? 70}% or higher. Modules unlock in order.`
        }
        action={
          passed ? (
            <StatusPill tone="positive">Passed</StatusPill>
          ) : contentAccessible ? (
            <StatusPill tone="neutral">Available</StatusPill>
          ) : (
            <StatusPill tone="muted">Locked</StatusPill>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="lesson-list-heading" className="min-w-0 space-y-6">
          {!contentAccessible ? (
            <div className="card flex gap-4 p-6">
              <LockKeyhole className="mt-0.5 shrink-0 text-dacfp-gold size-icon-lg" aria-hidden="true" />
              <div>
                <h3 className="font-bold text-dacfp-navy">Content is not available yet</h3>
                <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
                  {!courseIsUnlocked
                    ? 'Complete FPT to unlock this bonus curriculum.'
                    : accessState === 'revoked'
                      ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                    : !termsAccepted
                      ? 'Accept the course terms before opening content.'
                      : blockerCopy
                        ? blockerCopy.message
                        : 'Complete the previous module to continue.'}
                </p>
                {blocker && blockerCopy ? (
                  <Link className="button-secondary mt-4" to={blocker.path}>
                    {blockerCopy.action}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* The static faculty layer (DESIGN-DIRECTION §2): per-module
              instructor card, presentation content only. */}
          <div className="card flex items-start gap-4 p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-full border border-dacfp-line bg-dacfp-wash text-base font-bold text-dacfp-navy"
            >
              {facultyInitials(faculty)}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
                Your instructor
              </p>
              <p className="mt-1 font-bold text-dacfp-navy">{faculty.name}</p>
              <p className="mt-1 max-w-prose text-sm leading-6 text-dacfp-gray-text">{faculty.bio}</p>
              {faculty.placeholder ? (
                <p className="mt-2 text-xs text-dacfp-gray-text">
                  {darkBuildCopy(
                    'Sandbox faculty placeholder — real instructor profiles arrive with course content.',
                    'Instructor profile coming soon.',
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <h2
              id="lesson-list-heading"
              className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text"
            >
              In this module
            </h2>

            {moduleLessons.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No lessons published"
                  description="This module does not contain learner lessons yet. Return to the dashboard and choose another available course."
                  action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
                />
              </div>
            ) : (
              <ol className="card mt-3">
                {moduleLessons.map((lesson, index) => {
                  const complete = lessonComplete(
                    lesson,
                    enrollmentProgress,
                    enrollmentSurveyResponses,
                  );
                  const lessonResources = catalog.resources.filter(
                    (resource) => resource.lesson_id === lesson.id,
                  );
                  const Icon = complete
                    ? CheckCircle2
                    : lesson.kind === 'video'
                      ? PlayCircle
                      : lesson.kind === 'survey'
                        ? ClipboardList
                        : FileText;
                  return (
                    <li
                      key={lesson.id}
                      className={index === 0 ? undefined : 'border-t border-dacfp-line/60'}
                    >
                      <div className={`flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:px-6 ${lesson.kind === 'video' ? 'py-5' : 'bg-dacfp-wash/60 py-3'}`}>
                        <Icon
                          className={`size-icon-md shrink-0 ${complete ? 'text-status-positive' : 'text-dacfp-blue'}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={`text-sm text-dacfp-navy ${lesson.kind === 'video' ? 'font-bold' : 'font-semibold'}`}>
                              {lesson.position}. {lesson.title}
                            </h3>
                            {!lesson.is_required ? <StatusPill tone="muted">Optional</StatusPill> : null}
                            {lesson.kind === 'survey' ? <StatusPill tone="neutral">Survey</StatusPill> : null}
                          </div>
                          <p className="mt-0.5 text-xs tabular-nums text-dacfp-gray-text">
                            {lesson.kind === 'video'
                              ? `${formatClock(lesson.duration_seconds)} compliance video · 1×`
                              : lesson.kind === 'survey'
                                ? lesson.is_required
                                  ? quiz
                                    ? 'Does not gate the quiz · Required to finish the course'
                                    : 'Required to finish the course'
                                  : 'Optional feedback · Does not gate the quiz'
                                : 'Reading'}
                            {complete ? ' · Complete' : ''}
                          </p>
                        </div>
                        {contentAccessible ? (
                          <Link className="button-secondary shrink-0" to={`/lesson/${lesson.id}`}>
                            {complete ? 'Review' : 'Open'}
                          </Link>
                        ) : (
                          // A badge, not a button-shaped span with aria-disabled:
                          // there is no action here, so it should not wear an
                          // action's clothes.
                          <LockedBadge
                            className="shrink-0 self-start sm:self-auto"
                            reason={`${lesson.title} opens once this module is available to you.`}
                          />
                        )}
                      </div>
                      {lessonResources.length > 0 ? (
                        <div className="border-t border-dacfp-line/60 bg-dacfp-wash px-5 py-3 sm:px-6">
                          <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">Resources</p>
                          <ul className="mt-2 space-y-2">
                            {lessonResources.map((resource) => (
                              <li key={resource.id}>
                                {contentAccessible ? (
                                  <SecureResourceLink
                                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-dacfp-blue hover:underline"
                                    resource={resource}
                                  />
                                ) : (
                                  <span className="inline-flex min-h-11 items-center gap-2 text-sm text-dacfp-gray-text">
                                    <LockKeyhole className="size-icon-sm" aria-hidden="true" />
                                    {resource.title}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24">
          {quiz ? (
            <section
              aria-labelledby="quiz-heading"
              className="card border-t-[3px] border-t-dacfp-gold-text p-5 sm:p-6"
            >
              <p className="eyebrow text-dacfp-gold-text">Quiz</p>
              <h2 id="quiz-heading" className="mt-1.5 text-lg font-bold text-dacfp-navy">
                Module {module.position} quiz
              </h2>
              <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
                A short check of understanding — not an exam.{' '}
                {nextModule && course.progression === 'sequential'
                  ? `Passing opens Module ${nextModule.position}.`
                  : 'Passing completes this module.'}{' '}
                Retake as many times as you need.
              </p>
              <dl className="mt-4 space-y-2 border-t border-dacfp-line/60 pt-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-dacfp-gray-text">Questions</dt>
                  <dd className="font-semibold tabular-nums text-dacfp-navy">{quiz.question_count}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-dacfp-gray-text">To pass</dt>
                  <dd className="font-semibold tabular-nums text-dacfp-navy">{quiz.pass_pct}% or higher</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-dacfp-gray-text">Attempts</dt>
                  <dd className="font-semibold text-dacfp-navy">Unlimited, no waiting period</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-dacfp-gray-text">Your record</dt>
                  <dd className={`font-semibold tabular-nums ${passedAttempts > 0 ? 'text-dacfp-blue' : 'text-dacfp-navy'}`}>
                    {quizAttempts.length === 0
                      ? 'No attempts yet'
                      : `${passedAttempts} of ${quizAttempts.length} passed`}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-dacfp-gray-text">
                {QUIZ_POLICY_COPY}
              </p>
              {canAttemptQuiz && contentAccessible ? (
                <>
                  <Link className="button-primary mt-4 w-full" to={`/quiz/${module.id}`}>
                    {passed ? 'Review or retake the quiz' : 'Start the quiz'}
                  </Link>
                  <p className="mt-2 text-center text-xs text-dacfp-gray-text">
                    Open now — this module’s required lessons are complete
                  </p>
                </>
              ) : (
                <>
                  <span
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[0.1875rem] bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-gray-text"
                    aria-disabled="true"
                  >
                    <LockKeyhole className="size-icon-sm" aria-hidden="true" />
                    Quiz not open yet
                  </span>
                  <p className="mt-2 text-center text-xs text-dacfp-gray-text">
                    {contentAccessible
                      ? "Opens when this module's lessons are complete."
                      : 'Opens when this module is available to you'}
                  </p>
                </>
              )}
            </section>
          ) : (
            <section className="card p-5 sm:p-6">
              <p className="eyebrow text-dacfp-gold-text">Quiz</p>
              <h2 className="mt-1.5 text-lg font-bold text-dacfp-navy">No quiz for this module</h2>
              <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
                This open-course module passes when all required lessons are complete.
              </p>
            </section>
          )}

          <section aria-label="Course modules" className="card p-5">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
              The course from here
            </p>
            <ol className="mt-3">
              {courseModules.map((item, index) => {
                const unlocked = moduleIsUnlocked(catalog, snapshot, course, item) && courseIsUnlocked && termsAccepted;
                const outlineAvailable = unlocked && accessActive;
                const active = item.id === module.id;
                const itemPassed = moduleIsPassed(catalog, snapshot, course, item);
                const outlineContent = (
                  <>
                    <span
                      className={`w-6 shrink-0 text-xs font-bold tabular-nums ${active ? 'text-dacfp-gold-text' : 'text-dacfp-gray-text'}`}
                      aria-hidden="true"
                    >
                      {item.position}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{item.title}</span>
                    <span className="shrink-0" aria-hidden="true">
                      {itemPassed ? (
                        <CheckCircle2 className="size-icon-sm text-dacfp-blue" />
                      ) : outlineAvailable ? (
                        <Circle className="size-icon-sm text-dacfp-gray-text" />
                      ) : (
                        <LockKeyhole className="size-icon-sm text-dacfp-gray-text" />
                      )}
                    </span>
                    <span className="sr-only">
                      {itemPassed ? 'Passed' : outlineAvailable ? 'Open' : 'Locked'}
                    </span>
                  </>
                );
                const rowBorder = index === 0 ? '' : ' border-t border-dacfp-line/60';
                return (
                  <li key={item.id}>
                    {outlineAvailable ? (
                      <Link
                        to={`/course/${course.slug}/module/${item.position}`}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-11 items-center gap-3 py-2 transition-colors hover:bg-dacfp-wash ${
                          active ? 'font-bold text-dacfp-navy' : 'font-semibold text-dacfp-navy'
                        }${rowBorder}`}
                      >
                        {outlineContent}
                      </Link>
                    ) : (
                      <span
                        className={`flex min-h-11 items-center gap-3 py-2 font-semibold text-dacfp-gray-text${rowBorder}`}
                        aria-disabled="true"
                      >
                        {outlineContent}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <Link
              className="mt-3 inline-block border-b border-dacfp-gold text-sm font-semibold text-dacfp-navy hover:text-dacfp-gold-text"
              to="/dashboard"
            >
              Full course of study →
            </Link>
          </section>
        </aside>
      </div>

      <Link className="button-quiet" to={'/dashboard'}>
        <ChevronLeft className="size-icon-sm" aria-hidden="true" /> Back to dashboard
      </Link>
    </div>
  );
}
