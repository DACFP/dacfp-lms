import { CheckCircle2, ClipboardList } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert } from './Alert';
import { Field } from './Field';
import { Textarea } from '@/components/ui/textarea';
import type {
  LmsSurveyQuestion,
  LmsSurveyResponse,
  SurveyAnswer,
  SurveyAnswers,
} from '../data/types';

function answerText(question: LmsSurveyQuestion, answer: SurveyAnswer | undefined) {
  if (answer === undefined) return 'Not answered';
  if (question.kind === 'scale_1_5') return `${answer} of 5`;
  if (question.kind === 'text') return String(answer);
  const selected = Array.isArray(answer) ? answer : [answer];
  return selected
    .map((id) => question.choices?.find((choice) => choice.id === id)?.text ?? id)
    .join(', ');
}

export function SurveyLesson({
  questions,
  response,
  onSubmit,
}: {
  questions: LmsSurveyQuestion[];
  response: LmsSurveyResponse | null;
  onSubmit: (answers: SurveyAnswers) => Promise<unknown>;
}) {
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (response) {
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
          Submitted responses are read-only and cannot be changed.
        </p>
        <dl className="mt-6 divide-y divide-dacfp-line rounded-lg border border-dacfp-line">
          {questions.map((question) => (
            <div className="p-4" key={question.id}>
              <dt className="text-sm font-bold text-dacfp-navy">{question.prompt}</dt>
              <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dacfp-gray-text">
                {answerText(question, response.answers[question.id])}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(answers);
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
        Submit once. This survey does not gate the module quiz, but a required survey must be submitted to finish the course.
      </p>
      <form className="mt-7 space-y-7" onSubmit={(event) => void submit(event)}>
        {questions.map((question) => {
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
                {(question.choices ?? []).map((choice) => (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dacfp-line px-4 py-2 text-sm font-semibold text-dacfp-navy has-[:checked]:border-dacfp-blue has-[:checked]:bg-dacfp-wash-blue" key={choice.id}>
                    <input
                      className="size-4 accent-dacfp-blue"
                      name={question.id}
                      required={required && question.kind === 'single_choice'}
                      type={question.kind === 'single_choice' ? 'radio' : 'checkbox'}
                      checked={question.kind === 'single_choice'
                        ? answers[question.id] === choice.id
                        : selected.includes(choice.id)}
                      onChange={(event) => setAnswers((current) => {
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
                      })}
                    />
                    {choice.text}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        <button className="button-primary" disabled={submitting || questions.length === 0} type="submit">
          <CheckCircle2 className="size-icon-sm" aria-hidden="true" />
          {submitting ? 'Submitting…' : 'Submit survey'}
        </button>
      </form>
    </section>
  );
}
