import {
  Award,
  BookOpen,
  CalendarClock,
  ChevronRight,
  LockKeyhole,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CbdaSeal } from '../components/CbdaSeal';
import { IconTile } from '../components/IconTile';
import { LockedBadge } from '../components/LockedBadge';
import { RenewalEvent } from '../components/RenewalEvent';
import {
  EmptyState,
  StatusPill,
  formatDate,
} from '../components/common';
import { useLms } from '../context/LmsContext';
import type {
  Catalog,
  LearnerSnapshot,
  LmsCourse,
  LmsEnrollment,
  LmsModule,
} from '../data/types';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import { courseKind } from '../lib/courseKind';
import {
  courseProgressPercent,
  enrollmentAccessState,
  isCourseComplete,
  moduleIsPassed,
  moduleIsUnlocked,
  resumeModuleForCourse,
} from '../lib/progress';

/**
 * Everything a card needs about one enrollment, derived once so the hero, the
 * renewal surface and the library cannot drift apart. A plain function, not a
 * hook — it holds no state.
 */
function courseView(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  enrollment: LmsEnrollment,
) {
  const accessState = enrollmentAccessState(enrollment);
  const accessActive = accessState === 'active';
  const unlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const courseModules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  // Locked or terms-gated catalog rows are intentionally hidden by RLS. An
  // empty visible module set is therefore not completion.
  const complete = courseModules.length > 0 && isCourseComplete(catalog, snapshot, course);
  const progress = courseProgressPercent(catalog, snapshot, course, enrollment);
  const resumeModule = resumeModuleForCourse(catalog, snapshot, course);
  const enrollmentProgress = snapshot.progress.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const resumeLesson = resumeModule
    ? catalog.lessons
        .filter((lesson) => lesson.module_id === resumeModule.id)
        .map((lesson) => ({
          lesson,
          progress: enrollmentProgress.find((item) => item.lesson_id === lesson.id),
        }))
        .filter(({ progress: item }) => item)
        .sort(
          (a, b) =>
            new Date(b.progress!.updated_at).getTime() -
            new Date(a.progress!.updated_at).getTime(),
        )
        .find(({ lesson }) => !lessonComplete(lesson, enrollmentProgress))?.lesson
    : null;
  const contentAvailable = accessActive && unlocked && termsAccepted;
  const resumePath = resumeLesson
    ? `/lesson/${resumeLesson.id}`
    : resumeModule
      ? `/course/${course.slug}/module/${resumeModule.position}`
      : '/dashboard';

  return {
    accessState,
    unlocked,
    termsAccepted,
    courseModules,
    complete,
    progress,
    resumeModule,
    resumeLesson,
    contentAvailable,
    resumePath,
  };
}

type CourseView = ReturnType<typeof courseView>;

/**
 * Per-module ledger facts for the "Course of study" table and the progress
 * ticker, derived once from the same engine answers every other surface uses.
 */
function moduleLedger(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  enrollment: LmsEnrollment,
  view: CourseView,
) {
  let currentAssigned = false;
  return view.courseModules.map((module) => {
    const passed = moduleIsPassed(catalog, snapshot, course, module);
    const unlocked =
      view.contentAvailable && moduleIsUnlocked(catalog, snapshot, course, module);
    // R1: passed / current / locked from the real derivation. "Current" is the
    // first unlocked, unpassed module; open-progression courses may present
    // every unlocked module as available (genuinely any-order).
    const current = !passed && unlocked && !currentAssigned && course.progression === 'sequential';
    if (current) currentAssigned = true;
    const quiz = catalog.quizzes.find((item) => item.module_id === module.id);
    const passedAttempt = quiz
      ? snapshot.attempts
          .filter(
            (attempt) =>
              attempt.enrollment_id === enrollment.id &&
              attempt.quiz_id === quiz.id &&
              attempt.passed,
          )
          .sort((a, b) => a.attempt_number - b.attempt_number)[0]
      : undefined;
    const lessons = catalog.lessons.filter((item) => item.module_id === module.id);
    const minutes = Math.round(
      lessons.reduce((total, lesson) => total + (lesson.duration_seconds ?? 0), 0) / 60,
    );
    return { module, passed, unlocked, current, quiz, passedAttempt, lessons, minutes };
  });
}

type LedgerRow = ReturnType<typeof moduleLedger>[number];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The mockup's summary sentence, derived truthfully from the real state. */
function flagshipSummary(view: CourseView, ledger: LedgerRow[]) {
  const passedCount = ledger.filter((row) => row.passed).length;
  const next = ledger.find((row) => row.current);
  if (view.accessState !== 'active') {
    return 'Course access has expired. Your record below is preserved, and designation standing is governed separately.';
  }
  if (!view.termsAccepted) {
    return 'Accept the program terms to open your course of study.';
  }
  if (view.complete) {
    return 'Every module and checkpoint is complete. Your record is ready.';
  }
  if (passedCount === 0) {
    return `Your course of study is ready. Module 1 opens the program${next ? ` with ${next.module.title}` : ''}.`;
  }
  const cleanRecord = ledger
    .filter((row) => row.passed && row.passedAttempt)
    .every((row) => row.passedAttempt!.attempt_number <= 2);
  const recordClause = cleanRecord
    ? ', with every checkpoint passed on the first or second attempt'
    : '';
  const nextClause = next ? ` Module ${next.module.position} is queued and ready.` : '';
  return `You’re ${passedCount} module${passedCount === 1 ? '' : 's'} in${recordClause}.${nextClause}`;
}

/**
 * brief #15. "Access through {formatDate(null)}" rendered as "Access through No
 * expiry set". No expiry is its own branch, not a date that happens to be
 * missing.
 */
function AccessLine({ enrollment }: { enrollment: LmsEnrollment }) {
  const expired = enrollmentAccessState(enrollment) === 'expired';
  if (!enrollment.expires_at) {
    return <strong className="text-dacfp-navy">No access expiry</strong>;
  }
  return (
    <span>
      Access {expired ? 'expired' : 'through'}{' '}
      <strong className="text-dacfp-navy">{formatDate(enrollment.expires_at)}</strong>
    </span>
  );
}

function CourseStatus({ view, course }: { view: CourseView; course: LmsCourse }) {
  if (view.accessState === 'expired') return <StatusPill tone="warning">Access expired</StatusPill>;
  if (view.accessState === 'revoked') return <StatusPill tone="warning">Access unavailable</StatusPill>;
  if (view.complete) return <StatusPill tone="positive">Complete</StatusPill>;
  if (!view.unlocked) {
    return (
      <LockedBadge reason={`${course.title} unlocks once you complete the prerequisite course.`} />
    );
  }
  if (!view.termsAccepted) return <StatusPill tone="warning">Terms required</StatusPill>;
  return <StatusPill tone="neutral">In progress</StatusPill>;
}

/** The 1-segment-per-module ticker under the greeting (mockup of record). */
function ProgressTicker({
  ledger,
  enrollment,
}: {
  ledger: LedgerRow[];
  enrollment: LmsEnrollment;
}) {
  if (ledger.length === 0) return null;
  const quizModules = ledger.filter((row) => row.quiz);
  const passedCheckpoints = quizModules.filter((row) => row.passed).length;
  return (
    <div>
      <div aria-hidden="true" className="flex gap-1">
        {ledger.map((row) => (
          <div
            key={row.module.id}
            className={`h-1.5 flex-1 rounded-[1px] ${
              row.passed
                ? 'bg-dacfp-navy'
                : row.current
                  ? 'border border-dacfp-gold-hi bg-dacfp-gold-hi/25'
                  : 'bg-dacfp-line'
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-dacfp-gray-text">
        <span>Enrolled {formatDate(enrollment.enrolled_at)}</span>
        {quizModules.length > 0 ? (
          <span>
            {passedCheckpoints} of {quizModules.length} checkpoints passed
          </span>
        ) : null}
        <span>Certification</span>
      </div>
    </div>
  );
}

/** Big-numeral stat band, right of the greeting (mockup of record). */
function StatBand({
  ledger,
  course,
  enrollment,
}: {
  ledger: LedgerRow[];
  course: LmsCourse;
  enrollment: LmsEnrollment;
}) {
  const passedCount = ledger.filter((row) => row.passed).length;
  const total = ledger.length;
  const ce = course.ce_credits;
  const ceAccrued =
    ce !== null && total > 0 ? Math.round((ce * passedCount * 10) / total) / 10 : null;
  const monthsRemaining = enrollment.expires_at
    ? Math.max(
        0,
        Math.round(
          (new Date(enrollment.expires_at).getTime() - Date.now()) / (30.44 * 86_400_000),
        ),
      )
    : null;

  const stats: { value: string; unit?: string; label: string }[] = [
    { value: String(passedCount), unit: ` / ${total}`, label: 'Modules passed' },
  ];
  if (ce !== null) {
    stats.push({
      value: String(ceAccrued),
      unit: ' CE',
      label: `Accrued of up to ${ce}`,
    });
  }
  stats.push(
    monthsRemaining !== null
      ? { value: String(monthsRemaining), unit: ' mo', label: 'Enrollment remaining' }
      : { value: '—', label: 'No access expiry' },
  );

  return (
    <dl className="flex gap-8 sm:gap-10">
      {stats.map((stat) => (
        <div key={stat.label} className="text-left sm:text-right">
          <dd className="order-1 text-3xl font-bold tabular-nums tracking-tight text-dacfp-navy">
            {stat.value}
            {stat.unit ? (
              <span className="text-base font-semibold text-dacfp-gray-text">{stat.unit}</span>
            ) : null}
          </dd>
          <dt className="mt-1 text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
            {stat.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/** The resume-first hero card ("Next up" in the mockup). §2a mechanics kept. */
function NextUpCard({
  view,
  ledger,
  course,
}: {
  view: CourseView;
  ledger: LedgerRow[];
  course: LmsCourse;
}) {
  const next = ledger.find((row) => row.current) ?? ledger.find((row) => !row.passed);

  if (view.accessState === 'expired') {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <p className="eyebrow text-dacfp-gold-text">Course access</p>
        <h3 id="next-up-heading" className="mt-1.5 text-xl font-bold text-dacfp-navy">
          This course can no longer be opened
        </h3>
        <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
          Course access expiry does not itself change designation standing. Your record of
          passed modules and checkpoints is preserved below.
        </p>
      </section>
    );
  }

  if (!view.termsAccepted || !view.unlocked) {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <p className="eyebrow text-dacfp-gold-text">Before you begin</p>
        <h3 id="next-up-heading" className="mt-1.5 text-xl font-bold text-dacfp-navy">
          {view.termsAccepted ? 'This course is not open yet' : 'Accept the program terms'}
        </h3>
        <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
          {view.termsAccepted
            ? 'Complete the prerequisite course to open this curriculum.'
            : 'The program terms open automatically — accept them once and your course of study unlocks.'}
        </p>
      </section>
    );
  }

  if (view.complete) {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-dacfp-gold-text">Course of study complete</p>
            <h3 id="next-up-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">
              Every requirement is met
            </h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
              All modules and checkpoints in {course.title} are complete. Review any module
              whenever you like — your record stays exactly as it stands.
            </p>
          </div>
          {view.resumeModule ? (
            <div className="shrink-0">
              <Link className="button-secondary" to={view.resumePath}>
                Review the course
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (!next) return null;

  return (
    <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <p className="eyebrow text-dacfp-gold-text">
            Next up · Module {String(next.module.position).padStart(2, '0')} of {ledger.length}
          </p>
          <h3 id="next-up-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">
            {next.module.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
            {next.lessons.length > 0
              ? `${next.lessons.length} lesson${next.lessons.length === 1 ? '' : 's'}, `
              : ''}
            {next.quiz
              ? `followed by a ${next.quiz.question_count}-question checkpoint. Pass at ${next.quiz.pass_pct}% or higher to keep moving.`
              : 'with no checkpoint — it completes when its required lessons are done.'}
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-dacfp-gray-text">
            {next.minutes > 0 ? <span>{next.minutes} min of video</span> : null}
            {next.quiz ? <span>{next.quiz.question_count}-question checkpoint</span> : null}
            {next.module.ce_credits !== null && next.module.ce_credits !== undefined ? (
              <span>{next.module.ce_credits} CE</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Link className="button-primary" to={view.resumePath}>
            {view.resumeLesson ? 'Resume' : 'Begin'} Module{' '}
            {view.resumeModule?.position ?? next.module.position}
            <ChevronRight className="size-icon-sm" aria-hidden="true" />
          </Link>
          {course.progression === 'sequential' ? (
            <p className="text-center text-xs text-dacfp-gray-text sm:text-right">
              Modules unlock in order
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The module ledger ("Course of study" — mockup of record, R1 truthful). */
function CourseOfStudy({
  view,
  ledger,
  course,
}: {
  view: CourseView;
  ledger: LedgerRow[];
  course: LmsCourse;
}) {
  if (ledger.length === 0) return null;
  const avgMinutes = Math.round(
    ledger.reduce((total, row) => total + row.minutes, 0) / ledger.length,
  );
  return (
    <section aria-labelledby="course-of-study-heading" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5 sm:px-7">
        <h3 id="course-of-study-heading" className="text-lg font-bold text-dacfp-navy">
          Course of study
        </h3>
        <p className="text-xs tabular-nums text-dacfp-gray-text">
          {ledger.length} modules
          {avgMinutes > 0 ? ` · ~${avgMinutes} min each` : ''}
          {course.progression === 'sequential' ? ' · in order' : ' · any order'}
        </p>
      </div>
      <ol>
        {ledger.map((row) => {
          const rowState = row.passed
            ? ('passed' as const)
            : row.current
              ? ('current' as const)
              : row.unlocked
                ? ('available' as const)
                : ('locked' as const);
          const rowBody = (
            <>
              <span
                className={`w-8 shrink-0 text-xs font-bold tabular-nums ${
                  rowState === 'locked' ? 'text-dacfp-gray-text' : 'text-dacfp-gold-text'
                }`}
              >
                {String(row.module.position).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${
                    rowState === 'locked' ? 'text-dacfp-gray-text' : 'text-dacfp-navy'
                  }`}
                >
                  {row.module.title}
                </span>
                <span className="mt-0.5 block text-xs text-dacfp-gray-text">
                  {row.lessons.length} lesson{row.lessons.length === 1 ? '' : 's'}
                  {row.minutes > 0 ? ` · ${row.minutes} min` : ''}
                  {row.quiz ? ' · checkpoint' : ''}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {rowState === 'passed' ? (
                  <StatusPill tone="neutral">Passed</StatusPill>
                ) : rowState === 'current' ? (
                  <StatusPill tone="current">Up next</StatusPill>
                ) : rowState === 'available' ? (
                  <StatusPill tone="muted">Available</StatusPill>
                ) : (
                  <StatusPill tone="muted">Locked</StatusPill>
                )}
                {row.passed && row.passedAttempt ? (
                  <span className="text-[11px] tabular-nums text-dacfp-gray-text">
                    Checkpoint passed · attempt {row.passedAttempt.attempt_number}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={row.module.id} className="border-t border-dacfp-line/60">
              {row.unlocked ? (
                <Link
                  to={`/course/${course.slug}/module/${row.module.position}`}
                  className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-dacfp-wash sm:px-7"
                >
                  {rowBody}
                </Link>
              ) : (
                <div
                  className="flex min-h-14 items-center gap-3 px-5 py-3 opacity-80 sm:px-7"
                  aria-label={`Module ${row.module.position} is locked until the previous checkpoint is passed.`}
                >
                  {rowBody}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!view.contentAvailable ? (
        <p className="border-t border-dacfp-line/60 px-5 py-3 text-xs leading-5 text-dacfp-gray-text sm:px-7">
          Modules open once course access, terms, and any prerequisite are in place.
        </p>
      ) : null}
    </section>
  );
}

/** Right rail: the enrollment window, stated plainly (mockup of record). */
function EnrollmentTermCard({
  view,
  enrollment,
  moduleCount,
}: {
  view: CourseView;
  enrollment: LmsEnrollment;
  moduleCount: number;
}) {
  const start = new Date(enrollment.enrolled_at).getTime();
  const end = enrollment.expires_at ? new Date(enrollment.expires_at).getTime() : null;
  const elapsedPct =
    end !== null && end > start
      ? Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)))
      : 0;
  const monthsRemaining =
    end !== null ? Math.max(0, Math.round((end - Date.now()) / (30.44 * 86_400_000))) : null;

  return (
    <section aria-labelledby="enrollment-term-heading" className="card p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text">
        Enrollment term
      </p>
      <h3 id="enrollment-term-heading" className="mt-2 text-lg font-bold text-dacfp-navy">
        {view.accessState === 'expired'
          ? 'Access expired'
          : monthsRemaining !== null
            ? `${monthsRemaining} month${monthsRemaining === 1 ? '' : 's'} remaining`
            : 'No access expiry'}
      </h3>
      {end !== null ? (
        <>
          <div
            aria-hidden="true"
            className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-dacfp-wash-blue"
          >
            <div className="h-full bg-dacfp-navy" style={{ width: `${elapsedPct}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-xs tabular-nums text-dacfp-gray-text">
            <span>{formatDate(enrollment.enrolled_at)}</span>
            <span>{formatDate(enrollment.expires_at)}</span>
          </p>
        </>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-dacfp-gray-text">
        {view.accessState === 'expired'
          ? 'Course access expiry does not itself change designation standing.'
          : end !== null
            ? `Access to all ${moduleCount} modules continues through your enrollment date.`
            : 'This enrollment has no stated access expiry.'}
      </p>
    </section>
  );
}

/**
 * Right rail: CE credits & reporting status (mockup of record; the panel the
 * 585 "were my credits reported?" tickets argue for). Display-only — CE
 * reporting itself is a later workflow (SPEC Hard Rule 10).
 */
function CeReportingCard({
  ledger,
  course,
  snapshot,
}: {
  ledger: LedgerRow[];
  course: LmsCourse;
  snapshot: LearnerSnapshot;
}) {
  const ce = course.ce_credits;
  if (ce === null) return null;
  const passedCount = ledger.filter((row) => row.passed).length;
  const accrued =
    ledger.length > 0 ? Math.round((ce * passedCount * 10) / ledger.length) / 10 : 0;
  const ids = snapshot.profile.credential_ids;
  const onFile = [
    ids.cfp ? { label: 'CFP Board ID on file', value: ids.cfp } : null,
    ids.iwi ? { label: 'IWI ID on file', value: ids.iwi } : null,
    ids.cfa ? { label: 'CFA ID on file', value: ids.cfa } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section aria-labelledby="ce-reporting-heading" className="card p-5 sm:p-6">
      <p
        id="ce-reporting-heading"
        className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text"
      >
        CE credits &amp; reporting status
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-dacfp-navy">{accrued}</span>
        <span className="text-sm text-dacfp-gray-text">of up to {ce} CE on certification</span>
      </p>
      <dl className="mt-4 space-y-2 border-t border-dacfp-line/60 pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-dacfp-gray-text">CFP Board</dt>
          <dd className="text-right text-xs font-semibold text-dacfp-blue">
            Reported for you on certification
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-dacfp-gray-text">IWI / CFA bodies</dt>
          <dd className="text-right text-xs font-semibold text-dacfp-gray-text">Self-report</dd>
        </div>
      </dl>
      {onFile.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-dacfp-gray-text">
          {onFile.map((entry) => (
            <li key={entry.label}>
              {entry.label}:{' '}
              <span className="font-semibold tabular-nums text-dacfp-navy">
                ····{entry.value.slice(-4)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-5 text-dacfp-gray-text">
          No credential IDs on file yet.{' '}
          <Link className="font-semibold text-dacfp-blue hover:underline" to="/account">
            Add your CFP, IWI, or CFA ID
          </Link>{' '}
          so CE reporting is ready when you certify.
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-dacfp-gray-text">
        The day you certify, this panel shows exactly what was reported, to whom, and when.
      </p>
    </section>
  );
}

/** Right rail: the certification panel (mockup of record; R4 provider-neutral). */
function CertificationPanel({
  ledger,
  course,
  bonusModuleCount,
}: {
  ledger: LedgerRow[];
  course: LmsCourse;
  bonusModuleCount: number;
}) {
  const remaining = ledger.filter((row) => row.quiz && !row.passed).length;
  const benefits = [
    'The CBDA designation, listed in FINRA’s database',
    // R4: provider-neutral credential copy — no vendor named to learners.
    'Your digital credential, shareable to LinkedIn',
    course.ce_credits !== null
      ? `Printable certificate & up to ${course.ce_credits} CFP/IWI/CFA CE credits`
      : 'A printable certificate of completion',
    ...(bonusModuleCount > 0
      ? [`${bonusModuleCount} bonus module${bonusModuleCount === 1 ? '' : 's'} and a year of DACFP content`]
      : []),
  ];
  return (
    <section
      aria-labelledby="certification-heading"
      className="on-navy rounded-[0.1875rem] bg-dacfp-navy p-5 text-white sm:p-6"
    >
      <div className="flex items-center gap-4">
        <CbdaSeal size="sm" decorative />
        <div>
          <h3 id="certification-heading" className="text-lg font-bold text-white">
            Upon certification
          </h3>
          <p className="text-xs text-dacfp-gray">
            {remaining === 0
              ? 'Your record is complete'
              : `${remaining} checkpoint${remaining === 1 ? '' : 's'} from here`}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-white/85">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2.5">
            <span aria-hidden="true" className="text-dacfp-gold-hi">
              —
            </span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-white/20 pt-3 text-xs leading-5 text-white/70">
        Learning access and designation status are governed separately.
      </p>
    </section>
  );
}

/** An enrollment whose course RLS no longer exposes. Kept visible on purpose. */
function HiddenCourseCard({ enrollment }: { enrollment: LmsEnrollment }) {
  const state = enrollmentAccessState(enrollment);
  return (
    <article className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <IconTile icon={ShieldAlert} size="md" tone="gold" />
        <StatusPill tone="warning">
          {state === 'expired' ? 'Access expired' : 'Access unavailable'}
        </StatusPill>
      </div>
      <h3 className="mt-5 text-xl font-bold text-dacfp-navy">
        {state === 'expired' ? 'Expired course access' : 'Course access unavailable'}
      </h3>
      <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
        Course details are no longer available to this session. The enrollment remains visible so its access status is not hidden.
      </p>
      <p className="mt-5 rounded-[0.1875rem] border border-dacfp-gold/40 bg-dacfp-gold/10 p-4 text-sm leading-6 text-dacfp-navy">
        {state === 'expired'
          ? `Course access expired ${formatDate(enrollment.expires_at)}. This does not itself change designation standing.`
          : 'Course access is unavailable. Contact DACFP support if you expected this course to remain active.'}
      </p>
      <Link className="button-secondary mt-6 self-start" to="/account">
        Review account
      </Link>
    </article>
  );
}

function LibraryCard({
  catalog,
  snapshot,
  course,
  enrollment,
}: {
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  course: LmsCourse;
  enrollment: LmsEnrollment;
}) {
  const view = courseView(catalog, snapshot, course, enrollment);

  return (
    <article className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <IconTile
          icon={view.contentAvailable ? BookOpen : LockKeyhole}
          size="md"
          tone={view.contentAvailable ? 'brand' : 'gold'}
        />
        <CourseStatus view={view} course={course} />
      </div>

      <h3 className="mt-5 text-lg font-bold text-dacfp-navy">{course.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-dacfp-gray-text">{course.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-dacfp-gray-text">
        <span className="flex items-center gap-2">
          <Award aria-hidden="true" className="size-icon-sm text-dacfp-gold" />
          <strong className="text-dacfp-navy">{course.ce_credits ?? 0}</strong> CE credits
        </span>
        <span className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-icon-sm text-dacfp-blue" />
          <AccessLine enrollment={enrollment} />
        </span>
      </div>

      {/* brief #14: locked-state storytelling — a locked card says what opens
          it, not just that it is shut. */}
      {view.accessState === 'expired' ? (
        <p className="mt-4 rounded-[0.1875rem] border border-dacfp-gold/40 bg-dacfp-gold/10 p-3 text-sm leading-6 text-dacfp-navy">
          This course can no longer be opened. Course access expiry does not itself change designation standing.
        </p>
      ) : !view.unlocked ? (
        <p className="mt-4 rounded-[0.1875rem] border border-dacfp-gold/40 bg-dacfp-gold/10 p-3 text-sm leading-6 text-dacfp-navy">
          Complete FPT to unlock this bonus course. Your enrollment is ready and waiting.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-dacfp-gray-text">
          Open progression — study these modules in any order. {view.progress}% complete.
        </p>
      )}

      {view.contentAvailable && view.resumeModule ? (
        <div className="mt-5">
          <Link className="button-secondary" to={view.resumePath}>
            {view.complete ? 'Review course' : view.resumeLesson ? 'Resume lesson' : 'Continue'}
            <ChevronRight className="size-icon-sm" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function DashboardPage() {
  const { catalog, snapshot } = useLms();

  const rows = snapshot.enrollments.map((enrollment) => ({
    enrollment,
    course: catalog.courses.find((item) => item.id === enrollment.course_id) ?? null,
  }));
  const hidden = rows.filter((row) => !row.course);
  const visible = rows.filter(
    (row): row is { enrollment: LmsEnrollment; course: LmsCourse } => row.course !== null,
  );
  const flagship = visible.find((row) => courseKind(row.course) === 'flagship') ?? null;
  const renewals = visible.filter((row) => courseKind(row.course) === 'renewal');
  const library = visible.filter((row) => courseKind(row.course) === 'library');
  const bonusModuleCount = library.reduce(
    (total, row) =>
      total + catalog.modules.filter((module: LmsModule) => module.course_id === row.course.id).length,
    0,
  );

  const flagshipView = flagship
    ? courseView(catalog, snapshot, flagship.course, flagship.enrollment)
    : null;
  const ledger =
    flagship && flagshipView
      ? moduleLedger(catalog, snapshot, flagship.course, flagship.enrollment, flagshipView)
      : [];

  const firstName = snapshot.profile.display_name.split(/\s+/)[0] || 'there';

  const header = (
    <header className="border-b border-dacfp-line pb-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow text-dacfp-gold-text">
            {flagship ? flagship.course.title : 'Learner dashboard'}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-dacfp-navy md:text-4xl">
            {greetingForNow()}, {firstName}.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-dacfp-gray-text">
            {flagship && flagshipView
              ? flagshipSummary(flagshipView, ledger)
              : 'Continue your courses and keep annual learning access in view.'}
          </p>
        </div>
        {flagship && ledger.length > 0 ? (
          <StatBand ledger={ledger} course={flagship.course} enrollment={flagship.enrollment} />
        ) : null}
      </div>
      {flagship && ledger.length > 0 ? (
        <div className="mt-6">
          <ProgressTicker ledger={ledger} enrollment={flagship.enrollment} />
        </div>
      ) : null}
      {flagship ? (
        <div className="mt-4 flex items-center gap-3 lg:hidden">
          <CourseStatus view={flagshipView!} course={flagship.course} />
        </div>
      ) : null}
    </header>
  );

  if (snapshot.enrollments.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          title="No courses yet"
          description="There are no learner enrollments attached to this account. Contact DACFP support if you expected to see a course here."
          action={
            <Link className="button-secondary" to="/account">
              Review account
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      {/* §2b: renewal as a time-bound event surface, never a peer card. */}
      {renewals.map(({ course, enrollment }) => {
        const view = courseView(catalog, snapshot, course, enrollment);
        return (
          <RenewalEvent
            key={enrollment.id}
            course={course}
            enrollment={enrollment}
            // Dark build: the enrollment existing is the whole signal. Promotion
            // replaces this expression with the real entitlement answer — a prop
            // change here, not a redesign inside RenewalEvent.
            visible
            actionable={view.contentAvailable && Boolean(view.resumeModule)}
            resumePath={view.resumePath}
          />
        );
      })}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* §2a: FPT is the hero. Resume-first — the primary action is "carry on
            from where you stopped", not "browse a catalog". */}
        <div className="min-w-0 space-y-6">
          {flagship && flagshipView ? (
            <>
              <NextUpCard view={flagshipView} ledger={ledger} course={flagship.course} />
              <CourseOfStudy view={flagshipView} ledger={ledger} course={flagship.course} />
            </>
          ) : null}

          {/* §2c: the library — visually subordinate to the hero. */}
          {library.length > 0 || hidden.length > 0 ? (
            <section aria-labelledby="library-heading">
              <div className="mb-4 mt-2">
                <p className="eyebrow">Bonus library</p>
                <h2 id="library-heading" className="mt-1 text-xl font-bold text-dacfp-navy">
                  Additional courses
                </h2>
                <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
                  Further study that opens as you progress through the track.
                </p>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                {library.map(({ course, enrollment }) => (
                  <LibraryCard
                    key={enrollment.id}
                    catalog={catalog}
                    snapshot={snapshot}
                    course={course}
                    enrollment={enrollment}
                  />
                ))}
                {hidden.map(({ enrollment }) => (
                  <HiddenCourseCard key={enrollment.id} enrollment={enrollment} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {flagship && flagshipView ? (
          <aside aria-label="Enrollment and certification" className="space-y-6">
            <EnrollmentTermCard
              view={flagshipView}
              enrollment={flagship.enrollment}
              moduleCount={ledger.length}
            />
            <CeReportingCard ledger={ledger} course={flagship.course} snapshot={snapshot} />
            <CertificationPanel
              ledger={ledger}
              course={flagship.course}
              bonusModuleCount={bonusModuleCount}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
