// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  openUrl: vi.fn(),
  relaunch: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  close: vi.fn(),
}));

vi.mock("./bridge", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

const fakeUpdate = {
  version: "0.2.0",
  body: "A calmer update flow.",
  date: "2026-07-18T00:00:00Z",
  download: mocks.download,
  install: mocks.install,
  close: mocks.close,
};

beforeEach(async () => {
  const { discardAppUpdate } = await import("./appUpdate");
  await discardAppUpdate();
  vi.clearAllMocks();
  mocks.check.mockResolvedValue(fakeUpdate);
});

describe("app updater", () => {
  it("returns release metadata without prompting", async () => {
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).resolves.toEqual({
      version: "0.2.0",
      body: "A calmer update flow.",
      date: "2026-07-18T00:00:00Z",
      platform: "windows",
    });
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 15_000 });
  });

  it("reports deterministic background download progress", async () => {
    mocks.download.mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 35 } });
      onEvent({ event: "Progress", data: { chunkLength: 65 } });
      onEvent({ event: "Finished" });
    });
    const { checkForAppUpdate, downloadAppUpdate } = await import("./appUpdate");
    await checkForAppUpdate();
    const progress = vi.fn();
    await downloadAppUpdate(progress);
    expect(progress).toHaveBeenLastCalledWith({ downloadedBytes: 100, totalBytes: 100, percent: 100 });
  });

  it("installs a downloaded update and relaunches", async () => {
    const { checkForAppUpdate, installAppUpdate } = await import("./appUpdate");
    await checkForAppUpdate();
    await installAppUpdate();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });

  it("releases updater resources when a version is skipped", async () => {
    const { checkForAppUpdate, discardAppUpdate, getPendingAppUpdate } = await import("./appUpdate");
    await checkForAppUpdate();
    await discardAppUpdate();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(getPendingAppUpdate()).toBeNull();
  });
});
