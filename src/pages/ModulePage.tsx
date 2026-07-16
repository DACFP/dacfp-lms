import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  LockKeyhole,
  PlayCircle,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, StatusPill, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  enrollmentForCourse,
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
    return <EmptyState title="Module not found" description="This synthetic route does not match a module in the D0 catalog." />;
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return <EmptyState title="No enrollment" description="The selected synthetic learner is not enrolled in this course." />;
  }

  const courseIsUnlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const currentModuleUnlocked = moduleIsUnlocked(catalog, snapshot, course, module);
  const contentAccessible = courseIsUnlocked && termsAccepted && currentModuleUnlocked;
  const moduleLessons = catalog.lessons.filter((item) => item.module_id === module.id);
  const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
  const canAttemptQuiz = quiz ? quizIsAttemptable(catalog, snapshot, course, module) : false;
  const enrollmentProgress = snapshot.progress.filter((item) => item.enrollment_id === enrollment.id);
  const courseModules = catalog.modules.filter((item) => item.course_id === course.id);

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
        action={<StatusPill tone={contentAccessible ? 'positive' : 'warning'}>{contentAccessible ? 'Available' : 'Locked'}</StatusPill>}
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
                    : !termsAccepted
                      ? 'Accept the course terms before opening content.'
                      : 'Pass the previous module quiz to continue.'}
                </p>
              </div>
            </div>
          ) : null}

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
                          <li key={resource.id} className="flex items-center gap-2 text-sm text-brand-royal">
                            <Download size={16} aria-hidden="true" />
                            <span>{resource.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {quiz ? (
            <div className="card flex flex-col gap-5 border-l-4 border-l-brand-gold p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Module quiz</p>
                <h2 className="mt-1 text-lg font-bold text-brand-navy">{quiz.question_count} questions · {quiz.pass_pct}% to pass</h2>
                <p className="mt-1 text-sm text-dacfp-slate">Unlimited attempts. No cumulative exam.</p>
              </div>
              <Link
                className={canAttemptQuiz && contentAccessible ? 'button-primary' : 'pointer-events-none inline-flex min-h-11 items-center gap-2 rounded-lg bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-slate opacity-60'}
                aria-disabled={!canAttemptQuiz || !contentAccessible}
                to={learnerPath(`/quiz/${module.id}`, selectedLearner)}
              >
                {!canAttemptQuiz ? <LockKeyhole size={16} aria-hidden="true" /> : null}
                {canAttemptQuiz ? 'Open quiz' : 'Complete required lessons'}
              </Link>
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
              const active = item.id === module.id;
              return (
                <li key={item.id}>
                  <Link
                    to={learnerPath(`/course/${course.slug}/module/${item.position}`, selectedLearner)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-brand-navy text-white' : unlocked ? 'text-brand-navy hover:bg-dacfp-wash-blue' : 'pointer-events-none text-dacfp-mist'}`}
                    aria-disabled={!unlocked}
                  >
                    {unlocked ? <Circle size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
                    <span>Module {item.position}: {item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-dacfp-line px-2 pt-4 text-xs leading-5 text-dacfp-slate">
            Current module logic is derived from lesson progress and passed attempts.
          </p>
        </aside>
      </div>
    </div>
  );
}
