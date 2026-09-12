import { describe, expect, it, vi } from "vitest";
import { requestLatest } from "./latestRequest";

describe("latest async request", () => {
  it("lets a slow forecast finish independently without overwriting a newer result", async () => {
    let finishSlow: (value: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => { finishSlow = resolve; });
    const committed = vi.fn();
    const state = { sequence: 0 };

    requestLatest(state, () => slow, committed);
    requestLatest(state, async () => "new forecast", committed);
    await vi.waitFor(() => expect(committed).toHaveBeenCalledWith("new forecast"));
    finishSlow("old forecast");
    await slow;
    await Promise.resolve();

    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalledWith("old forecast");
  });

  it("only reports errors and settlement for the latest request", async () => {
    let rejectSlow: (reason?: unknown) => void = () => undefined;
    const slow = new Promise<string>((_resolve, reject) => { rejectSlow = reject; });
    const errors = vi.fn();
    const settled = vi.fn();
    const state = { sequence: 0 };

    requestLatest(state, () => slow, vi.fn(), errors, settled);
    requestLatest(state, async () => "latest", vi.fn(), errors, settled);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce());

    rejectSlow(new Error("stale failure"));
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledOnce();
  });

  it("routes synchronous loader failures through the latest error callback", async () => {
    const error = new Error("offline");
    const errors = vi.fn();
    const settled = vi.fn();

    requestLatest({ sequence: 0 }, () => { throw error; }, vi.fn(), errors, settled);

    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(error));
    expect(settled).toHaveBeenCalledOnce();
  });
});
