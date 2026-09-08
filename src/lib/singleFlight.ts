export interface SingleFlightState<T> {
  current: Promise<T> | null;
  currentUrgent?: boolean;
  queuedUrgent?: Promise<T> | null;
}

export function runSingleFlight<T>(
  state: SingleFlightState<T>,
  operation: () => Promise<T>,
  urgent = false,
): Promise<T> {
  if (state.current) {
    if (!urgent || state.currentUrgent) return state.current;
    if (state.queuedUrgent) return state.queuedUrgent;

    const active = state.current;
    let queued!: Promise<T>;
    queued = active
      .catch(() => undefined)
      .then(() => {
        if (state.queuedUrgent === queued) state.queuedUrgent = null;
        return runSingleFlight(state, operation, true);
      });
    state.queuedUrgent = queued;
    return queued;
  }
  const task = Promise.resolve().then(operation);
  state.current = task;
  state.currentUrgent = urgent;
  void task.finally(() => {
    if (state.current === task) {
      state.current = null;
      state.currentUrgent = false;
    }
  }).catch(() => undefined);
  return task;
}
