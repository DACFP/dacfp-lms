import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  LockKeyhole,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, StatusPill, learnerPath } from '../components/common';
import { LessonPlayer } from '../components/LessonPlayer';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import {
  enrollmentAccessState,
  enrollmentForCourse,
  moduleIsUnlocked,
} from '../lib/progress';

export function LessonPage() {
  const { id } = useParams();
  const { catalog, snapshot, selectedLearner, completeReading } = useLms();
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
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
      />
    );
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the course that contains this lesson."
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
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
          <LockKeyhole className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" size={22} />
          <div>
            <h2 className="font-bold text-brand-navy">This lesson is locked</h2>
            <p className="mt-1 text-sm leading-6 text-dacfp-slate">
              {accessState === 'expired'
                ? 'Course access has expired. This does not itself change designation standing.'
                : accessState === 'revoked'
                  ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                  : 'Complete the prerequisite course, terms acknowledgment, or previous module before opening this content.'}
            </p>
            <Link className="button-quiet mt-3" to={learnerPath(`/course/${course.slug}/module/${module.position}`, selectedLearner)}>
              Return to module
            </Link>
          </div>
        </section>
      ) : lesson.kind === 'video' ? (
        <LessonPlayer course={course} lesson={lesson} progress={progress} />
      ) : (
        <article className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 text-brand-royal">
            <FileText aria-hidden="true" size={22} />
            <p className="eyebrow">Required reading</p>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-brand-navy">Key concepts</h2>
          <p className="mt-4 max-w-3xl leading-8 text-dacfp-slate">{lesson.body_md}</p>
          <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-dacfp-line bg-dacfp-wash p-4 text-sm leading-6 text-dacfp-slate">
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
              <CheckCircle2 size={17} aria-hidden="true" />
              {complete ? 'Reading complete' : savingReading ? 'Saving…' : 'Mark reading complete'}
            </button>
            {readingError ? <p className="font-semibold text-status-danger" role="alert">{readingError}</p> : null}
          </div>
        </article>
      )}

      <section aria-labelledby="resources-heading" className="card p-6">
        <div className="flex items-center gap-3">
          <Download className="text-brand-royal" aria-hidden="true" size={21} />
          <h2 id="resources-heading" className="text-lg font-bold text-brand-navy">Lesson resources</h2>
        </div>
        {resources.length > 0 ? (
          <ul className="mt-4 divide-y divide-dacfp-line rounded-lg border border-dacfp-line">
            {resources.map((resource) => (
              <li key={resource.id}>
                {accessible ? (
                  <a className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 font-semibold text-brand-royal hover:bg-dacfp-wash-blue" href={resource.file_ref} download>
                    <span>{resource.title}</span>
                    <Download size={17} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 font-semibold text-dacfp-slate" aria-disabled="true">
                    <span>{resource.title}</span>
                    <LockKeyhole size={17} aria-hidden="true" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-dacfp-slate">No downloads accompany this synthetic lesson.</p>
        )}
      </section>

      <nav aria-label="Lesson navigation" className="flex flex-col gap-3 border-t border-dacfp-line pt-6 sm:flex-row sm:justify-between">
        {accessible && previous ? (
          <Link className="button-secondary" to={learnerPath(`/lesson/${previous.id}`, selectedLearner)}>
            <ArrowLeft size={17} aria-hidden="true" /> Previous lesson
          </Link>
        ) : <span />}
        {accessible && next ? (
          <Link className="button-primary" to={learnerPath(`/lesson/${next.id}`, selectedLearner)}>
            Next lesson <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : (
          <Link className="button-primary" to={learnerPath(`/course/${course.slug}/module/${module.position}`, selectedLearner)}>
            Module overview <CheckCircle2 size={17} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}
