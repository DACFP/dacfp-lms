import {
  Award,
  BookMarked,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  ExternalLink,
  FileText,
  Library,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CbdaSeal } from '../components/CbdaSeal';
import { ExpiredAccessPanel } from '../components/ExpiredAccessPanel';
import { IconTile } from '../components/IconTile';
import { LockedBadge } from '../components/LockedBadge';
import { RenewalEvent } from '../components/RenewalEvent';
import { EmptyState, StatusPill, formatDate } from '../components/common';
import { useLms } from '../context/LmsContext';
import type {
  Catalog,
  CompletionEvidence,
  LearnerSnapshot,
  LmsCourse,
  LmsEnrollment,
  LmsModule,
} from '../data/types';
import { courseUnlocked, lessonComplete, termsGateSatisfied } from '../engine';
import { courseKind } from '../lib/courseKind';
import { courseForEnrollment } from '../lib/enrollmentCourse';
import { remainingEnrollmentTerm } from '../lib/enrollmentTerm';
import {
  blockerGuidance,
  courseProgressPercent,
  courseProgressionBlocker,
  enrollmentAccessState,
  isCourseComplete,
  moduleIsPassed,
  moduleIsUnlocked,
  resumeModuleForCourse,
} from '../lib/progress';
import { QUIZ_POLICY_COPY } from '../lib/quizPolicy';
import { isRenewalWindowOpen, renewalWindowForEnrollment } from '../lib/renewal';
import { formatClock } from '../lib/time';
import { moduleCounterLabel } from '../lib/moduleLabel';

function addOneYear(value: string) {
  const date = new Date(value);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

function courseView(
  catalog: Catalog,
  snapshot: LearnerSnapshot,
  course: LmsCourse,
  enrollment: LmsEnrollment,
) {
  const accessState = enrollmentAccessState(enrollment);
  const unlocked = courseUnlocked(course, snapshot.completions);
  const termsAccepted = termsGateSatisfied(course, enrollment);
  const courseModules = catalog.modules
    .filter((item) => item.course_id === course.id)
    .sort((a, b) => a.position - b.position);
  const complete = courseModules.length > 0 && isCourseComplete(catalog, snapshot, course);
  const progress = courseProgressPercent(catalog, snapshot, course, enrollment);
  const resumeModule = resumeModuleForCourse(catalog, snapshot, course);
  const enrollmentProgress = snapshot.progress.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const enrollmentSurveyResponses = snapshot.surveyResponses.filter(
    (item) => item.enrollment_id === enrollment.id,
  );
  const resumeItem = resumeModule
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
        .find(({ lesson }) => !lessonComplete(
          lesson,
          enrollmentProgress,
          enrollmentSurveyResponses,
        ))
    : null;
  const resumeLesson = resumeItem?.lesson ?? null;
  const resumeProgress = resumeItem?.progress ?? null;
  const contentAvailable = accessState === 'active' && unlocked && termsAccepted;
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
    resumeProgress,
    contentAvailable,
    resumePath,
  };
}

type CourseView = ReturnType<typeof courseView>;

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
    const unlocked = view.contentAvailable && moduleIsUnlocked(catalog, snapshot, course, module);
    const current =
      !passed && unlocked && !currentAssigned && course.progression === 'sequential';
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

function flagshipSummary(view: CourseView, ledger: LedgerRow[]) {
  const passedCount = ledger.filter((row) => row.passed).length;
  const next = ledger.find((row) => row.current);
  if (view.accessState !== 'active') {
    return 'Course access has expired. Your record below is preserved, and designation standing is governed separately.';
  }
  if (!view.termsAccepted) return 'Accept the program terms to open your course of study.';
  if (view.complete) {
    return 'Every module and quiz is complete. Review any lesson whenever you like.';
  }
  if (passedCount === 0) {
    return `Your course of study is ready. Module 1 opens the program${next ? ` with ${next.module.title}` : ''}.`;
  }
  const cleanRecord = ledger
    .filter((row) => row.passed && row.passedAttempt)
    .every((row) => row.passedAttempt!.attempt_number <= 2);
  const recordClause = cleanRecord
    ? ', with every quiz passed on the first or second attempt'
    : '';
  const nextClause = next ? ` Module ${next.module.position} is queued and ready.` : '';
  return `You’re ${passedCount} module${passedCount === 1 ? '' : 's'} in${recordClause}.${nextClause}`;
}

function CourseStatus({ view, course }: { view: CourseView; course: LmsCourse }) {
  if (view.accessState === 'expired') return <StatusPill tone="warning">Access expired</StatusPill>;
  if (view.accessState === 'revoked') return <StatusPill tone="warning">Access unavailable</StatusPill>;
  if (view.complete) return <StatusPill tone="positive">Complete</StatusPill>;
  if (!view.unlocked) {
    return <LockedBadge reason={`${course.title} unlocks once you complete the prerequisite course.`} />;
  }
  if (!view.termsAccepted) return <StatusPill tone="warning">Terms required</StatusPill>;
  return <StatusPill tone="neutral">In progress</StatusPill>;
}

function ProgressTicker({ ledger, enrollment }: { ledger: LedgerRow[]; enrollment: LmsEnrollment }) {
  if (ledger.length === 0) return null;
  const quizModules = ledger.filter((row) => row.quiz);
  const passedQuizzes = quizModules.filter((row) => row.passed).length;
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
        <span>{passedQuizzes} of {quizModules.length} quizzes passed</span>
        <span>Certification</span>
      </div>
    </div>
  );
}

function orientationWasCollapsed(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

function OrientationCard({
  moduleCount,
  storageKey,
}: {
  moduleCount: number;
  storageKey: string;
}) {
  const [collapsed, setCollapsed] = useState(() => orientationWasCollapsed(storageKey));

  const setCardCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // Storage can be unavailable in privacy-restricted browsers; the in-page
      // collapse still works for the current visit.
    }
  };

  return (
    <section aria-labelledby="orientation-heading" className="card border-l-[3px] border-l-dacfp-gold-text p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-dacfp-gold-text">Your completion contract</p>
          <h2 id="orientation-heading" className="mt-1.5 text-xl font-bold text-dacfp-navy">
            How you earn the CBDA
          </h2>
        </div>
        <button
          className="button-quiet shrink-0 px-3"
          type="button"
          aria-expanded={!collapsed}
          aria-controls="orientation-details"
          onClick={() => setCardCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown className="size-icon-sm" aria-hidden="true" /> : <ChevronUp className="size-icon-sm" aria-hidden="true" />}
          {collapsed ? 'Show' : 'Collapse'}
        </button>
      </div>
      {collapsed ? (
        <p className="mt-3 text-sm text-dacfp-gray-text">
          {moduleCount} modules · 70% per quiz · unlimited attempts · no final exam
        </p>
      ) : (
        <div id="orientation-details" className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            `Complete all ${moduleCount} modules`,
            'Pass each 10-question quiz at 70%',
            'Retake any quiz — attempts are unlimited',
            'No cumulative final exam',
          ].map((item) => (
            <p key={item} className="flex items-start gap-2 text-sm leading-6 text-dacfp-navy">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-dacfp-gold-text" aria-hidden="true" />
              {item}
            </p>
          ))}
          <p className="sm:col-span-2 border-t border-dacfp-line pt-3 text-sm leading-6 text-dacfp-gray-text">
            Once every requirement is complete, your credential is revealed and CE follow-through begins.
          </p>
        </div>
      )}
    </section>
  );
}

function StatBand({
  ledger,
  enrollment,
  completion,
}: {
  ledger: LedgerRow[];
  enrollment: LmsEnrollment;
  completion: CompletionEvidence | null;
}) {
  const accessState = enrollmentAccessState(enrollment);
  const remaining = remainingEnrollmentTerm(enrollment);
  const stats = [
    { value: `${ledger.filter((row) => row.passed).length}/${ledger.length}`, label: 'Modules' },
    {
      value: accessState === 'expired' ? 'Expired' : remaining?.compact ?? '—',
      label: 'Enrollment remaining',
    },
    {
      value: completion ? formatDate(addOneYear(completion.completed_at)) : 'On certification',
      label: 'Designation',
    },
  ];
  return (
    <dl className="grid grid-cols-3 gap-4 sm:gap-8">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 text-left lg:text-right">
          <dd className="text-lg font-bold tabular-nums tracking-tight text-dacfp-navy sm:text-2xl">
            {stat.value}
          </dd>
          <dt className="mt-1 text-[10px] font-bold uppercase tracking-eyebrow text-dacfp-gray-text sm:text-[11px]">
            {stat.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

function NextUpCard({
  view,
  ledger,
  course,
  enrollment,
}: {
  view: CourseView;
  ledger: LedgerRow[];
  course: LmsCourse;
  enrollment: LmsEnrollment;
}) {
  const next = ledger.find((row) => row.current) ?? ledger.find((row) => !row.passed);
  if (view.accessState === 'expired') {
    return <ExpiredAccessPanel enrollment={enrollment} headingId="next-up-heading" />;
  }
  if (!view.termsAccepted || !view.unlocked) {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <p className="eyebrow text-dacfp-gold-text">Before you begin</p>
        <h2 id="next-up-heading" className="mt-1.5 text-xl font-bold text-dacfp-navy">
          {view.termsAccepted ? 'This course is not open yet' : 'Accept the program terms'}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
          {view.termsAccepted ? 'Complete the prerequisite course to open this curriculum.' : 'Accept the program terms once and your course of study unlocks.'}
        </p>
      </section>
    );
  }
  if (view.complete) {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <p className="eyebrow text-dacfp-gold-text">Course of study complete</p>
        <h2 id="next-up-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">Every requirement is met</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
          All modules and quizzes in {course.title} are complete. Every module and lesson is open for review in any order.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="button-primary" to={`/completion/${course.slug}`}>View completion</Link>
          {view.resumeModule ? <Link className="button-secondary" to={`/course/${course.slug}/module/1`}>Review from module 1</Link> : null}
        </div>
      </section>
    );
  }
  if (!next) return null;
  const stoppedAt = view.resumeProgress?.last_position_seconds ?? 0;
  if (view.resumeLesson && stoppedAt > 0) {
    return (
      <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
        <p className="eyebrow text-dacfp-gold-text">Resume with memory</p>
        <h2 id="next-up-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">
          Welcome back — you stopped {formatClock(stoppedAt)} into Module {next.module.position}: {view.resumeLesson.title}.
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-dacfp-gray-text">
          Continue from the exact saved point, or replay the prior 30 seconds to restore context.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="button-primary" to={view.resumePath}>
            Resume <ChevronRight className="size-icon-sm" aria-hidden="true" />
          </Link>
          <Link className="button-secondary" to={`${view.resumePath}?replay=30`}>
            Replay last 30s
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="next-up-heading" className="card border-t-[3px] border-t-dacfp-gold-text p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <p className="eyebrow text-dacfp-gold-text">Next up · {moduleCounterLabel(next.module, view.courseModules)}</p>
          <h2 id="next-up-heading" className="mt-1.5 text-2xl font-bold text-dacfp-navy">{next.module.title}</h2>
          <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
            {next.lessons.length} lesson{next.lessons.length === 1 ? '' : 's'}{next.quiz ? ', followed by a short quiz.' : '.'}
          </p>
          {next.quiz ? <p className="mt-3 text-xs font-semibold text-dacfp-navy">{QUIZ_POLICY_COPY}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Link className="button-primary" to={view.resumePath}>
            {view.resumeLesson ? 'Resume' : 'Begin'} Module {view.resumeModule?.position ?? next.module.position}
            <ChevronRight className="size-icon-sm" aria-hidden="true" />
          </Link>
          <p className="text-center text-xs text-dacfp-gray-text sm:text-right">Modules unlock in order</p>
        </div>
      </div>
    </section>
  );
}

function CourseOfStudy({
  catalog,
  snapshot,
  view,
  ledger,
  course,
}: {
  catalog: Catalog;
  snapshot: LearnerSnapshot;
  view: CourseView;
  ledger: LedgerRow[];
  course: LmsCourse;
}) {
  if (ledger.length === 0) return null;
  const firstLocked = ledger.find((row) => !row.unlocked && !row.passed)?.module ?? null;
  const blocker = view.contentAvailable
    ? courseProgressionBlocker(catalog, snapshot, course)
    : null;
  const guidance = blocker ? blockerGuidance(blocker, firstLocked) : null;
  return (
    <section aria-labelledby="course-of-study-heading" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5 sm:px-7">
        <h2 id="course-of-study-heading" className="text-lg font-bold text-dacfp-navy">Course of study</h2>
        <p className="text-xs tabular-nums text-dacfp-gray-text">{ledger.length} modules · {view.complete ? 'open for review' : 'in order'}</p>
      </div>
      <ol>
        {ledger.map((row) => {
          const rowState = row.passed ? 'passed' : row.current ? 'current' : row.unlocked ? 'available' : 'locked';
          const body = (
            <>
              <span className={`w-8 shrink-0 text-xs font-bold tabular-nums ${rowState === 'locked' ? 'text-dacfp-gray-text' : 'text-dacfp-gold-text'}`}>{row.module.position}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${rowState === 'locked' ? 'text-dacfp-gray-text' : 'text-dacfp-navy'}`}>{row.module.title}</span>
                <span className="mt-0.5 block text-xs text-dacfp-gray-text">{row.lessons.length} lessons{row.minutes > 0 ? ` · ${row.minutes} min` : ''}{row.quiz ? ' · quiz' : ''}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <StatusPill tone={rowState === 'passed' ? 'neutral' : rowState === 'current' ? 'current' : 'muted'}>{rowState === 'passed' ? 'Passed' : rowState === 'current' ? 'Up next' : rowState === 'available' ? 'Available' : 'Locked'}</StatusPill>
                {row.passedAttempt ? <span className="text-[11px] tabular-nums text-dacfp-gray-text">Quiz passed · attempt {row.passedAttempt.attempt_number}</span> : null}
              </span>
            </>
          );
          return (
            <li key={row.module.id} className="border-t border-dacfp-line/60">
              {row.unlocked ? (
                <Link to={`/course/${course.slug}/module/${row.module.position}`} className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-dacfp-wash sm:px-7">{body}</Link>
              ) : (
                <div className="px-5 py-3 opacity-80 sm:px-7">
                  <div className="flex min-h-14 items-center gap-3" aria-label={`Module ${row.module.position} is locked.`}>{body}</div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {blocker && guidance && firstLocked ? (
        <div className="flex flex-col gap-3 border-t border-dacfp-line bg-dacfp-wash px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-sm font-semibold leading-6 text-dacfp-navy">
            {guidance.message}
          </p>
          <Link className="button-secondary shrink-0" to={blocker.path}>
            {guidance.action}
          </Link>
        </div>
      ) : null}
      {view.complete ? <p className="border-t border-dacfp-line/60 px-5 py-3 text-xs leading-5 text-dacfp-gray-text sm:px-7">Course complete — revisit any module or lesson in any order.</p> : null}
    </section>
  );
}

const resources = [
  { title: 'Crypto Catalog', description: 'Explore DACFP’s catalog of crypto education.', href: 'https://dacfp.com/cryptocatalog/', icon: Library },
  { title: 'CBDA Registry', description: 'Find credentialed professionals in the public registry.', href: 'https://dacfp.com/cbda-directory/', icon: Search },
  { title: 'Latest white paper', description: 'Read Ric Edelman’s latest digital-assets perspective.', href: 'https://dacfp.com/is-crypto-done/', icon: FileText },
  { title: 'Crypto Glossary', description: 'Review plain-language definitions for essential terms.', href: 'https://dacfp.com/glossary/', icon: BookMarked },
  { title: 'Certification FAQ', description: 'Get answers about certification and designation status.', href: 'https://dacfp.com/certification/faq/', icon: CircleHelp },
];

function ResourcesSection() {
  return (
    <section aria-labelledby="resources-heading">
      <p className="eyebrow">Keep exploring</p>
      <h2 id="resources-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Resources</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {resources.map(({ title, description, href, icon }) => (
          <a key={title} className="card group flex min-h-32 items-start gap-4 p-5 transition-colors hover:border-dacfp-blue/40 hover:bg-dacfp-wash-blue" href={href} target="_blank" rel="noreferrer">
            <IconTile icon={icon} size="sm" tone="brand" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-bold text-dacfp-navy">{title}<ExternalLink className="size-icon-sm text-dacfp-blue" aria-hidden="true" /></span>
              <span className="mt-1 block text-sm leading-6 text-dacfp-gray-text">{description}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function EnrollmentTermCard({ view, enrollment, moduleCount }: { view: CourseView; enrollment: LmsEnrollment; moduleCount: number }) {
  const start = new Date(enrollment.enrolled_at).getTime();
  const end = enrollment.expires_at ? new Date(enrollment.expires_at).getTime() : null;
  const elapsedPct = end !== null && end > start ? Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100))) : 0;
  const remaining = remainingEnrollmentTerm(enrollment);
  return (
    <section aria-labelledby="enrollment-term-heading" className="card p-5 sm:p-6">
      <p className="eyebrow">Enrollment term</p>
      <h2 id="enrollment-term-heading" className="mt-2 text-lg font-bold text-dacfp-navy">{view.accessState === 'expired' ? enrollment.expires_at ? `Access expired ${formatDate(enrollment.expires_at)}` : 'Access expired' : remaining?.headline ?? 'No access expiry'}</h2>
      {end !== null ? <><div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-dacfp-wash-blue"><div className="h-full bg-dacfp-navy" style={{ width: `${elapsedPct}%` }} /></div><p className="mt-2 flex justify-between text-xs tabular-nums text-dacfp-gray-text"><span>{formatDate(enrollment.enrolled_at)}</span><span>{formatDate(enrollment.expires_at)}</span></p></> : null}
      <p className="mt-3 text-xs leading-5 text-dacfp-gray-text">{view.accessState === 'expired' ? 'Course access expiry does not itself change designation standing.' : end !== null ? `Access to all ${moduleCount} modules continues through your enrollment date.` : 'This enrollment has no stated access expiry.'}</p>
    </section>
  );
}

function DesignationPanel({ completion, moduleCount, learnerName }: { completion: CompletionEvidence | null; moduleCount: number; learnerName: string }) {
  if (!completion) {
    return (
      <section aria-labelledby="designation-heading" className="card p-5 sm:p-6">
        <div className="flex items-center gap-4"><CbdaSeal size="sm" decorative /><div><p className="eyebrow">Designation</p><h2 id="designation-heading" className="mt-1 font-bold text-dacfp-navy">On certification</h2></div></div>
        <p className="mt-4 text-sm leading-6 text-dacfp-gray-text">{moduleCount > 0 ? `Complete all ${moduleCount} modules to earn the CBDA designation.` : 'Your designation status is tracked separately from course access.'}</p>
      </section>
    );
  }
  const validThrough = addOneYear(completion.completed_at);
  return (
    <section aria-labelledby="designation-heading" className="on-navy rounded-[0.1875rem] bg-dacfp-navy p-5 text-white sm:p-6">
      <div className="flex items-center gap-4"><CbdaSeal size="sm" decorative /><div><p className="text-[11px] font-bold uppercase tracking-eyebrow text-dacfp-gold-hi">Designation</p><h2 id="designation-heading" className="mt-1 text-lg font-bold">{completion.designation_issued ? 'Issued' : 'Issuance processing'}</h2></div></div>
      <dl className="mt-5 space-y-3 border-t border-white/20 pt-4 text-sm">
        <div><dt className="text-white/60">Credential holder</dt><dd className="mt-0.5 font-semibold">{learnerName}</dd></div>
        <div><dt className="text-white/60">Certified on</dt><dd className="mt-0.5 font-semibold tabular-nums">{formatDate(completion.completed_at)}</dd></div>
        <div><dt className="text-white/60">Valid through</dt><dd className="mt-0.5 font-semibold tabular-nums">{formatDate(validThrough)}</dd></div>
      </dl>
      <Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[0.1875rem] bg-white px-4 py-2.5 text-sm font-bold text-dacfp-navy hover:bg-dacfp-gold-hi" to="/credentials">Open My Credentials<FileText className="size-icon-sm" aria-hidden="true" /></Link>
    </section>
  );
}

function BonusLibrary({ entries }: {
  entries: Array<{ course: LmsCourse; modules: LmsModule[] }>;
}) {
  return (
    <section aria-labelledby="bonus-library-heading">
      <p className="eyebrow">Unlocked with certification</p>
      <h2 id="bonus-library-heading" className="mt-1 text-xl font-bold text-dacfp-navy">Bonus library</h2>
      <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">Choose any module. Your completed FPT record opens the whole library.</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {entries.flatMap(({ course, modules }) => modules.map((module) => (
          <article key={`${course.id}-${module.id}`} className="card flex flex-col overflow-hidden">
            <div className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-dacfp-navy">
              <div className="brand-strip absolute inset-x-0 top-0 h-1" />
              <CbdaSeal size="sm" decorative />
              <img className="absolute inset-0 h-full w-full object-cover" src={`/Brand/courses/${course.slug}.png`} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-xs font-bold uppercase tracking-eyebrow text-dacfp-gold-text">{course.title} · Module {module.position}</p>
              <h3 className="mt-2 text-lg font-bold text-dacfp-navy">{module.title}</h3>
              <p className="mt-3 flex items-center gap-2 text-sm text-dacfp-gray-text"><Award className="size-icon-sm text-dacfp-gold" aria-hidden="true" />{module.ce_credits ?? course.ce_credits ?? 0} CE credit{(module.ce_credits ?? course.ce_credits) === 1 ? '' : 's'}</p>
              <Link className="button-secondary mt-5 self-start" to={`/course/${course.slug}/module/${module.position}`}>Open module<ChevronRight className="size-icon-sm" aria-hidden="true" /></Link>
            </div>
          </article>
        )))}
      </div>
    </section>
  );
}

function HiddenCourseCard() {
  return (
    <article className="card p-5 sm:p-6">
      <IconTile icon={ShieldAlert} size="md" tone="gold" />
      <h2 className="mt-4 text-lg font-bold text-dacfp-navy">
        This course is no longer available — contact support
      </h2>
      <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
        The enrollment remains in your account record, but its course details cannot be
        resolved.
      </p>
      <a className="button-secondary mt-5" href="mailto:info@dacfp.com">
        Contact support
      </a>
    </article>
  );
}

export function DashboardPage() {
  const { catalog, snapshot } = useLms();
  const rows = snapshot.enrollments.map((enrollment) => ({
    enrollment,
    course: courseForEnrollment(catalog, enrollment),
  }));
  const hidden = rows.filter(
    (row) => !row.course || row.course.status === 'archived',
  );
  const visible = rows.filter((row): row is { enrollment: LmsEnrollment; course: LmsCourse } => row.course !== null && row.course.status !== 'archived');
  const flagship = visible.find((row) => courseKind(row.course) === 'flagship') ?? null;
  const renewals = visible.filter((row) => courseKind(row.course) === 'renewal');
  const library = visible.filter((row) => courseKind(row.course) === 'library');
  const flagshipView = flagship ? courseView(catalog, snapshot, flagship.course, flagship.enrollment) : null;
  const ledger = flagship && flagshipView ? moduleLedger(catalog, snapshot, flagship.course, flagship.enrollment, flagshipView) : [];
  const flagshipCompletion = flagship ? snapshot.completions.find((item) => item.course_id === flagship.course.id) ?? null : null;
  const learnerName = snapshot.profile.display_name || `${snapshot.profile.first_name} ${snapshot.profile.last_name}`.trim() || 'Learner';
  const firstName = snapshot.profile.first_name || learnerName.split(/\s+/)[0] || 'there';
  const header = (
    <header className="border-b border-dacfp-line pb-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><p className="eyebrow text-dacfp-gold-text">{flagship ? flagship.course.title : 'Learner dashboard'}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-dacfp-navy md:text-4xl">{greetingForNow()}, {firstName}.</h1>{flagship && flagshipView?.accessState === 'expired' ? <p className="mt-3 text-sm font-bold text-dacfp-gold-text">{flagship.enrollment.expires_at ? `Access expired ${formatDate(flagship.enrollment.expires_at)}` : 'Access expired'}</p> : null}<p className="mt-3 max-w-xl text-base leading-7 text-dacfp-gray-text">{flagship && flagshipView ? flagshipSummary(flagshipView, ledger) : 'Continue your course of study and keep your learning record in view.'}</p></div>
        {flagship && ledger.length > 0 ? <StatBand ledger={ledger} enrollment={flagship.enrollment} completion={flagshipCompletion} /> : null}
      </div>
      {flagship && ledger.length > 0 ? <div className="mt-6"><ProgressTicker ledger={ledger} enrollment={flagship.enrollment} /></div> : null}
      {flagship ? <div className="mt-4 flex items-center gap-3 lg:hidden"><CourseStatus view={flagshipView!} course={flagship.course} /></div> : null}
    </header>
  );
  if (snapshot.enrollments.length === 0) {
    return <div className="space-y-8">{header}<EmptyState title="No courses yet" description="There are no learner enrollments attached to this account. Contact DACFP support if you expected to see a course here." action={<Link className="button-secondary" to="/account">Review account</Link>} /></div>;
  }
  return (
    <div className="space-y-8">
      {header}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-8">
          {flagship && flagshipView ? <>{!flagshipView.complete && flagshipView.accessState === 'active' ? <OrientationCard moduleCount={ledger.length} storageKey={`dacfp-orientation:${snapshot.profile.auth_user_id}`} /> : null}<NextUpCard view={flagshipView} ledger={ledger} course={flagship.course} enrollment={flagship.enrollment} /><CourseOfStudy catalog={catalog} snapshot={snapshot} view={flagshipView} ledger={ledger} course={flagship.course} />{flagshipView.accessState === 'active' ? <ResourcesSection /> : null}</> : null}
          {flagshipCompletion && library.length > 0 ? <BonusLibrary entries={library.map(({ course }) => ({ course, modules: catalog.modules.filter((module) => module.course_id === course.id).sort((a, b) => a.position - b.position) }))} /> : null}
          {(flagshipCompletion || !flagship) && hidden.length > 0 ? <section className="grid gap-5 sm:grid-cols-2">{hidden.map(({ enrollment }) => <HiddenCourseCard key={enrollment.id} />)}</section> : null}
        </div>
        {flagship && flagshipView ? <aside aria-label="Enrollment and designation" className="space-y-6"><EnrollmentTermCard view={flagshipView} enrollment={flagship.enrollment} moduleCount={ledger.length} /><DesignationPanel completion={flagshipCompletion} moduleCount={ledger.length} learnerName={learnerName} /></aside> : null}
      </div>
      {flagship && isRenewalWindowOpen(flagship.enrollment) ? renewals.map(({ course, enrollment }) => { const view = courseView(catalog, snapshot, course, enrollment); const window = renewalWindowForEnrollment(flagship.enrollment); return <RenewalEvent key={enrollment.id} course={course} enrollment={enrollment} visible window={{ opens_at: window ? new Date(window.opensAt).toISOString() : null, closes_at: window ? new Date(window.closesAt).toISOString() : null }} actionable={view.contentAvailable && Boolean(view.resumeModule)} resumePath={view.resumePath} />; }) : null}
    </div>
  );
}
