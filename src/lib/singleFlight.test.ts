import { describe, expect, it, vi } from "vitest";
import { runSingleFlight, type SingleFlightState } from "./singleFlight";

describe("single-flight async work", () => {
  it("shares an active operation and permits the next run after completion", async () => {
    let release!: (value: number) => void;
    const firstResult = new Promise<number>((resolve) => { release = resolve; });
    const operation = vi.fn(() => firstResult);
    const state: SingleFlightState<number> = { current: null };

    const first = runSingleFlight(state, operation);
    const overlapping = runSingleFlight(state, operation);
    expect(overlapping).toBe(first);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    release(7);
    await expect(first).resolves.toBe(7);
    await Promise.resolve();
    await expect(runSingleFlight(state, async () => 8)).resolves.toBe(8);
  });

  it("clears a rejected operation so a retry can run", async () => {
    const state: SingleFlightState<void> = { current: null };
    await expect(runSingleFlight(state, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await Promise.resolve();
    await expect(runSingleFlight(state, async () => undefined)).resolves.toBeUndefined();
  });
});
