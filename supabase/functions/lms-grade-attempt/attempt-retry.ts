// SOURCE OF TRUTH: src/engine/attempt-retry.ts.

import { nextAttemptNumber } from './progression.ts';
import type { LmsQuizAttempt } from './progression-types.ts';

export interface AttemptInsertError {
  code?: string;
  message?: string;
}

export interface AttemptInsertResult<T> {
  data: T | null;
  error: AttemptInsertError | null;
}

export async function insertWithAttemptNumberRetry<T>(
  quizId: string,
  initialAttempts: LmsQuizAttempt[],
  insert: (attemptNumber: number) => Promise<AttemptInsertResult<T>>,
  refresh: () => Promise<LmsQuizAttempt[]>,
  maxTries = 4,
): Promise<T> {
  let attempts = initialAttempts;
  for (let retry = 0; retry < maxTries; retry += 1) {
    const attemptNumber = nextAttemptNumber(quizId, attempts);
    const result = await insert(attemptNumber);
    if (!result.error && result.data) return result.data;
    if (result.error?.code !== '23505') {
      throw result.error ?? new Error('Attempt insert returned no row.');
    }
    attempts = await refresh();
  }
  throw new Error('Unable to allocate an attempt number.');
}
