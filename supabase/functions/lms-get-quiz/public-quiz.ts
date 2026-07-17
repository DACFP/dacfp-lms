interface PrivateQuizQuestion {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  choices: unknown;
  correct: unknown;
  points: number;
}

export function buildPublicQuestions(
  questions: PrivateQuizQuestion[],
  shuffle: <T>(input: T[]) => T[],
) {
  return shuffle(
    questions.map(({ correct, ...question }) => ({
      ...question,
      select_kind:
        Array.isArray(correct) && correct.length === 1 ? 'single' : 'multi',
      choices: shuffle(Array.isArray(question.choices) ? question.choices : []),
    })),
  );
}
