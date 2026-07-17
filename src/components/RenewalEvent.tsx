import { CalendarClock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LmsCourse, LmsEnrollment } from '../data/types';
import { formatDate } from './common';

export interface RenewalWindow {
  /** When the renewal becomes actionable. Null means "already open". */
  opens_at?: string | null;
  /** When it stops being actionable. Null means "no stated close". */
  closes_at?: string | null;
}

/**
 * The renewal surface (SPEC-OVERHAUL §2b).
 *
 * Deliberately NOT a peer course card. A renewal is an event: it is time-bound,
 * it appears, it is done, it goes away. Rendering it as a third card next to
 * FPT and the bonus library implied all three were equal standing work, which
 * is what Jack's IA decision rejects.
 *
 * VISIBILITY IS A PROP, NOT A RULE. Real entitlement wiring is promotion-scope
 * (§4), so this component never decides for itself whether a renewal applies.
 * The dark build passes `visible` = "an enrollment exists"; promotion passes
 * the real answer. That is a prop change at the call site, not a redesign here.
 */
export function RenewalEvent({
  course,
  enrollment,
  visible,
  window: renewalWindow,
  actionable,
  resumePath,
}: {
  course: LmsCourse;
  enrollment: LmsEnrollment;
  /** Promotion supplies the entitlement answer. Dark build: enrollment exists. */
  visible: boolean;
  window?: RenewalWindow;
  actionable: boolean;
  resumePath: string;
}) {
  if (!visible) return null;

  const closesAt = renewalWindow?.closes_at ?? enrollment.expires_at;

  return (
    <section
      aria-labelledby="renewal-heading"
      className="on-navy overflow-hidden rounded-card bg-dacfp-navy text-white shadow-card"
    >
      <div className="brand-strip h-1" />
      <div className="flex flex-col gap-5 p-6 sm:p-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10">
            <CalendarClock className="size-icon-md" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            {/* gold-hi: an eyebrow on a navy ground. Raw gold would be 3.80:1. */}
            <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gold-hi">
              Annual renewal
            </p>
            <h2 id="renewal-heading" className="mt-1 text-xl font-bold">
              {course.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-white/70">
              {closesAt
                ? `Complete by ${formatDate(closesAt)} to keep your learning access current.`
                : 'Complete your annual renewal to keep your learning access current.'}
            </p>
          </div>
        </div>
        {actionable ? (
          <Link
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-dacfp-navy transition-colors hover:bg-dacfp-gold-hi"
            to={resumePath}
          >
            Start renewal
            <ArrowRight className="size-icon-sm" aria-hidden="true" />
          </Link>
        ) : (
          <span className="shrink-0 text-sm font-semibold text-white/60">
            Not available right now
          </span>
        )}
      </div>
    </section>
  );
}
