import { FileCheck2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { LmsCourse, LmsEnrollment } from '../data/types';

export function TermsModal({
  course,
  enrollment,
  onAccept,
}: {
  course: LmsCourse;
  enrollment: LmsEnrollment;
  onAccept: (enrollmentId: string) => Promise<void>;
}) {
  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    setAccepting(true);
    await onAccept(enrollment.id);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-brand-navy-deep/70 p-4" role="presentation">
      <section
        className="w-full max-w-2xl rounded-card border border-dacfp-line bg-white shadow-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        aria-describedby="terms-description"
      >
        <div className="h-1.5 rounded-t-card bg-gradient-to-r from-brand-royal via-brand-royal-bright to-brand-gold" />
        <div className="p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-xl bg-dacfp-wash-blue text-brand-royal">
            <FileCheck2 aria-hidden="true" size={24} />
          </div>
          <p className="eyebrow mt-6">First entry</p>
          <h2 id="terms-title" className="mt-2 text-2xl font-bold text-brand-navy">
            Accept the program terms to continue
          </h2>
          <p id="terms-description" className="mt-3 leading-7 text-dacfp-slate">
            {course.title} uses sequential lessons, required quizzes, and compliance-style video progress. Your learning access and designation standing are managed separately.
          </p>
          <div className="mt-6 rounded-lg border border-dacfp-line bg-dacfp-wash p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-status-positive" aria-hidden="true" size={20} />
              <p className="text-sm leading-6 text-dacfp-ink">
                This dark-build acknowledgment updates synthetic state only. It does not send email or contact any external service.
              </p>
            </div>
          </div>
          <button className="button-primary mt-7 w-full sm:w-auto" type="button" onClick={() => void accept()} disabled={accepting}>
            {accepting ? 'Accepting…' : 'I accept and want to continue'}
          </button>
        </div>
      </section>
    </div>
  );
}
