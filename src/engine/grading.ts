// SOURCE OF TRUTH: src/engine/grading.ts.

export interface GradingQuestion {
  id: string;
  correct: unknown;
  choices: unknown;
  points: number;
}

export class InvalidQuizSubmission extends Error {}

function choiceIds(question: GradingQuestion) {
  if (!Array.isArray(question.choices)) throw new InvalidQuizSubmission();
  return new Set(
    question.choices.flatMap((choice) =>
      choice &&
      typeof choice === 'object' &&
      typeof (choice as { id?: unknown }).id === 'string'
        ? [(choice as { id: string }).id]
        : [],
    ),
  );
}

export function normalizeAnswers(
  raw: unknown,
  questions: GradingQuestion[],
): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidQuizSubmission();
  }
  const input = raw as Record<string, unknown>;
  const questionIds = new Set(questions.map((question) => question.id));
  if (Object.keys(input).some((questionId) => !questionIds.has(questionId))) {
    throw new InvalidQuizSubmission();
  }

  return Object.fromEntries(
    questions.map((question) => {
      const submitted = input[question.id] ?? [];
      if (
        !Array.isArray(submitted) ||
        submitted.some((choiceId) => typeof choiceId !== 'string')
      ) {
        throw new InvalidQuizSubmission();
      }
      const values = submitted as string[];
      if (new Set(values).size !== values.length) {
        throw new InvalidQuizSubmission();
      }
      const allowedChoices = choiceIds(question);
      const normalized = [...values].sort();
      if (normalized.some((choiceId) => !allowedChoices.has(choiceId))) {
        throw new InvalidQuizSubmission();
      }
      return [question.id, normalized];
    }),
  );
}

export function exactSetMatch(submitted: string[], expected: unknown) {
  if (!Array.isArray(expected) || expected.some((item) => typeof item !== 'string')) {
    throw new Error('Quiz answer key is invalid.');
  }
  const normalizedExpected = [...new Set(expected as string[])].sort();
  return (
    submitted.length === normalizedExpected.length &&
    submitted.every((choiceId, index) => choiceId === normalizedExpected[index])
  );
}

export function scoreAnswers(
  answers: Record<string, string[]>,
  questions: GradingQuestion[],
) {
  return questions.reduce(
    (result, question) => ({
      score:
        result.score +
        (exactSetMatch(answers[question.id], question.correct)
          ? question.points
          : 0),
      possiblePoints: result.possiblePoints + question.points,
    }),
    { score: 0, possiblePoints: 0 },
  );
}
