// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  openUrl: vi.fn(),
  relaunch: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  close: vi.fn(),
  getVersion: vi.fn(async () => "0.1.9"),
}));

vi.mock("./bridge", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));

function betaRelease(version: string, platform: "windows" | "macos" = "windows") {
  const tag = `v${version}`;
  const name = `Quota.Float_${version}_${platform === "macos" ? "universal.dmg" : "x64-setup.exe"}`;
  return {
    prerelease: true, draft: false, tag_name: tag,
    html_url: `https://github.com/silverlion2/quota-float/releases/tag/${tag}`,
    assets: [{ name, state: "uploaded", size: 100, browser_download_url: `https://github.com/silverlion2/quota-float/releases/download/${tag}/${name}` }],
  };
}

function useMac() {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
}

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
  mocks.getVersion.mockResolvedValue("0.1.9");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("app updater", () => {
  it("opens all releases as the fallback rather than the legacy shared latest", async () => {
    const { openReleasePage } = await import("./appUpdate");
    await openReleasePage();
    expect(mocks.openUrl).toHaveBeenCalledWith("https://github.com/silverlion2/quota-float/releases");
  });

  it("uses the independent native platform feed without a shared latest fallback", async () => {
    const config = await import("../../src-tauri/tauri.conf.json");
    expect(config.plugins.updater.endpoints).toEqual([
      "https://raw.githubusercontent.com/silverlion2/quota-float/update-channels/stable/{{target}}.json",
    ]);
  });

  it("keeps macOS updates manual and links the exact older platform release", async () => {
    useMac();
    mocks.check.mockResolvedValue({ ...fakeUpdate, version: "0.3.37" });
    const { checkForAppUpdate, downloadAppUpdate, installAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).resolves.toMatchObject({
      version: "0.3.37", platform: "macos", automaticInstall: false,
      releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/v0.3.37",
    });
    await expect(downloadAppUpdate(vi.fn())).rejects.toThrow("macOS");
    await expect(installAppUpdate()).rejects.toThrow("macOS");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.test/releases/tag/v0.2.0",
    "https://github.com/silverlion2/quota-float/releases/latest",
    "https://github.com/silverlion2/quota-float/releases/tag/v9.0.0",
    "https://github.com/silverlion2/quota-float/releases/tag/v0.2.0?redirect=evil",
    "https://github.com/silverlion2/quota-float/releases/tag/windows-v0.2.0#redirect",
  ])("derives the exact release when manifest release_url is unsafe or mismatched: %s", async (release_url) => {
    mocks.check.mockResolvedValue({ ...fakeUpdate, rawJson: { release_url } });
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).resolves.toMatchObject({ releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/v0.2.0" });
  });

  it("accepts an exact Windows bootstrap tag only on Windows", async () => {
    mocks.check.mockResolvedValue({ ...fakeUpdate, rawJson: { release_url: "https://github.com/silverlion2/quota-float/releases/tag/windows-v0.2.0" } });
    const { checkForAppUpdate, discardAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).resolves.toMatchObject({ releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/windows-v0.2.0" });
    await discardAppUpdate();
    useMac();
    await expect(checkForAppUpdate()).resolves.toMatchObject({ releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/v0.2.0" });
  });

  it.each(["0.2.0-beta.1", "../../latest", "0.2.0/path"])("rejects invalid stable version %s and closes its resource", async (version) => {
    mocks.check.mockResolvedValue({ ...fakeUpdate, version });
    const { checkForAppUpdate, getPendingAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).rejects.toThrow("Invalid stable update version");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(getPendingAppUpdate()).toBeNull();
  });

  it.each(["windows", "macos"] as const)("only offers beta installers usable on %s", async (platform) => {
    if (platform === "macos") useMac();
    const ownRelease = betaRelease("0.4.0-beta.1", platform);
    const otherRelease = betaRelease("0.5.0-beta.1", platform === "macos" ? "windows" : "macos");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [otherRelease, ownRelease] })));
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate("beta")).resolves.toMatchObject({ version: "0.4.0-beta.1", platform, automaticInstall: false });
  });

  it("ignores missing, empty, wrong-version or foreign beta assets and derives safe release links", async () => {
    const valid = betaRelease("0.4.0-beta.1");
    const foreign = betaRelease("0.5.0-beta.1");
    foreign.assets[0].browser_download_url = "https://evil.test/installer.exe";
    const wrongTag = betaRelease("0.6.0-beta.1");
    wrongTag.assets[0].browser_download_url = wrongTag.assets[0].browser_download_url.replace("/v0.6.0-beta.1/", "/v0.9.0-beta.1/");
    const empty = betaRelease("0.7.0-beta.1");
    empty.assets[0].size = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [
      null, foreign, wrongTag, empty,
      { ...betaRelease("0.8.0-beta.1"), assets: [] },
      { ...betaRelease("0.9.0-beta.1"), draft: true },
      { ...valid, html_url: "https://evil.test/release" },
    ] })));
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate("beta")).resolves.toMatchObject({ version: "0.4.0-beta.1", releaseUrl: valid.html_url });
  });

  it("does not advertise a Windows-only beta to macOS", async () => {
    useMac();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [betaRelease("0.4.0-beta.1")] })));
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate("beta")).resolves.toBeNull();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("returns release metadata without prompting", async () => {
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate()).resolves.toEqual({
      version: "0.2.0",
      body: "A calmer update flow.",
      date: "2026-07-18T00:00:00Z",
      platform: "windows",
      channel: "stable",
      releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/v0.2.0",
      automaticInstall: true,
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

  it("discovers beta releases without feeding them to the automatic installer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [{ ...betaRelease("0.2.0-beta.1"), body: "Preview", published_at: "2026-07-19T00:00:00Z" }],
    })));
    const { checkForAppUpdate } = await import("./appUpdate");
    await expect(checkForAppUpdate("beta")).resolves.toMatchObject({ version: "0.2.0-beta.1", channel: "beta", automaticInstall: false });
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("reuses one in-flight stable check", async () => {
    let finish: (value: typeof fakeUpdate) => void = () => undefined;
    mocks.check.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { checkForAppUpdate } = await import("./appUpdate");

    const first = checkForAppUpdate("stable");
    const second = checkForAppUpdate("stable");
    expect(first).toBe(second);
    await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    finish(fakeUpdate);
    await expect(first).resolves.toMatchObject({ version: "0.2.0", channel: "stable" });
  });

  it("reuses one in-flight beta check", async () => {
    let finish: (value: unknown) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const { checkForAppUpdate } = await import("./appUpdate");

    const first = checkForAppUpdate("beta");
    const second = checkForAppUpdate("beta");
    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish({ ok: true, json: async () => [] });
    await expect(first).resolves.toBeNull();
  });

  it("selects the highest valid newer beta.N release", async () => {
    mocks.getVersion.mockResolvedValue("0.3.9");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        betaRelease("0.4.0-beta.2"),
        betaRelease("0.4.0-rc.1"),
        betaRelease("0.4.0-beta.10"),
        betaRelease("0.4.0-beta.01"),
        { prerelease: false, draft: false, tag_name: "v0.5.0", html_url: "https://example.test/stable" },
      ],
    })));
    const { checkForAppUpdate } = await import("./appUpdate");

    await expect(checkForAppUpdate("beta")).resolves.toMatchObject({
      version: "0.4.0-beta.10",
      releaseUrl: "https://github.com/silverlion2/quota-float/releases/tag/v0.4.0-beta.10",
      automaticInstall: false,
    });
  });

  it("times out a stalled beta request with a localized safe message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const { BETA_CHECK_TIMEOUT_MS, appUpdateErrorMessage, checkForAppUpdate } = await import("./appUpdate");

    const check = checkForAppUpdate("beta").then(() => null, (reason) => reason);
    await vi.advanceTimersByTimeAsync(BETA_CHECK_TIMEOUT_MS);
    const error = await check;
    expect(appUpdateErrorMessage(error, "en")).toBe("The Beta update check timed out. Please try again.");
    expect(appUpdateErrorMessage(error, "zh-CN")).toBe("Beta 更新检查超时，请稍后重试。");
  });

  it("cancels a beta check without surfacing an error and permits retry", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      calls += 1;
      if (calls === 2) return Promise.resolve({ ok: true, json: async () => [] });
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const { cancelAppUpdateCheck, checkForAppUpdate } = await import("./appUpdate");

    const cancelled = checkForAppUpdate("beta");
    cancelAppUpdateCheck();
    await expect(cancelled).resolves.toBeNull();
    await expect(checkForAppUpdate("beta")).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidates a late beta result when switching to stable", async () => {
    let finishBeta: (value: unknown) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishBeta = resolve; })));
    const { checkForAppUpdate } = await import("./appUpdate");

    const beta = checkForAppUpdate("beta");
    const stable = checkForAppUpdate("stable");
    finishBeta({
      ok: true,
      json: async () => [{ prerelease: true, draft: false, tag_name: "v9.0.0-beta.1", html_url: "https://example.test/late-beta" }],
    });

    await expect(beta).resolves.toBeNull();
    await expect(stable).resolves.toMatchObject({ channel: "stable", version: "0.2.0" });
  });

  it("closes a late native update when switching from stable to beta", async () => {
    let finishStable: (value: typeof fakeUpdate) => void = () => undefined;
    mocks.check.mockImplementationOnce(() => new Promise((resolve) => { finishStable = resolve; }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    const { checkForAppUpdate, getPendingAppUpdate } = await import("./appUpdate");

    const stable = checkForAppUpdate("stable");
    await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    const beta = checkForAppUpdate("beta");
    finishStable(fakeUpdate);

    await expect(stable).resolves.toBeNull();
    await expect(beta).resolves.toBeNull();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(getPendingAppUpdate()).toBeNull();
  });

  it("allows a failed check to be retried", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(fakeUpdate);
    const { checkForAppUpdate } = await import("./appUpdate");

    await expect(checkForAppUpdate("stable")).rejects.toThrow("offline");
    await expect(checkForAppUpdate("stable")).resolves.toMatchObject({ version: "0.2.0" });
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });

  it("preserves the active download sequence when the preferred channel changes", async () => {
    const { shouldInvalidateUpdateCheckOnChannelChange } = await import("./appUpdate");
    const updateSequence = { current: 7 };
    const capturedByDownload = updateSequence.current;

    if (shouldInvalidateUpdateCheckOnChannelChange("downloading")) updateSequence.current += 1;

    expect(updateSequence.current).toBe(capturedByDownload);
    expect(shouldInvalidateUpdateCheckOnChannelChange("ready")).toBe(false);
    expect(shouldInvalidateUpdateCheckOnChannelChange("installing")).toBe(false);
    expect(shouldInvalidateUpdateCheckOnChannelChange("checking")).toBe(true);
    expect(updateSequence.current === capturedByDownload).toBe(true);
  });
});
