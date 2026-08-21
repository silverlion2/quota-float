export interface SingleFlightState<T> {
  current: Promise<T> | null;
}

export function runSingleFlight<T>(state: SingleFlightState<T>, operation: () => Promise<T>): Promise<T> {
  if (state.current) return state.current;
  const task = Promise.resolve().then(operation);
  state.current = task;
  void task.finally(() => {
    if (state.current === task) state.current = null;
  }).catch(() => undefined);
  return task;
}
