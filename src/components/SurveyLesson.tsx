import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Alert } from './Alert';
import { Field } from './Field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  LmsSurveyQuestion,
  LmsSurveyResponse,
  LmsSurveySection,
  SurveyAnswer,
  SurveyAnswers,
  SurveyChoiceFreeText,
  SurveySubmission,
} from '../data/types';
import { buildSurveyPath, normalizeRoutedSubmission } from '../survey/routing';

function answerText(
  question: LmsSurveyQuestion,
  answer: SurveyAnswer | undefined,
  choiceFreeText: SurveyChoiceFreeText,
) {
  if (answer === undefined) return 'Not answered';
  if (question.kind === 'scale_1_5') return `${answer} of 5`;
  if (question.kind === 'text') return String(answer);
  const selected = Array.isArray(answer) ? answer : [answer];
  return selected
    .map((id) => {
      const label = question.choices?.find((choice) => choice.id === id)?.text ?? id;
      const detail = choiceFreeText[question.id]?.[id];
      return detail ? `${label}: ${detail}` : label;
    })
    .join(', ');
}

function sectionError(
  questions: LmsSurveyQuestion[],
  answers: SurveyAnswers,
  choiceFreeText: SurveyChoiceFreeText,
) {
  for (const question of questions) {
    const answer = answers[question.id];
    const missing = answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0);
    if (question.required && missing) return 'Complete every required question in this section.';
    const selected = typeof answer === 'string' ? [answer] : Array.isArray(answer) ? answer : [];
    for (const choice of question.choices ?? []) {
      if (
        choice.allow_free_text &&
        selected.includes(choice.id) &&
        !choiceFreeText[question.id]?.[choice.id]?.trim()
      ) {
        return 'Complete the detail for the selected option.';
      }
    }
  }
  return '';
}

export function SurveyLesson({
  sections,
  questions,
  response,
  onSubmit,
}: {
  sections: LmsSurveySection[];
  questions: LmsSurveyQuestion[];
  response: LmsSurveyResponse | null;
  onSubmit: (submission: SurveySubmission) => Promise<unknown>;
}) {
  const orderedSections = useMemo(
    () => [...sections].sort((left, right) => left.position - right.position),
    [sections],
  );
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [choiceFreeText, setChoiceFreeText] = useState<SurveyChoiceFreeText>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (response) {
    const sectionById = new Map(orderedSections.map((section) => [section.id, section]));
    return (
      <section className="card p-6 sm:p-8" aria-labelledby="survey-responses-heading">
        <div className="flex items-center gap-3 text-status-positive">
          <CheckCircle2 className="size-icon-lg" aria-hidden="true" />
          <p className="eyebrow">Survey submitted</p>
        </div>
        <h2 id="survey-responses-heading" className="mt-5 text-2xl font-bold text-dacfp-navy">
          Your responses
        </h2>
        <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
          Submitted responses are read-only. Only the sections you saw are shown.
        </p>
        <div className="mt-6 space-y-5">
          {response.path.map((sectionId, pathIndex) => {
            const section = sectionById.get(sectionId);
            if (!section) return null;
            const sectionQuestions = questions
              .filter((question) => question.section_id === sectionId)
              .sort((left, right) => left.position - right.position);
            return (
              <section key={sectionId} aria-label={`Submitted section ${pathIndex + 1}`}>
                <h3 className="text-sm font-bold uppercase tracking-wide text-dacfp-blue">
                  {section.title ?? `Section ${section.position}`}
                </h3>
                {sectionQuestions.length ? (
                  <dl className="mt-2 divide-y divide-dacfp-line rounded-lg border border-dacfp-line">
                    {sectionQuestions.map((question) => (
                      <div className="p-4" key={question.id}>
                        <dt className="text-sm font-bold text-dacfp-navy">{question.prompt}</dt>
                        <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dacfp-gray-text">
                          {answerText(question, response.answers[question.id], response.choice_free_text)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="mt-2 text-sm text-dacfp-gray-text">No questions in this routing section.</p>}
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  let path: string[] = [];
  try {
    path = buildSurveyPath(orderedSections, questions, answers);
  } catch {
    path = [];
  }
  const boundedIndex = Math.min(sectionIndex, Math.max(path.length - 1, 0));
  const sectionId = path[boundedIndex];
  const section = orderedSections.find((item) => item.id === sectionId);
  const sectionQuestions = questions
    .filter((question) => question.section_id === sectionId)
    .sort((left, right) => left.position - right.position);
  const finalSection = boundedIndex === path.length - 1;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = sectionError(sectionQuestions, answers, choiceFreeText);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!finalSection) {
      setError('');
      setSectionIndex(boundedIndex + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const normalized = normalizeRoutedSubmission(
        orderedSections,
        questions,
        answers,
        choiceFreeText,
      );
      await onSubmit(normalized);
    } catch {
      setError('Your survey could not be submitted. Review the required questions and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="survey-heading">
      <div className="flex items-center gap-3 text-dacfp-blue">
        <ClipboardList className="size-icon-lg" aria-hidden="true" />
        <p className="eyebrow">Course survey</p>
      </div>
      <h2 id="survey-heading" className="mt-5 text-2xl font-bold text-dacfp-navy">
        Share your feedback
      </h2>
      <p className="mt-2 text-sm leading-6 text-dacfp-gray-text">
        Submit once. Required questions apply only to the sections on your route.
      </p>
      {section ? (
        <form className="mt-7" onSubmit={(event) => void submit(event)}>
          <div className="flex items-end justify-between gap-4 border-b border-dacfp-line pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-dacfp-gray-text">
                Section {boundedIndex + 1} of {path.length}
              </p>
              <h3 className="mt-1 text-lg font-bold text-dacfp-navy">
                {section.title ?? `Section ${section.position}`}
              </h3>
            </div>
          </div>
          <div className="mt-6 space-y-7">
            {sectionQuestions.map((question) => {
              const label = `${question.position}. ${question.prompt}`;
              const required = question.required;
              if (question.kind === 'text') {
                return (
                  <Field key={question.id} label={label} hint={required ? 'Required' : 'Optional'}>
                    <Textarea
                      required={required}
                      value={typeof answers[question.id] === 'string' ? answers[question.id] as string : ''}
                      onChange={(event) => setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))}
                    />
                  </Field>
                );
              }

              if (question.kind === 'scale_1_5') {
                return (
                  <fieldset key={question.id}>
                    <legend className="text-sm font-bold text-dacfp-navy">
                      {label} {required ? <span className="text-status-danger">*</span> : null}
                    </legend>
                    <div className="mt-3 grid grid-cols-5 gap-2" aria-label="Rating from 1 to 5">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dacfp-line font-bold text-dacfp-navy has-[:checked]:border-dacfp-blue has-[:checked]:bg-dacfp-wash-blue" key={rating}>
                          <input
                            className="sr-only"
                            name={question.id}
                            required={required}
                            type="radio"
                            value={rating}
                            checked={answers[question.id] === rating}
                            onChange={() => setAnswers((current) => ({ ...current, [question.id]: rating }))}
                          />
                          {rating}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }

              const selected = Array.isArray(answers[question.id])
                ? answers[question.id] as string[]
                : [];
              return (
                <fieldset key={question.id}>
                  <legend className="text-sm font-bold text-dacfp-navy">
                    {label} {required ? <span className="text-status-danger">*</span> : null}
                  </legend>
                  <div className="mt-3 space-y-2">
                    {(question.choices ?? []).map((choice) => {
                      const checked = question.kind === 'single_choice'
                        ? answers[question.id] === choice.id
                        : selected.includes(choice.id);
                      return (
                        <div key={choice.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dacfp-line px-4 py-2 text-sm font-semibold text-dacfp-navy has-[:checked]:border-dacfp-blue has-[:checked]:bg-dacfp-wash-blue">
                            <input
                              className="size-4 accent-dacfp-blue"
                              name={question.id}
                              required={required && question.kind === 'single_choice'}
                              type={question.kind === 'single_choice' ? 'radio' : 'checkbox'}
                              checked={checked}
                              onChange={(event) => {
                                setError('');
                                setAnswers((current) => {
                                  if (question.kind === 'single_choice') {
                                    return { ...current, [question.id]: choice.id };
                                  }
                                  const currentValues = Array.isArray(current[question.id])
                                    ? current[question.id] as string[]
                                    : [];
                                  return {
                                    ...current,
                                    [question.id]: event.target.checked
                                      ? [...currentValues, choice.id]
                                      : currentValues.filter((id) => id !== choice.id),
                                  };
                                });
                                setSectionIndex((current) => Math.min(current, boundedIndex));
                              }}
                            />
                            {choice.text}
                          </label>
                          {choice.allow_free_text && checked ? (
                            <Field className="ml-7 mt-2" label={`${choice.text} detail`} hint="Required when selected">
                              <Input
                                required
                                value={choiceFreeText[question.id]?.[choice.id] ?? ''}
                                onChange={(event) => setChoiceFreeText((current) => ({
                                  ...current,
                                  [question.id]: {
                                    ...current[question.id],
                                    [choice.id]: event.target.value,
                                  },
                                }))}
                              />
                            </Field>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>

          {error ? <div className="mt-5"><Alert tone="danger">{error}</Alert></div> : null}
          <div className="mt-7 flex flex-wrap justify-between gap-3">
            <button
              className="button-secondary"
              disabled={boundedIndex === 0 || submitting}
              onClick={() => { setError(''); setSectionIndex(Math.max(0, boundedIndex - 1)); }}
              type="button"
            >
              <ArrowLeft className="size-icon-sm" aria-hidden="true" />Back
            </button>
            <button className="button-primary" disabled={submitting} type="submit">
              {finalSection ? <CheckCircle2 className="size-icon-sm" aria-hidden="true" /> : <ArrowRight className="size-icon-sm" aria-hidden="true" />}
              {submitting ? 'Submitting…' : finalSection ? 'Submit survey' : 'Continue'}
            </button>
          </div>
        </form>
      ) : <Alert tone="danger">Survey sections are unavailable.</Alert>}
    </section>
  );
}
