import {
  CheckCircle2,
  Circle,
  FileText,
  LockKeyhole,
  PlayCircle,
  ChevronLeft,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { SecureResourceLink } from '../components/SecureResourceLink';
import { EmptyState, PageHeader, StatusPill, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  enrollmentAccessState,
  enrollmentForCourse,
  moduleIsPassed,
  moduleIsUnlocked,
  quizIsAttemptable,
} from '../lib/progress';

export function ModulePage() {
  const { slug, n } = useParams();
  const { catalog, snapshot, selectedLearner } = useLms();
  const course = catalog.courses.find((item) => item.slug === slug);
  const module = catalog.modules.find(
    (item) => item.course_id === course?.id && item.position === Number(n),
  );

  if (!course || !module) {
    return (
      <EmptyState
        title="Module not found"
        description="This module is unavailable or the link is no longer current."
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
      />
    );
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the requested course."
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
      />
    );
  }

  const accessState = enrollmentAccessState(enrollment);
  const accessActive = accessState === 'active';
  const courseIsUnlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const currentModuleUnlocked = moduleIsUnlocked(catalog, snapshot, course, module);
  const contentAccessible = accessActive && courseIsUnlocked && termsAccepted && currentModuleUnlocked;
  const moduleLessons = catalog.lessons.filter((item) => item.module_id === module.id);
  const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
  const canAttemptQuiz = quiz ? quizIsAttemptable(catalog, snapshot, course, module) : false;
  const enrollmentProgress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const courseModules = catalog.modules.filter((item) => item.course_id === course.id);
  const passed = moduleIsPassed(catalog, snapshot, course, module);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${course.title} · Module ${module.position} of ${courseModules.length}`}
        title={module.title}
        description={
          course.progression === 'open'
            ? 'Open progression: complete these lessons in any order.'
            : 'Sequential progression: complete each required lesson, then pass the module quiz with 70% or higher.'
        }
        action={
          <StatusPill tone={passed ? 'positive' : contentAccessible ? 'neutral' : 'warning'}>
            {passed ? 'Passed' : accessState === 'expired' ? 'Access expired' : contentAccessible ? 'Available' : 'Locked'}
          </StatusPill>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="lesson-list-heading" className="space-y-4">
          <div>
            <p className="eyebrow">Module content</p>
            <h2 id="lesson-list-heading" className="mt-1 text-2xl font-bold text-brand-navy">Lessons and resources</h2>
          </div>

          {!contentAccessible ? (
            <div className="card flex gap-4 p-6">
              <LockKeyhole className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" size={22} />
              <div>
                <h3 className="font-bold text-brand-navy">Content is not available yet</h3>
                <p className="mt-1 text-sm leading-6 text-dacfp-slate">
                  {!courseIsUnlocked
                    ? 'Complete FPT to unlock this bonus curriculum.'
                    : accessState === 'expired'
                      ? enrollment.expires_at
                        ? `Course access expired on ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(enrollment.expires_at))}. Designation standing is governed separately.`
                        : 'Course access is marked expired without an expiry date. Designation standing is governed separately.'
                      : accessState === 'revoked'
                        ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                    : !termsAccepted
                      ? 'Accept the course terms before opening content.'
                      : 'Pass the previous module quiz to continue.'}
                </p>
              </div>
            </div>
          ) : null}

          {moduleLessons.length === 0 ? (
            <EmptyState
              title="No lessons published"
              description="This module does not contain learner lessons yet. Return to the dashboard and choose another available course."
              action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
            />
          ) : (
          <ol className="space-y-3">
            {moduleLessons.map((lesson) => {
              const complete = lessonComplete(lesson, enrollmentProgress);
              const lessonResources = catalog.resources.filter((resource) => resource.lesson_id === lesson.id);
              return (
                <li key={lesson.id} className="card overflow-hidden">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${complete ? 'bg-status-positive/10 text-status-positive' : 'bg-dacfp-wash-blue text-brand-royal'}`}>
                      {complete ? <CheckCircle2 aria-hidden="true" size={21} /> : lesson.kind === 'video' ? <PlayCircle aria-hidden="true" size={21} /> : <FileText aria-hidden="true" size={21} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-brand-navy">{lesson.position}. {lesson.title}</h3>
                        {!lesson.is_required ? <StatusPill tone="neutral">Optional</StatusPill> : null}
                      </div>
                      <p className="mt-1 text-sm text-dacfp-slate">
                        {lesson.kind === 'video' ? `${Math.round((lesson.duration_seconds ?? 0) / 60)} min compliance video · 1×` : 'Reading'}
                      </p>
                    </div>
                    {contentAccessible ? (
                      <Link className="button-secondary shrink-0" to={learnerPath(`/lesson/${lesson.id}`, selectedLearner)}>
                        {complete ? 'Review' : 'Open'}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-dacfp-wash px-4 text-sm font-bold text-dacfp-slate" aria-disabled="true">
                        <LockKeyhole size={15} aria-hidden="true" /> Locked
                      </span>
                    )}
                  </div>
                  {lessonResources.length > 0 ? (
                    <div className="border-t border-dacfp-line bg-dacfp-wash px-5 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-dacfp-slate">Resources</p>
                      <ul className="mt-2 space-y-2">
                        {lessonResources.map((resource) => (
                          <li key={resource.id}>
                            {contentAccessible ? (
                              <SecureResourceLink
                                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-royal hover:underline"
                                resource={resource}
                              />
                            ) : (
                              <span className="inline-flex min-h-11 items-center gap-2 text-sm text-dacfp-slate">
                                <LockKeyhole size={15} aria-hidden="true" />
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

          {quiz ? (
            <div className="card flex flex-col gap-5 border-l-4 border-l-brand-gold p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Module quiz</p>
                <h2 className="mt-1 text-lg font-bold text-brand-navy">{quiz.question_count} questions · {quiz.pass_pct}% to pass</h2>
                <p className="mt-1 text-sm text-dacfp-slate">Unlimited attempts. No cumulative exam.</p>
              </div>
              {canAttemptQuiz && contentAccessible ? (
                <Link
                  className="button-primary"
                  to={learnerPath(`/quiz/${module.id}`, selectedLearner)}
                >
                  {passed ? 'Review or retake quiz' : 'Open quiz'}
                </Link>
              ) : (
                <span
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-slate opacity-70"
                  aria-disabled="true"
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  {contentAccessible ? 'Complete required lessons' : 'Quiz unavailable'}
                </span>
              )}
            </div>
          ) : (
            <div className="card p-6">
              <h2 className="font-bold text-brand-navy">No quiz for this module</h2>
              <p className="mt-1 text-sm leading-6 text-dacfp-slate">This open-course module passes when all required lessons are complete.</p>
            </div>
          )}
        </section>

        <aside aria-label="Course modules" className="card h-fit p-4 lg:sticky lg:top-4">
          <p className="eyebrow px-2 pt-1">Course outline</p>
          <ol className="mt-3 space-y-1">
            {courseModules.map((item) => {
              const unlocked = moduleIsUnlocked(catalog, snapshot, course, item) && courseIsUnlocked && termsAccepted;
              const outlineAvailable = unlocked && accessActive;
              const active = item.id === module.id;
              const itemPassed = moduleIsPassed(catalog, snapshot, course, item);
              const outlineContent = (
                <>
                  {itemPassed ? (
                    <CheckCircle2 size={17} aria-hidden="true" />
                  ) : outlineAvailable ? (
                    <Circle size={17} aria-hidden="true" />
                  ) : (
                    <LockKeyhole size={17} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">Module {item.position}: {item.title}</span>
                  <span className="text-xs opacity-75">
                    {itemPassed ? 'Passed' : outlineAvailable ? 'Open' : 'Locked'}
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {outlineAvailable ? (
                    <Link
                      to={learnerPath(`/course/${course.slug}/module/${item.position}`, selectedLearner)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-dacfp-wash-blue'}`}
                    >
                      {outlineContent}
                    </Link>
                  ) : (
                    <span
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-dacfp-wash-blue text-brand-navy' : 'text-dacfp-mist'}`}
                      aria-disabled="true"
                    >
                      {outlineContent}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-dacfp-line px-2 pt-4 text-xs leading-5 text-dacfp-slate">
            Current module logic is derived from lesson progress and passed attempts.
          </p>
        </aside>
      </div>

      <Link className="button-quiet" to={learnerPath('/dashboard', selectedLearner)}>
        <ChevronLeft size={17} aria-hidden="true" /> Back to dashboard
      </Link>
    </div>
  );
}
