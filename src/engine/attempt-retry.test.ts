import { describe, expect, it, vi } from 'vitest';
import { insertWithAttemptNumberRetry } from './attempt-retry';
import type { LmsQuizAttempt } from './progression-types';

const attempt = (attemptNumber: number): LmsQuizAttempt => ({
  quiz_id: 'quiz-1',
  attempt_number: attemptNumber,
  passed: false,
});

describe('attempt-number retry', () => {
  it('refreshes and retries after a 23505 collision', async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({ data: { attempt_number: 3 }, error: null });
    const refresh = vi.fn().mockResolvedValue([attempt(1), attempt(2)]);

    await expect(
      insertWithAttemptNumberRetry('quiz-1', [attempt(1)], insert, refresh),
    ).resolves.toEqual({ attempt_number: 3 });
    expect(insert).toHaveBeenNthCalledWith(1, 2);
    expect(insert).toHaveBeenNthCalledWith(2, 3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-unique failure', async () => {
    const error = { code: '42501', message: 'denied' };
    const insert = vi.fn().mockResolvedValue({ data: null, error });
    const refresh = vi.fn();

    await expect(
      insertWithAttemptNumberRetry('quiz-1', [], insert, refresh),
    ).rejects.toEqual(error);
    expect(refresh).not.toHaveBeenCalled();
  });
});
