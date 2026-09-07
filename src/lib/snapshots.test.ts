import { describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../types";
import { finalizeSnapshotProgress, mergeSnapshotProgress, mergeSnapshots } from "./snapshots";

const success: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: null,
  weeklyWindow: { remainingPercent: 42, resetsAt: "2026-07-10T00:00:00Z", windowSeconds: 604_800 },
  resetCredits: 1,
  updatedAt: "2026-07-07T00:00:00Z",
  status: "ok",
  message: null,
};

describe("snapshot failure handling", () => {
  it("retains the last successful values during a transient failure", () => {
    const failure: ProviderSnapshot = { ...success, shortWindow: null, weeklyWindow: null, status: "unavailable", message: "Network unavailable", updatedAt: "2026-07-07T01:00:00Z" };
    expect(mergeSnapshots([success], [failure])[0]).toEqual({ ...success, status: "stale", message: "Network unavailable" });
  });

  it("shows a failure when no successful snapshot exists", () => {
    const signedOut: ProviderSnapshot = { ...success, shortWindow: null, weeklyWindow: null, status: "signed_out", message: "Please sign in" };
    expect(mergeSnapshots([], [signedOut])[0].status).toBe("signed_out");
  });

  it("does not hide an expired login behind stale quota data", () => {
    const signedOut: ProviderSnapshot = { ...success, shortWindow: null, weeklyWindow: null, status: "signed_out", message: "Please sign in" };
    expect(mergeSnapshots([success], [signedOut])[0].status).toBe("signed_out");
  });

  it("replaces stale data after recovery", () => {
    expect(mergeSnapshots([{ ...success, status: "stale" }], [{ ...success, weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 88 } }])[0].weeklyWindow?.remainingPercent).toBe(88);
  });

  it("preserves providers outside a targeted refresh and removes a refreshed provider that is no longer detected", () => {
    const qoder = { ...success, provider: "qoder" as const, displayName: "QODER" };
    expect(mergeSnapshots([success, qoder], [{ ...success, weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 88 } }], ["codex"]))
      .toEqual([qoder, expect.objectContaining({ provider: "codex", weeklyWindow: expect.objectContaining({ remainingPercent: 88 }) })]);
    expect(mergeSnapshots([success, qoder], [], ["qoder"])).toEqual([success]);
  });

  it("shows a fast provider before the remaining request completes without changing the baseline", () => {
    const qoder = { ...success, provider: "qoder" as const, displayName: "QODER", weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 50 } };
    const baseline = [success, qoder];
    const state = { requestId: "refresh-1", receivedProviders: new Set<ProviderSnapshot["provider"]>(), finalized: false };
    const nextQoder = { ...qoder, weeklyWindow: { ...qoder.weeklyWindow!, remainingPercent: 40 } };

    const progressive = mergeSnapshotProgress(state, "refresh-1", baseline, {
      requestId: "refresh-1",
      requestedProviderIds: ["codex", "qoder"],
      providerId: "qoder",
      snapshots: [nextQoder],
    });

    expect(progressive?.find((item) => item.provider === "qoder")?.weeklyWindow?.remainingPercent).toBe(40);
    expect(progressive?.find((item) => item.provider === "codex")?.weeklyWindow?.remainingPercent).toBe(42);
    expect(baseline[1].weeklyWindow?.remainingPercent).toBe(50);
  });

  it("ignores duplicate provider progress and late request events", () => {
    const state = { requestId: "refresh-current", receivedProviders: new Set<ProviderSnapshot["provider"]>(), finalized: false };
    const event = {
      requestId: "refresh-current",
      requestedProviderIds: ["codex" as const],
      providerId: "codex" as const,
      snapshots: [{ ...success, weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 38 } }],
    };

    expect(mergeSnapshotProgress(state, "refresh-current", [success], event)).not.toBeNull();
    expect(mergeSnapshotProgress(state, "refresh-current", [success], event)).toBeNull();
    expect(mergeSnapshotProgress({ requestId: "refresh-old", receivedProviders: new Set(), finalized: false }, "refresh-current", [success], { ...event, requestId: "refresh-old" })).toBeNull();
  });

  it("opens the final history and notification phase only once for the current request", () => {
    const state = { requestId: "refresh-current", receivedProviders: new Set<ProviderSnapshot["provider"]>(), finalized: false };

    expect(finalizeSnapshotProgress(state, "refresh-current")).toBe(true);
    expect(finalizeSnapshotProgress(state, "refresh-current")).toBe(false);
    expect(finalizeSnapshotProgress({ ...state, requestId: "refresh-old", finalized: false }, "refresh-current")).toBe(false);
  });

  it("ignores progress that arrives after the current request is finalized", () => {
    const state = { requestId: "refresh-current", receivedProviders: new Set<ProviderSnapshot["provider"]>(), finalized: false };
    expect(finalizeSnapshotProgress(state, "refresh-current")).toBe(true);

    expect(mergeSnapshotProgress(state, "refresh-current", [success], {
      requestId: "refresh-current",
      requestedProviderIds: ["codex"],
      providerId: "codex",
      snapshots: [{ ...success, weeklyWindow: { ...success.weeklyWindow!, remainingPercent: 10 } }],
    })).toBeNull();
    expect(state.receivedProviders).toEqual(new Set());
  });
});
