import { CalendarX2, FileCheck2, LifeBuoy, RefreshCw } from 'lucide-react';
import type { LmsEnrollment } from '../data/types';
import { formatDate } from './common';

function expiredOn(enrollment: LmsEnrollment) {
  return enrollment.expires_at ? formatDate(enrollment.expires_at) : null;
}

export function ExpiredAccessPanel({
  enrollment,
  headingId = 'expired-access-heading',
}: {
  enrollment: LmsEnrollment;
  headingId?: string;
}) {
  const expiryDate = expiredOn(enrollment);

  return (
    <section
      aria-labelledby={headingId}
      className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-[0.1875rem] bg-dacfp-gold/15 text-dacfp-navy">
          <CalendarX2 className="size-icon-md" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-dacfp-gold-text">Course access</p>
          <h2 id={headingId} className="mt-1.5 text-2xl font-bold text-dacfp-navy">
            {expiryDate ? `Access expired ${expiryDate}` : 'Access expired'}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
            Learning access and designation status are governed separately.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[0.1875rem] border border-dacfp-line bg-dacfp-wash p-4">
          <FileCheck2 className="size-icon-md text-dacfp-blue" aria-hidden="true" />
          <h3 className="mt-3 font-bold text-dacfp-navy">What you keep</h3>
          <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
            Your learning record remains available. Any designation status continues on
            its own recorded validity schedule.
          </p>
        </div>
        <div className="rounded-[0.1875rem] border border-dacfp-line bg-dacfp-wash p-4">
          <RefreshCw className="size-icon-md text-dacfp-blue" aria-hidden="true" />
          <h3 className="mt-3 font-bold text-dacfp-navy">Restore course access</h3>
          <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
            Renew if you are within the renewal grace window. If that window has passed,
            re-enroll in the program.
          </p>
        </div>
      </div>

      <a className="button-secondary mt-5" href="mailto:info@dacfp.com">
        <LifeBuoy className="size-icon-sm" aria-hidden="true" />
        Contact support
      </a>
    </section>
  );
}
