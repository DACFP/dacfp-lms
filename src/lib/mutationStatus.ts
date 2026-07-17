export interface MutationLifecycleOptions<T> {
  mutate: () => Promise<T>;
  refresh?: (result: T) => Promise<void>;
  onMutationSuccess?: (result: T) => void;
  onMutationFailure?: (error: unknown) => void;
  onRefreshFailure?: (error: unknown, result: T) => void;
}

/**
 * Keeps a confirmed mutation separate from the best-effort read refresh that
 * follows it. Refresh failure must not relabel a successful write as failed.
 */
export async function runMutationLifecycle<T>({
  mutate,
  refresh,
  onMutationSuccess,
  onMutationFailure,
  onRefreshFailure,
}: MutationLifecycleOptions<T>): Promise<T> {
  let result: T;

  try {
    result = await mutate();
  } catch (error) {
    onMutationFailure?.(error);
    throw error;
  }

  onMutationSuccess?.(result);

  if (refresh) {
    try {
      await refresh(result);
    } catch (error) {
      onRefreshFailure?.(error, result);
    }
  }

  return result;
}
