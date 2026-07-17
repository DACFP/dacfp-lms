import {
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '../components/Alert';
import { IconTile } from '../components/IconTile';
import { LockedBadge } from '../components/LockedBadge';
import { EmptyState, PageHeader, StatusPill, learnerPath } from '../components/common';
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
  const {
    catalog,
    snapshot,
    selectedLearner,
    loadQuiz,
    submitQuiz,
  } = useLms();
  const [payload, setPayload] = useState<LmsQuizPayload | null>(null);
  const [answers, setAnswers] = useState<LmsQuizAnswers>({});
  const [result, setResult] = useState<LmsQuizGradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const module = catalog.modules.find((item) => item.id === moduleId);
  const course = catalog.courses.find((item) => item.id === module?.course_id);
  const quiz = catalog.quizzes.find((item) => item.module_id === module?.id);
  const enrollment = course
    ? enrollmentForCourse(snapshot, course.id)
    : null;
  const attempts = useMemo(
    () =>
      enrollment && quiz
        ? snapshot.attempts
            .filter(
              (attempt) =>
                attempt.enrollment_id === enrollment.id &&
                attempt.quiz_id === quiz.id,
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
    try {
      setPayload(await loadQuiz(quiz.id));
    } catch {
      setPayload(null);
      setError('Unable to load this quiz. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [loadQuiz, quiz]);

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
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
      />
    );
  }

  if (!enrollment) {
    return (
      <EmptyState
        title="No course access"
        description="This account is not enrolled in the course that contains this quiz."
        action={<Link className="button-secondary" to={learnerPath('/dashboard', selectedLearner)}>Back to dashboard</Link>}
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
      setResult(await submitQuiz(payload.quiz.id, answers));
    } catch {
      setError('Quiz submission failed. Your selections remain on this page so you can try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const nextModule = catalog.modules.find(
    (item) =>
      item.course_id === course.id && item.position === module.position + 1,
  );
  const unlockedCourses = catalog.courses.filter(
    (item) => item.prerequisite_course_id === course.id,
  );
  const possiblePoints = payload
    ? payload.questions.reduce((total, question) => total + question.points, 0)
    : null;

  return (
    <div className="space-y-8">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card p-6 sm:p-8" aria-labelledby="attempt-heading">
          <IconTile icon={ShieldCheck} size="lg" tone="brand" />
          <p className="eyebrow mt-6">Attempt {result?.attempt_number ?? nextNumber}</p>
          <h2 id="attempt-heading" className="mt-1 text-2xl font-bold text-dacfp-navy">
            {result ? 'Attempt result' : 'Knowledge check'}
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-dacfp-gray-text">
            Questions are delivered in a new shuffled order for each attempt. Grading happens only on the secure server.
          </p>

          {!accessible ? (
            <div className="mt-7 rounded-lg border border-dacfp-line bg-dacfp-wash p-4 text-sm leading-6 text-dacfp-gray-text">
              <p className="flex items-center gap-2 font-bold text-dacfp-navy">
                <LockKeyhole className="size-icon-sm" aria-hidden="true" /> Quiz unavailable
              </p>
              <p className="mt-1">
                {accessState === 'expired'
                  ? 'Course access has expired. Designation standing is governed separately.'
                  : accessState === 'revoked'
                    ? 'Course access is unavailable. Return to the dashboard or contact DACFP support.'
                    : 'Complete all required lessons and any prior module before starting this quiz.'}
              </p>
              <Link className="button-quiet mt-2" to={learnerPath(`/course/${course.slug}/module/${module.position}`, selectedLearner)}>
                Back to module
              </Link>
            </div>
          ) : loading ? (
            <p className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-dacfp-gray-text" role="status">
              <LoaderCircle className="animate-spin size-icon-md" aria-hidden="true" /> Loading shuffled questions…
            </p>
          ) : result ? (
            <div className="mt-7 space-y-5">
              <div className={`rounded-xl border p-5 ${result.passed ? 'border-status-positive/30 bg-status-positive/5' : 'border-status-danger/30 bg-status-danger/5'}`}>
                <div className="flex items-center gap-3">
                  {result.passed ? (
                    <CheckCircle2 className="text-status-positive size-icon-lg" aria-hidden="true" />
                  ) : (
                    <XCircle className="text-status-danger size-icon-lg" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-bold text-dacfp-navy">
                      {result.passed ? 'Passed' : 'Not passed yet'}
                    </p>
                    <p className="text-sm text-dacfp-gray-text">
                      Score <strong className="tabular-nums text-dacfp-navy">{result.score}/{result.possible_points}</strong>
                    </p>
                  </div>
                </div>
                {result.completion_fired ? (
                  <p className="mt-4 text-sm font-semibold text-status-positive">
                    All course requirements are complete.
                  </p>
                ) : null}
                {result.passed && nextModule ? (
                  <p className="mt-2 text-sm font-semibold text-status-positive" role="status">
                    Module {nextModule.position} unlocked. You can continue immediately.
                  </p>
                ) : null}
                {result.completion_fired && unlockedCourses.length > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-status-positive" role="status">
                    {unlockedCourses.map((item) => item.title).join(', ')} unlocked on your dashboard.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => void startAttempt()} type="button">
                  <RotateCcw className="size-icon-sm" aria-hidden="true" /> Retake quiz
                </button>
                {result.passed && nextModule ? (
                  <Link className="button-primary" to={learnerPath(`/course/${course.slug}/module/${nextModule.position}`, selectedLearner)}>
                    Continue to module {nextModule.position}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : payload ? (
            <form
              className="mt-7 space-y-7"
              onSubmit={(event) => {
                event.preventDefault();
                void gradeCurrentAttempt();
              }}
            >
              {payload.questions.map((question, questionIndex) => (
                <fieldset className="rounded-xl border border-dacfp-line p-5" key={question.id}>
                  <legend className="px-1 font-bold leading-6 text-dacfp-navy">
                    {questionIndex + 1}. {question.prompt}
                  </legend>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-eyebrow text-dacfp-gray-text">
                    {question.select_kind === 'single' ? 'Select one answer' : 'Select all that apply'}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {question.choices.map((choice) => (
                      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-dacfp-line px-4 py-3 hover:bg-dacfp-wash-blue" key={choice.id}>
                        <input
                          checked={(answers[question.id] ?? []).includes(choice.id)}
                          className="mt-1 size-4 accent-dacfp-blue"
                          name={question.id}
                          onChange={() => selectChoice(question.id, choice.id, question.select_kind)}
                          type={question.select_kind === 'single' ? 'radio' : 'checkbox'}
                          value={choice.id}
                        />
                        <span className="text-sm leading-6 text-dacfp-navy">{choice.text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button className="button-primary" disabled={submitting} type="submit">
                {submitting ? (
                  <LoaderCircle className="animate-spin size-icon-sm" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="size-icon-sm" aria-hidden="true" />
                )}
                {submitting ? 'Grading securely…' : 'Submit attempt'}
              </button>
            </form>
          ) : (
            <button className="button-primary mt-7" onClick={() => void startAttempt()} type="button">
              Start quiz attempt
            </button>
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
                    {attempt.passed ? <CheckCircle2 className="text-status-positive size-icon-md" aria-hidden="true" /> : <XCircle className="text-status-danger size-icon-md" aria-hidden="true" />}
                    <span className="font-bold text-dacfp-navy">Attempt {attempt.attempt_number}</span>
                  </div>
                  <p className="mt-2 text-sm text-dacfp-gray-text">
                    Score <strong className="tabular-nums text-dacfp-navy">{attempt.score}{possiblePoints === null ? '' : `/${possiblePoints}`}</strong> · {attempt.passed ? 'Passed' : 'Not passed'}
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
