import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./bridge";
import type { UpdateChannel } from "../types";

export const RELEASE_URL = "https://github.com/silverlion2/quota-float/releases/latest";

export type AppUpdatePlatform = "windows" | "macos";

export interface AppUpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
  platform: AppUpdatePlatform;
  channel: UpdateChannel;
  releaseUrl: string;
  automaticInstall: boolean;
}

export interface AppUpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

let pendingUpdate: Update | null = null;
let downloadPromise: Promise<void> | null = null;
let checkGeneration = 0;

interface CheckFlight {
  channel: UpdateChannel;
  generation: number;
  controller: AbortController | null;
  promise: Promise<AppUpdateInfo | null>;
}

let checkFlight: CheckFlight | null = null;

export const BETA_CHECK_TIMEOUT_MS = 15_000;

type UpdateCheckErrorCode = "beta-timeout" | "beta-unavailable";

class UpdateCheckError extends Error {
  constructor(readonly code: UpdateCheckErrorCode) {
    super(code);
    this.name = "UpdateCheckError";
  }
}

export function appUpdateErrorMessage(error: unknown, language: "zh-CN" | "en"): string {
  const code = error instanceof UpdateCheckError ? error.code : null;
  if (language === "zh-CN") {
    return code === "beta-timeout"
      ? "Beta 更新检查超时，请稍后重试。"
      : "更新检查暂时不可用，请稍后重试或打开 GitHub Releases。";
  }
  return code === "beta-timeout"
    ? "The Beta update check timed out. Please try again."
    : "The update check is temporarily unavailable. Try again or open GitHub Releases.";
}

export function shouldInvalidateUpdateCheckOnChannelChange(phase: string): boolean {
  return !["downloading", "ready", "installing"].includes(phase);
}

function updatePlatform(): AppUpdatePlatform {
  return /Macintosh|Mac OS X/i.test(navigator.userAgent) ? "macos" : "windows";
}

function updateInfo(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    body: update.body?.trim() || null,
    date: update.date ?? null,
    platform: updatePlatform(),
    channel: "stable",
    releaseUrl: RELEASE_URL,
    automaticInstall: updatePlatform() === "windows",
  };
}

export function getPendingAppUpdate(): AppUpdateInfo | null {
  return pendingUpdate ? updateInfo(pendingUpdate) : null;
}

export async function openReleasePage(url = RELEASE_URL): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

interface SemverParts {
  base: [number, number, number];
  beta: number | null;
}

function semverParts(value: string): SemverParts | null {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.exec(value);
  if (!match) return null;
  const values = match.slice(1, 5).map((part) => part === undefined ? null : Number(part));
  if (values.some((part) => part !== null && !Number.isSafeInteger(part))) return null;
  return { base: values.slice(0, 3) as [number, number, number], beta: values[3] };
}

function compareVersions(left: SemverParts, right: SemverParts): number {
  for (let index = 0; index < 3; index += 1) {
    if (left.base[index] !== right.base[index]) return left.base[index] - right.base[index];
  }
  if (left.beta === null) return right.beta === null ? 0 : 1;
  if (right.beta === null) return -1;
  return left.beta - right.beta;
}

interface GithubRelease {
  prerelease?: boolean;
  draft?: boolean;
  tag_name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
}

function highestBetaRelease(releases: GithubRelease[], currentVersion: string): GithubRelease | null {
  const current = semverParts(currentVersion);
  if (!current) return null;
  return releases
    .map((release) => ({ release, version: release.tag_name ? semverParts(release.tag_name) : null }))
    .filter((candidate): candidate is { release: GithubRelease; version: SemverParts } => (
      candidate.release.prerelease === true
      && candidate.release.draft !== true
      && Boolean(candidate.release.html_url)
      && candidate.version?.beta !== null
      && candidate.version !== null
    ))
    .filter((candidate) => compareVersions(candidate.version, current) > 0)
    .sort((left, right) => compareVersions(right.version, left.version))[0]?.release ?? null;
}

async function checkBetaUpdate(controller: AbortController): Promise<AppUpdateInfo | null> {
  const { signal } = controller;
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    if (!signal.aborted) controller.abort();
  }, BETA_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.github.com/repos/silverlion2/quota-float/releases?per_page=20", {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (signal.aborted) {
      if (timedOut) throw new UpdateCheckError("beta-timeout");
      return null;
    }
    if (!response.ok) throw new UpdateCheckError("beta-unavailable");
    const payload: unknown = await response.json().catch(() => null);
    if (signal.aborted) {
      if (timedOut) throw new UpdateCheckError("beta-timeout");
      return null;
    }
    if (!Array.isArray(payload)) throw new UpdateCheckError("beta-unavailable");
    const { getVersion } = await import("@tauri-apps/api/app");
    const current = await getVersion();
    if (signal.aborted) {
      if (timedOut) throw new UpdateCheckError("beta-timeout");
      return null;
    }
    const release = highestBetaRelease(payload as GithubRelease[], current);
    if (!release?.tag_name || !release.html_url) return null;
    const version = release.tag_name.replace(/^v/, "");
    return { version, body: release.body?.trim() || null, date: release.published_at ?? null, platform: updatePlatform(), channel: "beta", releaseUrl: release.html_url, automaticInstall: false };
  } catch (error) {
    if (signal.aborted && timedOut) throw new UpdateCheckError("beta-timeout");
    if (signal.aborted) return null;
    if (error instanceof UpdateCheckError) throw error;
    throw new UpdateCheckError("beta-unavailable");
  } finally {
    window.clearTimeout(timeout);
  }
}

function invalidateCheck(): void {
  checkGeneration += 1;
  const flight = checkFlight;
  checkFlight = null;
  flight?.controller?.abort();
}

export function cancelAppUpdateCheck(): void {
  invalidateCheck();
}

export function checkForAppUpdate(channel: UpdateChannel = "stable"): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (checkFlight?.channel === channel) return checkFlight.promise;

  invalidateCheck();
  if (channel === "beta") invalidatePendingUpdate();
  if (channel === "stable" && pendingUpdate) return Promise.resolve(updateInfo(pendingUpdate));
  const generation = checkGeneration;
  const controller = channel === "beta" ? new AbortController() : null;
  const promise = (async () => {
    if (channel === "beta") return checkBetaUpdate(controller!);
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 15_000 });
    if (generation !== checkGeneration) {
      if (update) await Promise.resolve(update.close()).catch(() => undefined);
      return null;
    }
    pendingUpdate = update;
    return update ? updateInfo(update) : null;
  })().then((result) => generation === checkGeneration ? result : null)
    .finally(() => {
      if (checkFlight?.generation === generation) checkFlight = null;
    });
  checkFlight = { channel, generation, controller, promise };
  return promise;
}

function invalidatePendingUpdate(): void {
  const update = pendingUpdate;
  pendingUpdate = null;
  if (update) {
    void Promise.resolve(update.close()).catch(() => undefined);
  }
}

function reportProgress(
  event: DownloadEvent,
  current: { downloadedBytes: number; totalBytes: number | null },
  onProgress: (progress: AppUpdateProgress) => void,
) {
  if (event.event === "Started") {
    current.totalBytes = event.data.contentLength ?? null;
    current.downloadedBytes = 0;
  } else if (event.event === "Progress") {
    current.downloadedBytes += event.data.chunkLength;
  } else {
    if (current.totalBytes !== null) current.downloadedBytes = current.totalBytes;
  }
  onProgress({
    ...current,
    percent: current.totalBytes && current.totalBytes > 0
      ? Math.min(100, Math.round((current.downloadedBytes / current.totalBytes) * 100))
      : event.event === "Finished" ? 100 : null,
  });
}

export async function downloadAppUpdate(onProgress: (progress: AppUpdateProgress) => void): Promise<void> {
  if (!pendingUpdate) throw new Error("No app update is ready to download.");
  if (updatePlatform() === "macos") throw new Error("macOS updates are downloaded from GitHub Releases.");
  if (downloadPromise) return downloadPromise;

  const current = { downloadedBytes: 0, totalBytes: null as number | null };
  downloadPromise = pendingUpdate.download((event) => reportProgress(event, current, onProgress), { timeout: 5 * 60_000 });
  try {
    await downloadPromise;
  } finally {
    downloadPromise = null;
  }
}

export async function installAppUpdate(): Promise<void> {
  if (!pendingUpdate) throw new Error("No downloaded app update is ready to install.");
  await pendingUpdate.install();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export async function discardAppUpdate(): Promise<void> {
  invalidateCheck();
  const update = pendingUpdate;
  pendingUpdate = null;
  if (update) await Promise.resolve(update.close()).catch(() => undefined);
}
