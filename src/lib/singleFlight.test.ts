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

  it("queues one stronger request behind weaker work already in flight", async () => {
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const state: SingleFlightState<void> = { current: null };
    const automatic = runSingleFlight(state, async () => {
      calls.push("automatic");
      await active;
    }, false);
    await Promise.resolve();
    const manual = runSingleFlight(state, async () => {
      calls.push("manual");
    }, true);

    expect(manual).not.toBe(automatic);
    release();
    await Promise.all([automatic, manual]);
    expect(calls).toEqual(["automatic", "manual"]);
  });

  it("coalesces repeated urgent requests when urgent work is already active or queued", async () => {
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    let releaseUrgent!: () => void;
    const urgentActive = new Promise<void>((resolve) => { releaseUrgent = resolve; });
    let urgentCalls = 0;
    const state: SingleFlightState<void> = { current: null };
    const automatic = runSingleFlight(state, () => active);
    await Promise.resolve();
    const firstUrgent = runSingleFlight(state, async () => {
      urgentCalls += 1;
      await urgentActive;
    }, true);
    const duplicateQueued = runSingleFlight(state, async () => { urgentCalls += 1; }, true);

    expect(duplicateQueued).toBe(firstUrgent);
    release();
    await automatic;
    await vi.waitFor(() => expect(urgentCalls).toBe(1));
    const duplicateActive = runSingleFlight(state, async () => { urgentCalls += 1; }, true);
    releaseUrgent();
    await Promise.all([firstUrgent, duplicateActive]);
    expect(urgentCalls).toBe(1);
  });
});
