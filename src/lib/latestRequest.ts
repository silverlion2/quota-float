export interface LatestRequestState {
  sequence: number;
}

export function requestLatest<T>(
  state: LatestRequestState,
  load: () => Promise<T>,
  commit: (value: T) => void,
  onError?: (error: unknown) => void,
  onSettled?: () => void,
): void {
  const sequence = ++state.sequence;
  // Start on a microtask so synchronous loader exceptions follow the same
  // stale-result and error path as rejected promises.
  void Promise.resolve()
    .then(load)
    .then((value) => {
      if (state.sequence === sequence) commit(value);
    })
    .catch((error: unknown) => {
      if (state.sequence === sequence) onError?.(error);
    })
    .finally(() => {
      if (state.sequence === sequence) onSettled?.();
    });
}
