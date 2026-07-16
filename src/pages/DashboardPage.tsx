import {
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, ProgressBar, StatusPill, formatDate, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, termsGateSatisfied } from '../engine';
import {
  courseProgressPercent,
  enrollmentForCourse,
  isCourseComplete,
  moduleIsUnlocked,
} from '../lib/progress';

export function DashboardPage() {
  const { catalog, snapshot, selectedLearner } = useLms();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Learner dashboard"
        title={`Welcome, ${snapshot.profile.display_name}`}
        description="Continue required learning, review annual renewal access, and see the bonus curriculum unlock when FPT is complete."
        action={
          <div className="rounded-lg border border-dacfp-line bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-dacfp-slate">Synthetic state</p>
            <p className="mt-1 font-bold text-brand-navy">{snapshot.learner.label}</p>
          </div>
        }
      />

      <section aria-labelledby="course-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">My learning</p>
            <h2 id="course-heading" className="mt-1 text-2xl font-bold text-brand-navy">
              Enrolled courses
            </h2>
          </div>
          <span className="text-sm font-semibold text-dacfp-slate">
            {snapshot.enrollments.length} active
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {snapshot.enrollments.map((enrollment) => {
            const course = catalog.courses.find((item) => item.id === enrollment.course_id);
            if (!course) return null;
            const unlocked = courseUnlocked(course, snapshot.completions);
            const termsAccepted = termsGateSatisfied(course, enrollment);
            const complete = isCourseComplete(catalog, snapshot, course);
            const progress = courseProgressPercent(catalog, snapshot, course, enrollment);
            const courseModules = catalog.modules.filter((item) => item.course_id === course.id);
            const resumeModule =
              courseModules.find((module) => moduleIsUnlocked(catalog, snapshot, course, module)) ??
              courseModules[0];

            return (
              <article key={course.id} className="card flex flex-col overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-brand-royal to-brand-gold" />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-dacfp-wash-blue text-brand-royal">
                      {unlocked ? <BookOpen aria-hidden="true" size={22} /> : <LockKeyhole aria-hidden="true" size={22} />}
                    </div>
                    {complete ? (
                      <StatusPill tone="positive">Complete</StatusPill>
                    ) : !unlocked ? (
                      <StatusPill tone="warning">Locked</StatusPill>
                    ) : !termsAccepted ? (
                      <StatusPill tone="warning">Terms required</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">In progress</StatusPill>
                    )}
                  </div>

                  <h3 className="mt-5 text-xl font-bold text-brand-navy">{course.title}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-dacfp-slate">{course.description}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3 border-y border-dacfp-line py-4 text-sm">
                    <div className="flex items-center gap-2 text-dacfp-slate">
                      <Award size={17} aria-hidden="true" className="text-brand-gold" />
                      <span><strong className="text-brand-navy">{course.ce_credits ?? 0}</strong> CE credits</span>
                    </div>
                    <div className="flex items-center gap-2 text-dacfp-slate">
                      <CalendarClock size={17} aria-hidden="true" className="text-brand-royal" />
                      <span>Access to <strong className="text-brand-navy">{formatDate(enrollment.expires_at)}</strong></span>
                    </div>
                  </div>

                  {unlocked ? (
                    <div className="mt-5">
                      <ProgressBar value={progress} label="Course progress" />
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 p-4 text-sm leading-6 text-brand-navy">
                      Complete FPT to unlock this bonus course. Its enrollment is ready and waiting.
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-dacfp-slate">
                      Course access expires separately from designation standing.
                    </p>
                    {unlocked && resumeModule ? (
                      <Link
                        className="button-secondary shrink-0"
                        to={learnerPath(
                          `/course/${course.slug}/module/${resumeModule.position}`,
                          selectedLearner,
                        )}
                      >
                        {complete ? 'Review course' : 'Continue'}
                        <ChevronRight size={17} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-slate" aria-disabled="true">
                        <LockKeyhole size={16} aria-hidden="true" /> Locked
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card grid gap-5 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="grid size-12 place-items-center rounded-xl bg-status-positive/10 text-status-positive">
          <CheckCircle2 aria-hidden="true" size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-brand-navy">Credential details ready for CE reporting</h2>
          <p className="mt-1 text-sm leading-6 text-dacfp-slate">
            Keep optional CFP, IWI, and CFA IDs current in your account. This preview collects them only; reporting is a later workflow.
          </p>
        </div>
        <Link className="button-quiet" to={learnerPath('/account', selectedLearner)}>
          Review account <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
