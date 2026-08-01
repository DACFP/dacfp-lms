import { Award, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CertificateArtwork } from '../components/CertificateArtwork';
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
          description="Your CBDA certificate becomes available after every required module, survey, and quiz is complete."
          action={<Link className="button-secondary" to="/dashboard">Return to dashboard</Link>}
        />
      </div>
    );
  }

  const validThrough = addOneYear(completion.completed_at);
  const completionDate = formatDate(completion.completed_at);
  const expirationDate = formatDate(validThrough);

  return (
    <div className="certificate-page space-y-8">
      <PageHeader
        eyebrow="Credential home"
        title="My Credentials"
        description="Your certificate and current designation status live here after course completion."
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
          </div>
        </div>
        <Link className="button-secondary shrink-0" to={`/completion/${course.slug}`}>View completion record</Link>
      </section>
      <div className="certificate-actions flex flex-wrap items-center justify-between gap-3">
        <Link className="button-quiet" to="/dashboard">← Dashboard</Link>
        <button className="button-primary" type="button" onClick={() => window.print()}>
          <Printer className="size-icon-sm" aria-hidden="true" /> Download / print
        </button>
      </div>
      <div className="certificate-stage">
        <CertificateArtwork
          profile={snapshot.profile}
          completionDate={completionDate}
          expirationDate={expirationDate}
        />
      </div>
      <div className="certificate-support text-center text-sm leading-6 text-dacfp-gray-text">
        <p>Course completion, designation issuance, and course access are tracked separately.</p>
        <p className="mt-1">Questions about your certificate? Contact DACFP learner support.</p>
      </div>
    </div>
  );
}
