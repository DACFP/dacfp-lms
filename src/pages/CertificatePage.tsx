import { Award, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CbdaSeal } from '../components/CbdaSeal';
import { EmptyState, PageHeader, StatusPill, formatDate } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseKind } from '../lib/courseKind';

function addOneYear(value: string) {
  const date = new Date(value);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

export function CertificatePage() {
  const { catalog, snapshot } = useLms();
  const course = catalog.courses.find((item) => courseKind(item) === 'flagship');
  const completion = course
    ? snapshot.completions.find((item) => item.course_id === course.id)
    : null;

  if (!course || !completion) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Credential home"
          title="My Credentials"
          description="Your credential and designation status remain available here after course completion."
          action={<StatusPill tone="muted">Not earned yet</StatusPill>}
        />
        <EmptyState
          title="Certificate not available yet"
          description="Your interim CBDA certificate becomes available after every required module, survey, and quiz is complete."
          action={<Link className="button-secondary" to="/dashboard">Return to dashboard</Link>}
        />
      </div>
    );
  }

  const learnerName =
    snapshot.profile.display_name ||
    `${snapshot.profile.first_name} ${snapshot.profile.last_name}`.trim();
  const validThrough = addOneYear(completion.completed_at);

  return (
    <div className="certificate-page space-y-8">
      <PageHeader
        eyebrow="Credential home"
        title="My Credentials"
        description="Your interim certificate and current designation status live here as a durable learner record."
        action={
          <StatusPill tone={completion.designation_issued ? 'positive' : 'current'}>
            {completion.designation_issued ? 'Designation issued' : 'Issuance processing'}
          </StatusPill>
        }
      />
      <section aria-labelledby="designation-status-heading" className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-dacfp-wash-blue text-dacfp-blue">
            <Award className="size-icon-md" aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Designation status</p>
            <h2 id="designation-status-heading" className="mt-1 text-xl font-bold text-dacfp-navy">
              {completion.designation_issued ? 'Official CBDA designation issued' : 'Course completion confirmed · official issuance processing'}
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
              Your interim certificate is available now. Designation issuance and course access are tracked separately.
            </p>
          </div>
        </div>
        <Link className="button-secondary shrink-0" to={`/completion/${course.slug}`}>View completion record</Link>
      </section>
      <div className="certificate-actions flex flex-wrap items-center justify-between gap-3">
        <Link className="button-quiet" to="/dashboard">← Dashboard</Link>
        <button className="button-primary" type="button" onClick={() => window.print()}>
          <Printer className="size-icon-sm" aria-hidden="true" /> Print certificate
        </button>
      </div>
      <article className="mx-auto max-w-4xl border-[10px] border-double border-dacfp-navy bg-white px-8 py-12 text-center shadow-card sm:px-16 sm:py-16">
        <div className="brand-strip mx-auto h-1 w-32" />
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-dacfp-gold-text">Interim demonstration certificate</p>
        <div className="mx-auto mt-6 w-fit"><CbdaSeal size="lg" /></div>
        <p className="mt-8 font-serif text-xl text-dacfp-gray-text">This certifies that</p>
        <h2 className="mt-3 font-serif text-4xl font-bold text-dacfp-navy sm:text-5xl">{learnerName}</h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-dacfp-gray-text">has completed the required course of study and earned the interim credential</p>
        <p className="mt-4 text-2xl font-bold tracking-wide text-dacfp-navy sm:text-3xl">Certified in Blockchain and Digital Assets</p>
        <dl className="mx-auto mt-10 grid max-w-2xl gap-6 border-t border-dacfp-line pt-8 sm:grid-cols-2">
          <div><dt className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">Certified on</dt><dd className="mt-2 text-lg font-semibold tabular-nums text-dacfp-navy">{formatDate(completion.completed_at)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gray-text">Valid through</dt><dd className="mt-2 text-lg font-semibold tabular-nums text-dacfp-navy">{formatDate(validThrough)}</dd></div>
        </dl>
        <p className="mx-auto mt-10 max-w-xl text-xs leading-5 text-dacfp-gray-text">Interim learner-portal certificate for demonstration and printing. The full certificate engine is a later release.</p>
      </article>
    </div>
  );
}
