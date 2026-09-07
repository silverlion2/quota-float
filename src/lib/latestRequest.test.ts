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
});
