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
let checkPromise: Promise<AppUpdateInfo | null> | null = null;
let downloadPromise: Promise<void> | null = null;

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

function semverParts(value: string): { base: number[]; beta: number | null } {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(value.replace(/^v/, ""));
  return match
    ? { base: match.slice(1, 4).map(Number), beta: match[4] ? Number(match[4]) : null }
    : { base: [0, 0, 0], beta: null };
}

function isNewerVersion(candidate: string, current: string): boolean {
  const left = semverParts(candidate);
  const right = semverParts(current);
  for (let index = 0; index < 3; index += 1) {
    if (left.base[index] !== right.base[index]) return left.base[index] > right.base[index];
  }
  if (left.beta === null) return right.beta !== null;
  if (right.beta === null) return false;
  return left.beta > right.beta;
}

async function checkBetaUpdate(): Promise<AppUpdateInfo | null> {
  const response = await fetch("https://api.github.com/repos/silverlion2/quota-float/releases?per_page=20", { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Beta update check failed (${response.status}).`);
  const releases = await response.json() as Array<{ prerelease?: boolean; draft?: boolean; tag_name?: string; body?: string; published_at?: string; html_url?: string }>;
  const release = releases.find((item) => item.prerelease && !item.draft && item.tag_name && item.html_url);
  if (!release?.tag_name || !release.html_url) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  const current = await getVersion();
  const version = release.tag_name.replace(/^v/, "");
  if (!isNewerVersion(version, current)) return null;
  return { version, body: release.body?.trim() || null, date: release.published_at ?? null, platform: updatePlatform(), channel: "beta", releaseUrl: release.html_url, automaticInstall: false };
}

export async function checkForAppUpdate(channel: UpdateChannel = "stable"): Promise<AppUpdateInfo | null> {
  if (channel === "beta") return isTauri() ? checkBetaUpdate() : null;
  if (pendingUpdate) return updateInfo(pendingUpdate);
  if (!isTauri()) return null;
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 15_000 });
    pendingUpdate = update;
    return update ? updateInfo(update) : null;
  })();
  try {
    return await checkPromise;
  } finally {
    checkPromise = null;
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
  const update = pendingUpdate;
  pendingUpdate = null;
  checkPromise = null;
  downloadPromise = null;
  if (update) await Promise.resolve(update.close()).catch(() => undefined);
}
