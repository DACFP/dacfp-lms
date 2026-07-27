import { Award, CheckCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { CbdaSeal } from '../components/CbdaSeal';
import { EmptyState, PageHeader, StatusPill, formatDate } from '../components/common';
import { useLms } from '../context/LmsContext';
import { enrollmentForCourse, moduleIsPassed } from '../lib/progress';

export interface CeStatusRow {
  id: string;
  label: string;
  status: string;
  detail?: string;
  timestamp?: string;
}

/**
 * R1 can supply CE reporting rows here without changing the X2 completion
 * hierarchy. Until those rows exist, the cascade is intentionally absent.
 */
export function CompletionStatusSlots({ rows }: { rows: CeStatusRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="ce-status-heading" className="card p-6 sm:p-8">
      <p className="eyebrow">Continuing education</p>
      <h2 id="ce-status-heading" className="mt-1.5 text-xl font-bold text-dacfp-navy">
        CE reporting status
      </h2>
      <dl className="mt-5 divide-y divide-dacfp-line border-y border-dacfp-line">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6">
            <div>
              <dt className="font-bold text-dacfp-navy">{row.label}</dt>
              {row.detail ? <dd className="mt-1 text-sm text-dacfp-gray-text">{row.detail}</dd> : null}
            </div>
            <dd className="text-sm font-semibold text-dacfp-navy">
              {row.status}{row.timestamp ? ` · ${formatDate(row.timestamp)}` : ''}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CompletionPage() {
  const { slug } = useParams();
  const { catalog, snapshot } = useLms();
  const course = catalog.courses.find((item) => item.slug === slug);
  const enrollment = course ? enrollmentForCourse(snapshot, course.id) : null;
  const completion = course
    ? snapshot.completions.find((item) => item.course_id === course.id) ?? null
    : null;

  if (!course || !enrollment || !completion) {
    return (
      <EmptyState
        title="Completion not available yet"
        description="This screen opens after every required lesson, survey, and module quiz is complete."
        action={<Link className="button-secondary" to="/dashboard">Return to dashboard</Link>}
      />
    );
  }

  const modules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  const moduleIds = new Set(modules.map((item) => item.id));
  const quizzes = catalog.quizzes.filter((item) => moduleIds.has(item.module_id));
  const completedModules = modules.filter((item) =>
    moduleIsPassed(catalog, snapshot, course, item),
  ).length;
  const passedQuizzes = quizzes.filter((quiz) =>
    snapshot.attempts.some(
      (attempt) =>
        attempt.enrollment_id === enrollment.id &&
        attempt.quiz_id === quiz.id &&
        attempt.passed,
    ),
  ).length;
  const learnerName =
    snapshot.profile.display_name ||
    `${snapshot.profile.first_name} ${snapshot.profile.last_name}`.trim() ||
    'Learner';
  const ceStatusRows: CeStatusRow[] = [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Course completion"
        title="You completed the course"
        description="Your learning record is complete. Review the evidence, then open your credential home."
        action={<StatusPill tone="positive">Complete</StatusPill>}
      />

      <section aria-labelledby="completion-checklist-heading" className="card overflow-hidden">
        <div className="border-b border-dacfp-line bg-dacfp-wash px-6 py-5 sm:px-8">
          <p className="eyebrow text-dacfp-gold-text">Completion checklist</p>
          <h2 id="completion-checklist-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">
            Every requirement is accounted for
          </h2>
        </div>
        <dl className="grid gap-px bg-dacfp-line sm:grid-cols-2">
          {[
            { label: 'Modules complete', value: `${completedModules}/${modules.length}` },
            { label: 'Quizzes passed', value: `${passedQuizzes}/${quizzes.length}` },
            { label: 'Completed on', value: formatDate(completion.completed_at) },
            { label: 'Learner', value: learnerName },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3 bg-white p-5 sm:p-6">
              <CheckCircle2 className="mt-0.5 size-icon-md shrink-0 text-status-positive" aria-hidden="true" />
              <div>
                <dt className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">{item.label}</dt>
                <dd className="mt-1 font-bold tabular-nums text-dacfp-navy">{item.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="credential-reveal-heading" className="on-navy overflow-hidden rounded-[0.1875rem] bg-dacfp-navy p-7 text-white sm:p-9">
        <div className="brand-strip -mx-9 -mt-9 mb-8 h-1" />
        <div className="grid gap-7 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <CbdaSeal size="lg" decorative />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gold-hi">Credential reveal</p>
            <h2 id="credential-reveal-heading" className="mt-2 font-serif text-3xl font-bold">
              Your interim CBDA credential is ready
            </h2>
            <p className="mt-3 max-w-prose text-sm leading-6 text-white/75">
              The interim certificate is available now. Official designation issuance and course access remain separate statuses.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-dacfp-gold-hi">
              <Award className="size-icon-sm" aria-hidden="true" />
              {completion.designation_issued ? 'Official designation issued' : 'Official designation processing'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="inline-flex min-h-11 items-center justify-center rounded-[0.1875rem] bg-white px-4 py-2.5 text-sm font-bold text-dacfp-navy hover:bg-dacfp-gold-hi" to="/credentials">
                Open My Credentials
              </Link>
              <Link className="inline-flex min-h-11 items-center justify-center rounded-[0.1875rem] border border-white/30 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10" to="/dashboard">
                Return to dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CompletionStatusSlots rows={ceStatusRows} />
    </div>
  );
}
