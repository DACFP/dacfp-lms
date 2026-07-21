import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  LockKeyhole,
} from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '../components/Alert';
import { LockedBadge } from '../components/LockedBadge';
import { EmptyState, PageHeader, StatusPill } from '../components/common';
import { LessonPlayer } from '../components/LessonPlayer';
import { SecureResourceLink } from '../components/SecureResourceLink';
import { darkBuildCopy } from '../components/DarkBuild';
import { Skeleton } from '@/components/ui/skeleton';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  enrollmentAccessState,
  enrollmentForCourse,
  moduleIsUnlocked,
} from '../lib/progress';

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
  const { catalog, snapshot, completeReading } = useLms();
  const [savingReading, setSavingReading] = useState(false);
  const [readingError, setReadingError] = useState('');
  const lesson = catalog.lessons.find((item) => item.id === id);
  const module = catalog.modules.find((item) => item.id === lesson?.module_id);
  const course = catalog.courses.find((item) => item.id === module?.course_id);

  if (!lesson || !module || !course) {
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
  );
  const moduleLessons = catalog.lessons
    .filter((item) => item.module_id === module.id)
    .sort((a, b) => a.position - b.position);
  const lessonIndex = moduleLessons.findIndex((item) => item.id === lesson.id);
  const previous = moduleLessons[lessonIndex - 1];
  const next = moduleLessons[lessonIndex + 1];
  const resources = catalog.resources.filter((resource) => resource.lesson_id === lesson.id);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${course.title} · Module ${module.position} · Lesson ${lesson.position}`}
        title={lesson.title}
        description={lesson.kind === 'video' ? 'Required video progress completes when your furthest watched point reaches 95%.' : 'Read the material, then mark the lesson complete.'}
        action={
          <StatusPill tone={complete ? 'positive' : accessible ? 'neutral' : 'warning'}>
            {complete ? 'Complete' : accessState === 'expired' ? 'Access expired' : accessible ? 'In progress' : 'Locked'}
          </StatusPill>
        }
      />

      {!accessible ? (
        <section className="card flex gap-4 p-6">
          <LockKeyhole className="mt-0.5 shrink-0 text-dacfp-gold size-icon-lg" aria-hidden="true" />
          <div>
            <h2 className="font-bold text-dacfp-navy">This lesson is locked</h2>
            <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
              {accessState === 'expired'
                ? 'Course access has expired. This does not itself change designation standing.'
                : accessState === 'revoked'
                  ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                  : 'Complete the prerequisite course, terms acknowledgment, or previous module before opening this content.'}
            </p>
            <Link className="button-quiet mt-3" to={`/course/${course.slug}/module/${module.position}`}>
              Return to module
            </Link>
          </div>
        </section>
      ) : lesson.kind === 'video' ? (
        <LessonPlayer key={lesson.id} course={course} lesson={lesson} progress={progress} />
      ) : (
        <article className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 text-dacfp-blue">
            <FileText className="size-icon-lg" aria-hidden="true" />
            <p className="eyebrow">Required reading</p>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-dacfp-navy">Key concepts</h2>
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
