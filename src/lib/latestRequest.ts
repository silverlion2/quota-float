export interface LatestRequestState {
  sequence: number;
}

export function requestLatest<T>(
  state: LatestRequestState,
  load: () => Promise<T>,
  commit: (value: T) => void,
): void {
  const sequence = ++state.sequence;
  void load().then((value) => {
    if (state.sequence === sequence) commit(value);
  }).catch(() => undefined);
}
