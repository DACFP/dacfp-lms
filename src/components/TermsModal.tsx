import { FileCheck2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LmsCourse, LmsEnrollment } from '../data/types';
import { Alert } from './Alert';
import { IconTile } from './IconTile';

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
  const [error, setError] = useState('');

  const accept = async () => {
    setAccepting(true);
    setError('');
    try {
      await onAccept(enrollment.id);
    } catch {
      setError('Terms could not be accepted. Check your connection and try again.');
      setAccepting(false);
    }
  };

  return (
    // This is a gate, not a disclosure. It renders only while terms are
    // outstanding and has never had a dismiss path; Radix would add three
    // (Esc, outside-press, close button), so all three are refused. Behaviour
    // is unchanged from the hand-rolled version — what Radix adds is the focus
    // trap, inert background and scroll lock the hand-rolled one never had.
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby="terms-description"
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-card border border-dacfp-line bg-white p-0 shadow-card sm:max-w-2xl"
      >
        <div className="brand-strip h-1.5" />
        <div className="p-6 sm:p-8">
          <IconTile icon={FileCheck2} size="lg" tone="brand" />
          <p className="eyebrow mt-6">First entry</p>
          <DialogTitle className="mt-2 font-sans text-2xl font-bold text-dacfp-navy">
            Accept the program terms to continue
          </DialogTitle>
          <DialogDescription
            id="terms-description"
            className="mt-3 text-base leading-7 text-dacfp-gray-text"
          >
            {course.title} uses sequential lessons, required quizzes, and compliance-style video progress. Your learning access and designation standing are managed separately.
          </DialogDescription>
          <div className="mt-6 rounded-lg border border-dacfp-line bg-dacfp-wash p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-icon-md shrink-0 text-status-positive" aria-hidden="true" />
              <p className="text-sm leading-6 text-dacfp-navy">
                This dark-build acknowledgment updates synthetic state only. It does not send email or contact any external service.
              </p>
            </div>
          </div>
          <button
            className="button-primary mt-7 w-full sm:w-auto"
            type="button"
            onClick={() => void accept()}
            disabled={accepting}
          >
            {accepting ? 'Accepting…' : 'I accept and want to continue'}
          </button>
          {error ? (
            <Alert tone="danger" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
