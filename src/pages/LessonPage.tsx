import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  LockKeyhole,
  Play,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, ProgressBar, StatusPill, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import { enrollmentForCourse, moduleIsUnlocked } from '../lib/progress';

export function LessonPage() {
  const { id } = useParams();
  const { catalog, snapshot, selectedLearner } = useLms();
  const lesson = catalog.lessons.find((item) => item.id === id);
  const module = catalog.modules.find((item) => item.id === lesson?.module_id);
  const course = catalog.courses.find((item) => item.id === module?.course_id);

  if (!lesson || !module || !course) {
    return <EmptyState title="Lesson not found" description="This synthetic route does not match a lesson in the D0 catalog." />;
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return <EmptyState title="No enrollment" description="The selected synthetic learner cannot open this lesson." />;
  }

  const accessible =
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
  const watchPercent = lesson.duration_seconds
    ? Math.min(100, Math.round(((progress?.max_watched_seconds ?? 0) / lesson.duration_seconds) * 100))
    : complete
      ? 100
      : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${course.title} · Module ${module.position} · Lesson ${lesson.position}`}
        title={lesson.title}
        description={lesson.kind === 'video' ? 'Required video progress completes when your furthest watched point reaches 95%.' : 'Read the material, then mark the lesson complete when the live workflow is added.'}
        action={<StatusPill tone={complete ? 'positive' : accessible ? 'neutral' : 'warning'}>{complete ? 'Complete' : accessible ? 'In progress' : 'Locked'}</StatusPill>}
      />

      {!accessible ? (
        <section className="card flex gap-4 p-6">
          <LockKeyhole className="mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" size={22} />
          <div>
            <h2 className="font-bold text-brand-navy">This lesson is locked</h2>
            <p className="mt-1 text-sm leading-6 text-dacfp-slate">Complete the prerequisite course, terms acknowledgment, or previous module before opening this content.</p>
          </div>
        </section>
      ) : lesson.kind === 'video' ? (
        <section aria-labelledby="player-heading" className="card overflow-hidden">
          <div className="relative grid aspect-video max-h-[34rem] place-items-center bg-gradient-to-br from-brand-navy to-brand-navy-deep text-white">
            <div className="absolute left-5 top-5 inline-flex min-h-8 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-xs font-bold uppercase tracking-[0.12em]">
              <Gauge size={15} aria-hidden="true" /> Required · 1× speed
            </div>
            <div className="text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full border border-white/25 bg-white/10">
                <Play fill="currentColor" aria-hidden="true" size={27} />
              </div>
              <h2 id="player-heading" className="mt-4 text-lg font-bold">Placeholder compliance player</h2>
              <p className="mt-1 text-sm text-white/70">Forward seeking stops at your furthest watched point.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <ProgressBar value={watchPercent} label="Furthest point watched" />
            <p className="mt-3 text-sm text-dacfp-slate">
              Resume at <span className="font-semibold tabular-nums text-brand-navy">{progress?.last_position_seconds ?? 0}s</span> · Complete at 95%
            </p>
          </div>
        </section>
      ) : (
        <article className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 text-brand-royal">
            <FileText aria-hidden="true" size={22} />
            <p className="eyebrow">Required reading</p>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-brand-navy">Key concepts</h2>
          <p className="mt-4 max-w-3xl leading-8 text-dacfp-slate">{lesson.body_md}</p>
          <div className="mt-6 rounded-lg border border-dacfp-line bg-dacfp-wash p-4 text-sm leading-6 text-dacfp-slate">
            D0 presents the reading and completion state. The live mark-complete write is intentionally deferred.
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
                <a className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 font-semibold text-brand-royal hover:bg-dacfp-wash-blue" href={resource.file_ref} download>
                  <span>{resource.title}</span>
                  <Download size={17} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-dacfp-slate">No downloads accompany this synthetic lesson.</p>
        )}
      </section>

      <nav aria-label="Lesson navigation" className="flex flex-col gap-3 border-t border-dacfp-line pt-6 sm:flex-row sm:justify-between">
        {previous ? (
          <Link className="button-secondary" to={learnerPath(`/lesson/${previous.id}`, selectedLearner)}>
            <ArrowLeft size={17} aria-hidden="true" /> Previous lesson
          </Link>
        ) : <span />}
        {next ? (
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
