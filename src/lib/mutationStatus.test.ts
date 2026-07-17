import { describe, expect, it, vi } from 'vitest';
import { runMutationLifecycle } from './mutationStatus';

describe('runMutationLifecycle', () => {
  it('reports a mutation failure and does not run refresh', async () => {
    const failure = new Error('write failed');
    const refresh = vi.fn();
    const onMutationFailure = vi.fn();

    await expect(runMutationLifecycle({
      mutate: async () => { throw failure; },
      refresh,
      onMutationFailure,
    })).rejects.toBe(failure);

    expect(onMutationFailure).toHaveBeenCalledWith(failure);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns a confirmed mutation result when only refresh fails', async () => {
    const refreshFailure = new Error('refresh failed');
    const onMutationSuccess = vi.fn();
    const onRefreshFailure = vi.fn();

    await expect(runMutationLifecycle({
      mutate: async () => ({ id: 'confirmed' }),
      refresh: async () => { throw refreshFailure; },
      onMutationSuccess,
      onRefreshFailure,
    })).resolves.toEqual({ id: 'confirmed' });

    expect(onMutationSuccess).toHaveBeenCalledWith({ id: 'confirmed' });
    expect(onRefreshFailure).toHaveBeenCalledWith(
      refreshFailure,
      { id: 'confirmed' },
    );
  });
});
