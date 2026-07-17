import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Alert } from '../components/Alert';
import { LockedBadge } from '../components/LockedBadge';
import { QuizSkeleton } from '../components/Skeletons';
import { StatusAnnouncer, useStatusAnnouncer } from '../components/StatusAnnouncer';
import { EmptyState, PageHeader, StatusPill } from '../components/common';
import { useLms } from '../context/LmsContext';
import type {
  LmsQuizAnswers,
  LmsQuizGradeResult,
  LmsQuizPayload,
} from '../data/provider';
import { courseUnlocked, nextAttemptNumber, termsGateSatisfied } from '../engine';
import {
  enrollmentAccessState,
  enrollmentForCourse,
  moduleIsUnlocked,
  quizIsAttemptable,
} from '../lib/progress';

export function QuizPage() {
  const { moduleId } = useParams();
  const { catalog, snapshot, loadQuiz, submitQuiz } = useLms();
  const [payload, setPayload] = useState<LmsQuizPayload | null>(null);
  const [answers, setAnswers] = useState<LmsQuizAnswers>({});
  const [result, setResult] = useState<LmsQuizGradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // step 0..n-1 is a question; step === n is the review screen (brief #4).
  const [step, setStep] = useState(0);
  const verdict = useStatusAnnouncer<HTMLHeadingElement>();

  const module = catalog.modules.find((item) => item.id === moduleId);
  const course = catalog.courses.find((item) => item.id === module?.course_id);
  const quiz = catalog.quizzes.find((item) => item.module_id === module?.id);
  const enrollment = course ? enrollmentForCourse(snapshot, course.id) : null;
  const attempts = useMemo(
    () =>
      enrollment && quiz
        ? snapshot.attempts
            .filter(
              (attempt) =>
                attempt.enrollment_id === enrollment.id && attempt.quiz_id === quiz.id,
            )
            .sort((a, b) => b.attempt_number - a.attempt_number)
        : [],
    [enrollment, quiz, snapshot.attempts],
  );
  const latest = attempts[0];
  const accessible = Boolean(
    module &&
      course &&
      quiz &&
      enrollment &&
      enrollmentAccessState(enrollment) === 'active' &&
      courseUnlocked(course, snapshot.completions) &&
      termsGateSatisfied(course, enrollment) &&
      moduleIsUnlocked(catalog, snapshot, course, module) &&
      quizIsAttemptable(catalog, snapshot, course, module),
  );
  const nextNumber = quiz ? nextAttemptNumber(quiz.id, attempts) : 1;

  const startAttempt = useCallback(async () => {
    if (!quiz) return;
    setLoading(true);
    setError('');
    setResult(null);
    setAnswers({});
    setStep(0);
    verdict.clear();
    try {
      setPayload(await loadQuiz(quiz.id));
    } catch {
      setPayload(null);
      setError('Unable to load this quiz. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [loadQuiz, quiz, verdict]);

  useEffect(() => {
    if (accessible && quiz && !payload && !loading && !error) {
      void startAttempt();
    }
  }, [accessible, error, loading, payload, quiz, startAttempt]);

  if (!module || !course || !quiz) {
    return (
      <EmptyState
        title="Quiz not found"
        description="This quiz is unavailable or the link is no longer current."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the course that contains this quiz."
        action={<Link className="button-secondary" to={'/dashboard'}>Back to dashboard</Link>}
      />
    );
  }

  const accessState = enrollmentAccessState(enrollment);

  const selectChoice = (
    questionId: string,
    choiceId: string,
    selectKind: 'single' | 'multi',
  ) => {
    setAnswers((current) => {
      const selected = current[questionId] ?? [];
      return {
        ...current,
        [questionId]: selectKind === 'single'
          ? [choiceId]
          : selected.includes(choiceId)
            ? selected.filter((item) => item !== choiceId)
            : [...selected, choiceId],
      };
    });
  };

  const gradeCurrentAttempt = async () => {
    if (!payload) return;
    setSubmitting(true);
    setError('');
    try {
      const graded = await submitQuiz(payload.quiz.id, answers);
      setResult(graded);
      // brief #3/#5: the verdict is announced assertively and focus lands on
      // the result heading, so it reaches a screen reader and a keyboard user
      // in the same commit rather than only appearing on screen.
      verdict.announceAndFocus(
        `${graded.passed ? 'Passed' : 'Not passed yet'}. You scored ${graded.score} out of ${graded.possible_points}.`,
      );
    } catch {
      setError('Quiz submission failed. Your selections remain on this page so you can try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const nextModule = catalog.modules.find(
    (item) => item.course_id === course.id && item.position === module.position + 1,
  );
  const unlockedCourses = catalog.courses.filter(
    (item) => item.prerequisite_course_id === course.id,
  );
  const possiblePoints = payload
    ? payload.questions.reduce((total, question) => total + question.points, 0)
    : null;

  const questions = payload?.questions ?? [];
  const onReview = step >= questions.length;
  const currentQuestion = questions[step];
  const answeredCount = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const unanswered = questions.filter((q) => (answers[q.id] ?? []).length === 0);

  return (
    <div className="space-y-8">
      <StatusAnnouncer message={verdict.message} />

      <PageHeader
        eyebrow={`${course.title} · Module ${module.position}`}
        title={`${module.title} quiz`}
        description={`${quiz.question_count} questions. Score ${quiz.pass_pct}% or higher to pass and move on. Attempts are unlimited.`}
        action={
          latest?.passed ? (
            <StatusPill tone="positive">Passed</StatusPill>
          ) : accessState === 'expired' ? (
            <StatusPill tone="warning">Access expired</StatusPill>
          ) : accessible ? (
            <StatusPill tone="neutral">Ready</StatusPill>
          ) : (
            <LockedBadge reason="This quiz opens once every required lesson and any prior module quiz is complete." />
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0" aria-labelledby="attempt-heading">
          {!accessible ? (
            <div className="card p-6 sm:p-8">
              {/* No LockedBadge here: the heading already says "Quiz
                  unavailable", and a badge carrying that same string as its
                  sr-only reason would announce it twice. */}
              <p className="flex items-center gap-2 font-bold text-dacfp-navy">
                <LockKeyhole className="size-icon-sm" aria-hidden="true" /> Quiz unavailable
              </p>
              <p className="mt-3 text-sm leading-6 text-dacfp-gray-text">
                {accessState === 'expired'
                  ? 'Course access has expired. Designation standing is governed separately.'
                  : accessState === 'revoked'
                    ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                    : 'Complete all required lessons and any prior module before starting this quiz.'}
              </p>
              <Link className="button-quiet mt-3" to={`/course/${course.slug}/module/${module.position}`}>
                Back to module
              </Link>
            </div>
          ) : loading ? (
            <QuizSkeleton />
          ) : result ? (
            <div className="card p-6 sm:p-8">
              <p className="eyebrow">Attempt {result.attempt_number}</p>
              <h2
                id="attempt-heading"
                ref={verdict.targetRef}
                tabIndex={-1}
                className="mt-1 text-2xl font-bold text-dacfp-navy outline-none"
              >
                Attempt result
              </h2>
              <div
                className={`mt-5 rounded-xl border p-5 ${result.passed ? 'border-status-positive/30 bg-status-positive/5' : 'border-status-danger/30 bg-status-danger/5'}`}
              >
                <div className="flex items-center gap-3">
                  {result.passed ? (
                    <CheckCircle2 className="size-icon-lg text-status-positive" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-icon-lg text-status-danger" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-lg font-bold text-dacfp-navy">
                      {result.passed ? 'Passed' : 'Not passed yet'}
                    </p>
                    <p className="text-sm text-dacfp-gray-text">
                      Score{' '}
                      <strong className="tabular-nums text-dacfp-navy">
                        {result.score}/{result.possible_points}
                      </strong>
                    </p>
                  </div>
                </div>
                {!result.passed ? (
                  <p className="mt-4 text-sm leading-6 text-dacfp-gray-text">
                    Attempts are unlimited and there is no cooldown. Retake the quiz whenever you are ready.
                  </p>
                ) : null}
                {result.completion_fired ? (
                  <p className="mt-4 text-sm font-semibold text-status-positive">
                    All course requirements are complete.
                  </p>
                ) : null}
                {result.passed && nextModule ? (
                  <p className="mt-2 text-sm font-semibold text-status-positive">
                    Module {nextModule.position} unlocked. You can continue immediately.
                  </p>
                ) : null}
                {result.completion_fired && unlockedCourses.length > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-status-positive">
                    {unlockedCourses.map((item) => item.title).join(', ')} unlocked on your dashboard.
                  </p>
                ) : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => void startAttempt()} type="button">
                  <RotateCcw className="size-icon-sm" aria-hidden="true" /> Retake quiz
                </button>
                {result.passed && nextModule ? (
                  <Link className="button-primary" to={`/course/${course.slug}/module/${nextModule.position}`}>
                    Continue to module {nextModule.position}
                    <ArrowRight className="size-icon-sm" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : payload && questions.length > 0 ? (
            <form
              className="card overflow-hidden"
              onSubmit={(event) => {
                event.preventDefault();
                void gradeCurrentAttempt();
              }}
            >
              {/* brief #2: progress. Position is stated in text for everyone and
                  in the bar for glanceability, rather than the bar alone. */}
              <div className="border-b border-dacfp-line bg-dacfp-wash px-5 py-4 sm:px-8">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-bold text-dacfp-navy">
                    {onReview ? 'Review your answers' : `Question ${step + 1} of ${questions.length}`}
                  </p>
                  <p className="text-xs font-semibold tabular-nums text-dacfp-gray-text">
                    {answeredCount}/{questions.length} answered
                  </p>
                </div>
                <Progress
                  className="mt-3 h-1.5"
                  value={((onReview ? questions.length : step) / questions.length) * 100}
                  aria-label={`Quiz progress: ${answeredCount} of ${questions.length} answered`}
                />
              </div>

              {onReview ? (
                <div className="p-5 sm:p-8">
                  <h2 id="attempt-heading" className="text-2xl font-bold text-dacfp-navy">
                    Review your answers
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
                    Nothing is graded until you submit. Grading happens only on the secure server.
                  </p>
                  {unanswered.length > 0 ? (
                    <Alert tone="warning" className="mt-5">
                      {unanswered.length} question{unanswered.length === 1 ? '' : 's'} still unanswered.
                      You can submit anyway — unanswered questions simply score zero.
                    </Alert>
                  ) : null}
                  <ol className="mt-5 divide-y divide-dacfp-line rounded-lg border border-dacfp-line">
                    {questions.map((question, index) => {
                      const selected = answers[question.id] ?? [];
                      const chosen = question.choices.filter((choice) =>
                        selected.includes(choice.id),
                      );
                      return (
                        <li
                          key={question.id}
                          className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-dacfp-navy">
                              {index + 1}. {question.prompt}
                            </p>
                            {chosen.length > 0 ? (
                              <p className="mt-1 text-sm leading-6 text-dacfp-gray-text">
                                {chosen.map((choice) => choice.text).join(' · ')}
                              </p>
                            ) : (
                              <p className="mt-1 text-sm font-semibold text-dacfp-gold-text">
                                Not answered
                              </p>
                            )}
                          </div>
                          <button
                            className="button-quiet shrink-0 self-start px-3"
                            type="button"
                            onClick={() => setStep(index)}
                          >
                            Edit
                            <span className="sr-only"> question {index + 1}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : currentQuestion ? (
                <div className="p-5 sm:p-8">
                  <fieldset>
                    <legend className="text-xl font-bold leading-8 text-dacfp-navy sm:text-2xl">
                      <span className="sr-only">Question {step + 1} of {questions.length}: </span>
                      {currentQuestion.prompt}
                    </legend>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-eyebrow text-dacfp-gray-text">
                      {currentQuestion.select_kind === 'single'
                        ? 'Select one answer'
                        : 'Select all that apply'}
                    </p>
                    <div className="mt-5 grid gap-3">
                      {currentQuestion.choices.map((choice) => {
                        const checked = (answers[currentQuestion.id] ?? []).includes(choice.id);
                        return (
                          /* brief #5: full-row selection. The <label> wraps the
                             input, so the entire row is the hit target natively
                             — no click handler on a div, and the control keeps
                             browser radio semantics (arrow keys within the
                             fieldset). Control is 20px, the brief's floor. */
                          <label
                            key={choice.id}
                            className={`flex min-h-14 cursor-pointer items-start gap-3.5 rounded-lg border p-4 transition-colors ${
                              checked
                                ? 'border-dacfp-blue bg-dacfp-wash-blue ring-1 ring-dacfp-blue'
                                : 'border-dacfp-line hover:border-dacfp-blue/40 hover:bg-dacfp-wash'
                            }`}
                          >
                            <input
                              checked={checked}
                              className="mt-0.5 size-5 shrink-0 accent-dacfp-blue"
                              name={currentQuestion.id}
                              onChange={() =>
                                selectChoice(currentQuestion.id, choice.id, currentQuestion.select_kind)
                              }
                              type={currentQuestion.select_kind === 'single' ? 'radio' : 'checkbox'}
                              value={choice.id}
                            />
                            <span className="text-base leading-7 text-dacfp-navy">{choice.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              ) : null}

              {/* brief #5: sticky submit on mobile. The action bar is pinned to
                  the bottom of the viewport on a phone so Next/Submit is always
                  reachable without scrolling past four long choices. */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-dacfp-line bg-white/95 px-5 py-4 backdrop-blur supports-backdrop-filter:bg-white/80 sm:static sm:px-8">
                <button
                  className="button-quiet px-3 disabled:opacity-40"
                  type="button"
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  disabled={step === 0}
                >
                  <ArrowLeft className="size-icon-sm" aria-hidden="true" />
                  Back
                </button>

                {onReview ? (
                  <button className="button-primary" disabled={submitting} type="submit">
                    {submitting ? (
                      <LoaderCircle className="size-icon-sm animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="size-icon-sm" aria-hidden="true" />
                    )}
                    {submitting ? 'Grading securely…' : 'Submit attempt'}
                  </button>
                ) : (
                  <button
                    className="button-primary"
                    type="button"
                    onClick={() => setStep((current) => current + 1)}
                  >
                    {step === questions.length - 1 ? (
                      <>
                        Review answers
                        <ClipboardCheck className="size-icon-sm" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight className="size-icon-sm" aria-hidden="true" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="card p-6 sm:p-8">
              <button className="button-primary" onClick={() => void startAttempt()} type="button">
                Start quiz attempt
              </button>
            </div>
          )}

          {error ? (
            <Alert tone="danger" className="mt-5">
              {error}
              <button className="button-quiet mt-2" onClick={() => void startAttempt()} type="button">
                Retry
              </button>
            </Alert>
          ) : null}
        </section>

        <aside className="card h-fit p-5" aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-bold text-dacfp-navy">Attempt history</h2>
          {attempts.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-dacfp-gray-text">No attempts yet. There is no penalty or cooldown.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="rounded-lg border border-dacfp-line p-3">
                  <div className="flex items-center gap-2">
                    {attempt.passed ? <CheckCircle2 className="size-icon-md text-status-positive" aria-hidden="true" /> : <XCircle className="size-icon-md text-status-danger" aria-hidden="true" />}
                    <span className="font-bold text-dacfp-navy">Attempt {attempt.attempt_number}</span>
                  </div>
                  <p className="mt-2 text-sm text-dacfp-gray-text">
                    Score <strong className="tabular-nums text-dacfp-navy">{attempt.score}{possiblePoints === null ? '' : `/${possiblePoints}`}</strong> · {attempt.passed ? 'Passed' : 'Not passed'}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link className="button-quiet mt-4 w-full" to={`/course/${course.slug}/module/${module.position}`}>
            Back to module
          </Link>
        </aside>
      </div>
    </div>
  );
}
