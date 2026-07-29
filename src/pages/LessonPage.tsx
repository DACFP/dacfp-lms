import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  LockKeyhole,
} from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/Alert';
import { ExpiredAccessPanel } from '../components/ExpiredAccessPanel';
import { LockedBadge } from '../components/LockedBadge';
import { EmptyState, PageHeader, StatusPill } from '../components/common';
import { LessonPlayer } from '../components/LessonPlayer';
import { SecureResourceLink } from '../components/SecureResourceLink';
import { darkBuildCopy } from '../components/DarkBuild';
import { Skeleton } from '@/components/ui/skeleton';
import { SurveyLesson } from '../components/SurveyLesson';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  enrollmentAccessState,
  enrollmentForCourse,
  moduleIsUnlocked,
} from '../lib/progress';
import { expiredEnrollmentForLesson } from '../lib/enrollmentCourse';
import { moduleCounterLabel } from '../lib/moduleLabel';

/**
 * react-markdown brings the whole unified/remark/rehype pipeline (~190 kB raw)
 * — more than every other learner dependency combined. Only reading lessons
 * need it, so it is a chunk of its own rather than a tax on the dashboard, the
 * quiz and the player. Same reasoning as the /admin split (M-12).
 */
const Markdown = lazy(() =>
  import('../components/Markdown').then((module) => ({ default: module.Markdown })),
);

function ReadingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="mt-4">
      <span className="sr-only">Loading reading</span>
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function LessonPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { catalog, snapshot, completeReading, submitSurvey } = useLms();
  const [savingReading, setSavingReading] = useState(false);
  const [readingError, setReadingError] = useState('');
  const lesson = catalog.lessons.find((item) => item.id === id);
  const module = catalog.modules.find((item) => item.id === lesson?.module_id);
  const course = catalog.courses.find((item) => item.id === module?.course_id);
  const hiddenExpiredEnrollment = expiredEnrollmentForLesson(snapshot, id);

  if (!lesson || !module || !course) {
    if (hiddenExpiredEnrollment) {
      return (
        <div className="space-y-8">
          <PageHeader
            eyebrow="Course lesson"
            title="This lesson is no longer open"
            description="This lesson remains in your learning record, but the player and lesson content cannot be opened after course access expires."
            action={<StatusPill tone="warning">Access expired</StatusPill>}
          />
          <ExpiredAccessPanel
            enrollment={hiddenExpiredEnrollment}
            headingId="lesson-expired-access-heading"
          />
          <Link className="button-secondary" to="/dashboard">
            <ArrowLeft className="size-icon-sm" aria-hidden="true" />
            Back to dashboard
          </Link>
        </div>
      );
    }
    return (
      <EmptyState
        title="Lesson not found"
        description="This lesson is unavailable or the link is no longer current."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the course that contains this lesson."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  const accessState = enrollmentAccessState(enrollment);
  if (accessState === 'expired') {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow={`${course.title} · Module ${module.position} · Lesson ${lesson.position}`}
          title={lesson.title}
          description="This lesson remains in your learning record, but the player and lesson content cannot be opened after course access expires."
          action={<StatusPill tone="warning">Access expired</StatusPill>}
        />
        <ExpiredAccessPanel enrollment={enrollment} headingId="lesson-expired-access-heading" />
        <Link className="button-secondary" to="/dashboard">
          <ArrowLeft className="size-icon-sm" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    );
  }

  const accessible =
    accessState === 'active' &&
    courseUnlocked(course, snapshot.completions) &&
    termsGateSatisfied(course, enrollment) &&
    moduleIsUnlocked(catalog, snapshot, course, module);
  const progress = snapshot.progress.find(
    (item) => item.enrollment_id === enrollment.id && item.lesson_id === lesson.id,
  );
  const complete = lessonComplete(
    lesson,
    snapshot.progress.filter((item) => item.enrollment_id === enrollment.id),
    snapshot.surveyResponses.filter((item) => item.enrollment_id === enrollment.id),
  );
  const started = complete || Boolean(
    progress && (progress.last_position_seconds > 0 || progress.max_watched_seconds > 0),
  );
  const courseModules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  const moduleLessons = catalog.lessons
    .filter((item) => item.module_id === module.id)
    .sort((a, b) => a.position - b.position);
  const lessonIndex = moduleLessons.findIndex((item) => item.id === lesson.id);
  const previous = moduleLessons[lessonIndex - 1];
  const next = moduleLessons[lessonIndex + 1];
  const resources = catalog.resources.filter((resource) => resource.lesson_id === lesson.id);
  const enrollmentProgress = snapshot.progress.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const enrollmentSurveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const moduleLabel = moduleCounterLabel(module, courseModules);
  const requiredModuleLessons = moduleLessons.filter((item) => item.is_required);
  const optionalLessonCount = moduleLessons.length - requiredModuleLessons.length;
  const requiredCompleteCount = requiredModuleLessons.filter((item) =>
    lessonComplete(item, enrollmentProgress, enrollmentSurveyResponses)
  ).length;
  const moduleQuiz = catalog.quizzes.find((item) => item.module_id === module.id);
  const replaySeconds = searchParams.get('replay') === '30' ? 30 : 0;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${course.title} · Module ${module.position} · Lesson ${lesson.position}`}
        title={lesson.title}
        description={lesson.is_required
          ? lesson.kind === 'video'
            ? 'Required video progress completes when your furthest watched point reaches 95%.'
            : lesson.kind === 'survey'
              ? moduleQuiz
                ? 'Submit once. This survey does not gate the quiz and is required to finish the course.'
                : 'Submit once. Required to finish the course.'
              : 'Read the material, then mark the lesson complete.'
          : lesson.kind === 'video'
            ? 'Optional reference video. Watch it whenever it is useful; it does not gate the quiz or course completion.'
            : lesson.kind === 'survey'
              ? 'Submit once if you choose. This optional survey does not gate the quiz or course completion.'
              : 'Optional reading. Mark it complete if you choose; it does not gate the quiz or course completion.'}
        action={
          <StatusPill tone={complete ? 'positive' : accessible ? 'neutral' : 'warning'}>
            {complete ? 'Complete' : !accessible ? 'Locked' : started ? 'In progress' : 'Not started'}
          </StatusPill>
        }
      />

      <details className="card group" open>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-dacfp-navy sm:px-6">
          <span>{moduleLabel} · lesson checklist</span>
          <span className="text-xs font-semibold tabular-nums text-dacfp-gray-text">
            {requiredCompleteCount}/{requiredModuleLessons.length} complete
            {optionalLessonCount > 0 ? ` · ${optionalLessonCount} optional` : ''}
          </span>
        </summary>
        <ol className="border-t border-dacfp-line">
          {moduleLessons.map((item, index) => {
            const itemComplete = lessonComplete(
              item,
              enrollmentProgress,
              enrollmentSurveyResponses,
            );
            return (
              <li key={item.id} className={index === 0 ? undefined : 'border-t border-dacfp-line/60'}>
                <Link
                  className={`flex min-h-12 items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-dacfp-wash sm:px-6 ${item.id === lesson.id ? 'font-bold text-dacfp-navy' : 'font-semibold text-dacfp-gray-text'}`}
                  to={`/lesson/${item.id}`}
                  aria-current={item.id === lesson.id ? 'page' : undefined}
                >
                  {itemComplete ? (
                    <CheckCircle2 className="size-icon-sm shrink-0 text-status-positive" aria-hidden="true" />
                  ) : (
                    <Circle className="size-icon-sm shrink-0 text-dacfp-gray-text" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">{item.position}. {item.title}</span>
                  <span className="text-xs font-normal text-dacfp-gray-text">
                    {itemComplete ? 'Complete' : item.id === lesson.id ? 'Current' : 'Not complete'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </details>

      {!accessible ? (
        <section className="card flex gap-4 p-6">
          <LockKeyhole className="mt-0.5 shrink-0 text-dacfp-gold size-icon-lg" aria-hidden="true" />
          <div>
            <h2 className="font-bold text-dacfp-navy">This lesson is locked</h2>
            <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
              {accessState === 'revoked'
                  ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                  : 'Complete the prerequisite course, terms acknowledgment, or previous module before opening this content.'}
            </p>
            <Link className="button-quiet mt-3" to={`/course/${course.slug}/module/${module.position}`}>
              Return to module
            </Link>
          </div>
        </section>
      ) : lesson.kind === 'video' ? (
        <LessonPlayer
          key={lesson.id}
          course={course}
          lesson={lesson}
          progress={progress}
          initialResumeOffsetSeconds={replaySeconds}
        />
      ) : lesson.kind === 'survey' ? (
        <SurveyLesson
          sections={catalog.surveySections
            .filter((section) => section.lesson_id === lesson.id)
            .sort((a, b) => a.position - b.position)}
          questions={catalog.surveyQuestions
            .filter((question) => question.lesson_id === lesson.id)
            .sort((a, b) => a.position - b.position)}
          response={snapshot.surveyResponses.find(
            (item) =>
              item.enrollment_id === enrollment.id && item.lesson_id === lesson.id,
          ) ?? null}
          onSubmit={(submission) => submitSurvey(lesson.id, submission)}
        />
      ) : (
        <article className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 text-dacfp-blue">
            <FileText className="size-icon-lg" aria-hidden="true" />
            <p className="eyebrow">{lesson.is_required ? 'Required reading' : 'Optional reading'}</p>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-dacfp-navy">Lesson reading</h2>
          {/* brief #16: authored markdown, rendered and sanitised. This was
              {lesson.body_md} inside a <p>, so "## " and "**" reached the
              learner as literal characters. */}
          <Suspense fallback={<ReadingSkeleton />}>
            <Markdown className="mt-4">{lesson.body_md ?? ''}</Markdown>
          </Suspense>
          <div className="mt-8 flex flex-col items-start gap-3 rounded-[0.1875rem] border border-dacfp-line bg-dacfp-wash p-4 text-sm leading-6 text-dacfp-gray-text">
            <p>Reading completion is recorded securely against your enrollment.</p>
            <button
              className="button-primary"
              disabled={complete || savingReading}
              onClick={() => {
                setSavingReading(true);
                setReadingError('');
                void completeReading(lesson.id)
                  .catch(() => setReadingError('Unable to complete this reading. Please retry.'))
                  .finally(() => setSavingReading(false));
              }}
              type="button"
            >
              <CheckCircle2 className="size-icon-sm" aria-hidden="true" />
              {complete ? 'Reading complete' : savingReading ? 'Saving…' : 'Mark reading complete'}
            </button>
            {readingError ? <Alert tone="danger">{readingError}</Alert> : null}
          </div>
        </article>
      )}

      <section aria-labelledby="resources-heading" className="card p-6">
        <div className="flex items-center gap-3">
          <Download className="text-dacfp-blue size-icon-md" aria-hidden="true" />
          <h2 id="resources-heading" className="text-lg font-bold text-dacfp-navy">Lesson resources</h2>
        </div>
        {resources.length > 0 ? (
          <ul className="mt-4 divide-y divide-dacfp-line rounded-[0.1875rem] border border-dacfp-line">
            {resources.map((resource) => (
              <li key={resource.id}>
                {accessible ? (
                  <SecureResourceLink
                    className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 font-semibold text-dacfp-blue hover:bg-dacfp-wash-blue"
                    resource={resource}
                  />
                ) : (
                  <span className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 font-semibold text-dacfp-gray-text">
                    <span>{resource.title}</span>
                    <LockedBadge reason={`${resource.title} unlocks with this lesson.`} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-dacfp-gray-text">{darkBuildCopy('No downloads accompany this synthetic lesson.', 'No downloads accompany this lesson.')}</p>
        )}
      </section>

      <nav aria-label="Lesson navigation" className="flex flex-col gap-3 border-t border-dacfp-line pt-6 sm:flex-row sm:justify-between">
        {accessible && previous ? (
          <Link className="button-secondary" to={`/lesson/${previous.id}`}>
            <ArrowLeft className="size-icon-sm" aria-hidden="true" /> Previous lesson
          </Link>
        ) : <span />}
        {accessible && next ? (
          <Link className="button-primary" to={`/lesson/${next.id}`}>
            Next lesson <ArrowRight className="size-icon-sm" aria-hidden="true" />
          </Link>
        ) : (
          <Link className="button-primary" to={`/course/${course.slug}/module/${module.position}`}>
            Module overview <CheckCircle2 className="size-icon-sm" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}
