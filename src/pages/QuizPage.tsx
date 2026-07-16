import { CheckCircle2, LockKeyhole, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, StatusPill, learnerPath } from '../components/common';
import { useLms } from '../context/LmsContext';
import { courseUnlocked, nextAttemptNumber, termsGateSatisfied } from '../engine';
import { enrollmentForCourse, moduleIsUnlocked, quizIsAttemptable } from '../lib/progress';

export function QuizPage() {
  const [shellMessage, setShellMessage] = useState('');
  const { moduleId } = useParams();
  const { catalog, snapshot, selectedLearner } = useLms();
  const module = catalog.modules.find((item) => item.id === moduleId);
  const course = catalog.courses.find((item) => item.id === module?.course_id);
  const quiz = catalog.quizzes.find((item) => item.module_id === module?.id);

  if (!module || !course || !quiz) {
    return <EmptyState title="Quiz not found" description="This module has no learner quiz in the D0 catalog." />;
  }

  const enrollment = enrollmentForCourse(snapshot, course.id);
  if (!enrollment) {
    return <EmptyState title="No enrollment" description="The selected synthetic learner cannot access this quiz." />;
  }

  const attempts = snapshot.attempts
    .filter((attempt) => attempt.enrollment_id === enrollment.id && attempt.quiz_id === quiz.id)
    .sort((a, b) => b.attempt_number - a.attempt_number);
  const latest = attempts[0];
  const accessible =
    courseUnlocked(course, snapshot.completions) &&
    termsGateSatisfied(course, enrollment) &&
    moduleIsUnlocked(catalog, snapshot, course, module) &&
    quizIsAttemptable(catalog, snapshot, course, module);
  const nextNumber = nextAttemptNumber(quiz.id, attempts);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${course.title} · Module ${module.position}`}
        title={`${module.title} quiz`}
        description={`${quiz.question_count} questions. Score ${quiz.pass_pct}% or higher to pass and move on. Attempts are unlimited.`}
        action={<StatusPill tone={latest?.passed ? 'positive' : accessible ? 'neutral' : 'warning'}>{latest?.passed ? 'Passed' : accessible ? 'Ready' : 'Locked'}</StatusPill>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card p-6 sm:p-8" aria-labelledby="attempt-heading">
          <div className="flex size-12 items-center justify-center rounded-xl bg-dacfp-wash-blue text-brand-royal">
            <ShieldCheck aria-hidden="true" size={24} />
          </div>
          <p className="eyebrow mt-6">Attempt {nextNumber}</p>
          <h2 id="attempt-heading" className="mt-1 text-2xl font-bold text-brand-navy">Ready for the next attempt?</h2>
          <p className="mt-3 max-w-2xl leading-7 text-dacfp-slate">
            D0 renders the complete attempt gate and prior results. Question delivery and server-side grading arrive in D4; answer keys are never present in this client.
          </p>

          {accessible ? (
            <button type="button" className="button-primary mt-7" onClick={() => setShellMessage('D0 shell only: server-side quiz delivery begins in D4.')}>
              {latest ? <RotateCcw size={17} aria-hidden="true" /> : null}
              {latest ? `Retake quiz · attempt ${nextNumber}` : 'Start quiz attempt'}
            </button>
          ) : (
            <div className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-dacfp-wash px-4 py-2.5 text-sm font-bold text-dacfp-slate" aria-disabled="true">
              <LockKeyhole size={17} aria-hidden="true" /> Complete all required lessons first
            </div>
          )}
          {shellMessage ? (
            <p className="mt-4 rounded-lg border border-dacfp-line bg-dacfp-wash p-3 text-sm leading-6 text-dacfp-slate" role="status">
              {shellMessage}
            </p>
          ) : null}
        </section>

        <aside className="card h-fit p-5" aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-bold text-brand-navy">Attempt history</h2>
          {attempts.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-dacfp-slate">No attempts yet. There is no penalty or cooldown.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="rounded-lg border border-dacfp-line p-3">
                  <div className="flex items-center gap-2">
                    {attempt.passed ? <CheckCircle2 className="text-status-positive" size={18} aria-hidden="true" /> : <XCircle className="text-status-danger" size={18} aria-hidden="true" />}
                    <span className="font-bold text-brand-navy">Attempt {attempt.attempt_number}</span>
                  </div>
                  <p className="mt-2 text-sm text-dacfp-slate">
                    Score <strong className="tabular-nums text-brand-navy">{attempt.score}/{quiz.question_count}</strong> · {attempt.passed ? 'Passed' : 'Not passed'}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link className="button-quiet mt-4 w-full" to={learnerPath(`/course/${course.slug}/module/${module.position}`, selectedLearner)}>
            Back to module
          </Link>
        </aside>
      </div>
    </div>
  );
}
